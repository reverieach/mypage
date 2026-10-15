/* Resumable, bounded-memory file transport. No file bytes are sent to the relay. */
class DirectFiles {
  static limit = 2 * 1024 ** 3;
  static block = 256 * 1024;
  constructor({hash, progress, complete}) {
    this.hash = hash; this.progress = progress; this.complete = complete; this.entries = new Map();
  }
  async open(meta, peer) {
    if (!/^[a-f0-9-]{36}$/i.test(meta.id) || !Number.isSafeInteger(meta.size) || meta.size < 0 || meta.size > DirectFiles.limit ||
        typeof meta.name !== 'string' || meta.name.length > 180 || !/^[a-f0-9]{64}$/.test(meta.fingerprint || '')) throw new Error('无效的直传文件信息');
    const existing = this.entries.get(meta.id);
    if (existing) {
      if (existing.peer !== peer || existing.meta.size !== meta.size || existing.meta.name !== meta.name || existing.meta.fingerprint !== meta.fingerprint) throw new Error('续传文件或发送设备不匹配');
      if (existing.active) throw new Error('此文件正在另一条通道接收');
      existing.touched = Date.now(); return existing;
    }
    if (this.entries.size >= 10 || [...this.entries.values()].reduce((sum, e) => sum + e.meta.size, 0) + meta.size > 4 * 1024 ** 3) throw new Error('请先保存并移除已接收文件');
    const entry = {meta, peer, offset:0, touched:Date.now(), chunks:[], active:false};
    // Reserve before async storage work so simultaneous offers cannot bypass the limit.
    this.entries.set(meta.id, entry); entry.active = true;
    try {
      if (navigator.storage?.getDirectory) {
        const quota = await navigator.storage.estimate();
        if (quota.quota - quota.usage < meta.size * 2 + 16 * 1024 ** 2) throw new Error('浏览器本地暂存空间不足，请清理空间后重试');
        const root = await navigator.storage.getDirectory();
        entry.dir = await root.getDirectoryHandle('mypage-direct-v2', {create:true});
        entry.path = `${Date.now()}-${meta.id}`;
        entry.handle = await entry.dir.getFileHandle(entry.path, {create:true});
        if (entry.handle.createWritable) { entry.writer = await entry.handle.createWritable(); entry.disk = true; }
      }
      if (!entry.writer && meta.size > 32 * 1024 ** 2) throw new Error('接收浏览器不支持大文件落盘，请使用新版 Edge/Chrome 接收；内存接收上限 32 MiB');
      if (!entry.writer && [...this.entries.values()].filter(e=>!e.disk).reduce((sum,e)=>sum+e.meta.size,0) > 64 * 1024 ** 2) throw new Error('内存接收已满，请先保存并移除文件');
      entry.active = false; return entry;
    } catch (error) { await this.remove(meta.id); throw error; }
  }
  async append(entry, offset, bytes, digest) {
    if (entry.done || offset !== entry.offset || bytes.byteLength !== Math.min(DirectFiles.block, entry.meta.size - offset)) throw new Error('分块顺序或大小不正确');
    if (await this.hash(bytes) !== digest) throw new Error('分块校验失败，请重新发送');
    if (entry.writer) await entry.writer.write({type:'write', position:offset, data:bytes});
    else entry.chunks.push(new Blob([bytes]));
    entry.offset += bytes.byteLength; entry.touched = Date.now();
  }
  async finish(entry) {
    if (entry.offset !== entry.meta.size) throw new Error('文件尚未接收完整');
    if (!entry.done) {
      if (entry.writer) { await entry.writer.close(); entry.writer = null; entry.blob = await entry.handle.getFile(); }
      else { entry.blob = new Blob(entry.chunks); entry.chunks = []; }
      entry.done = true;
    }
    return entry.blob;
  }
  async remove(id) {
    const entry = this.entries.get(id); if (!entry) return;
    this.entries.delete(id);
    try { await entry.writer?.abort(); } catch { /* already closed */ }
    if (entry.dir && entry.path) await entry.dir.removeEntry(entry.path).catch(()=>{});
  }
  async expire() {
    for (const [id, entry] of this.entries) if (!entry.active && !entry.done && Date.now() - entry.touched > 600000) await this.remove(id);
  }
  async cleanupOldFiles() {
    if (!navigator.storage?.getDirectory) return;
    try {
      const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('mypage-direct-v2');
      for await (const [name] of dir.entries()) if (/^\d{13}-[a-f0-9-]{36}$/i.test(name) && Date.now() - Number(name.slice(0,13)) > 86400000) await dir.removeEntry(name);
    } catch { /* empty directory, private mode, or unavailable storage */ }
  }
  async fingerprint(file) {
    const first = await file.slice(0, 65536).arrayBuffer(), last = await file.slice(Math.max(0,file.size-65536)).arrayBuffer();
    return this.hash(await new Blob([String(file.size), String(file.lastModified || 0), first, last]).arrayBuffer());
  }
  receive(session, channel, first) {
    clearTimeout(session.timer); channel.binaryType = 'arraybuffer';
    let entry, chunks = [], bytes = 0, closed = false, chain = Promise.resolve(), queued = 0, timer;
    const touch = () => { clearTimeout(timer); timer = setTimeout(()=>session.close(),60000); };
    const reply = data => { if (channel.readyState === 'open') channel.send(JSON.stringify(data)); };
    const close = () => {
      if (closed) return;
      closed = true; clearTimeout(timer); chunks = [];
      chain.finally(()=>{ if (entry) { entry.active = false; entry.touched = Date.now(); } });
      session.close();
    };
    channel.onclose = close; channel.onerror = close;
    const process = async data => {
      if (closed) return;
      touch();
      if (!entry) {
        const meta = JSON.parse(data);
        if (meta.type !== 'begin' || meta.version !== 2 || meta.kind !== 'file') throw new Error('直传协议不匹配，请刷新两端页面');
        entry = await this.open(meta, session.peer);
        if (closed) return;
        entry.active = true;
        reply({type:'accepted',version:2,offset:entry.offset}); return;
      }
      if (typeof data !== 'string') {
        if (data.byteLength > 16384 || bytes + data.byteLength > DirectFiles.block || entry.offset + bytes + data.byteLength > entry.meta.size) throw new Error('直传分块超限');
        chunks.push(data); bytes += data.byteLength; return;
      }
      const value = JSON.parse(data);
      if (value.type === 'block') {
        const buffer = await new Blob(chunks).arrayBuffer();
        await this.append(entry, value.offset, buffer, value.digest); chunks = []; bytes = 0;
        reply({type:'ack',offset:entry.offset});
        this.progress(entry.offset / Math.max(entry.meta.size,1)*100, `正在直连接收 ${entry.meta.name} · ${(entry.offset/1024**2).toFixed(1)} MiB`);
      } else if (value.type === 'end') {
        if (bytes) throw new Error('最后一个分块未确认');
        const blob = await this.finish(entry);
        if (closed) return;
        this.complete(entry.meta, session.peer, blob);
        reply({type:'complete',offset:entry.offset});
      } else throw new Error('无效的直传消息');
    };
    channel.onmessage = event => {
      const length = typeof event.data === 'string' ? event.data.length : event.data.byteLength;
      queued += length;
      if (queued > DirectFiles.block + 65536 || (typeof event.data === 'string' && length > 65536)) return close();
      chain = chain.then(()=>process(event.data)).catch(error=>{reply({error:error.message,fatal:true}); close();}).finally(()=>{queued -= length;});
    };
    touch(); channel.onmessage(first);
  }
  async send(session, item, file) {
    clearTimeout(session.timer);
    const channel = session.channel;
    let pending, timer;
    const fail = error => { clearTimeout(timer); if (pending) { pending.reject(error); pending = null; } };
    session.cancel = fail;
    channel.onclose = () => fail(new Error('直连已中断，保留已确认分块'));
    channel.onerror = () => fail(new Error('直连网络异常'));
    channel.onmessage = event => {
      try {
        const value = JSON.parse(event.data);
        if (value.error) return fail(Object.assign(new Error(value.error),{fatal:!!value.fatal}));
        if (pending && value.type === pending.type) { const p = pending; pending = null; clearTimeout(timer); p.resolve(value); }
      } catch { fail(Object.assign(new Error('无效的直传应答'),{fatal:true})); }
    };
    const wait = type => {
      const promise = new Promise((resolve,reject)=>{ pending = {type,resolve,reject}; timer = setTimeout(()=>fail(new Error('60 秒未收到确认，尝试续传')),60000); });
      promise.catch(()=>{}); return promise;
    };
    try {
      const accepted = wait('accepted'); channel.send(JSON.stringify({...item,type:'begin',version:2}));
      const resume = await accepted;
      if (resume.version !== 2) throw Object.assign(new Error('接收页面版本过旧，请刷新后重试'),{fatal:true});
      let offset = resume.offset;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size || (offset !== file.size && offset % DirectFiles.block !== 0)) throw Object.assign(new Error('无效的续传位置'),{fatal:true});
      while (offset < file.size) {
        const bytes = await file.slice(offset, offset + DirectFiles.block).arrayBuffer();
        const digest = await this.hash(bytes), ack = wait('ack');
        for (let pos=0; pos<bytes.byteLength; pos+=16384) {
          if (channel.readyState !== 'open') throw new Error('直连已中断');
          channel.send(bytes.slice(pos,pos+16384));
        }
        channel.send(JSON.stringify({type:'block',offset,digest}));
        const result = await ack;
        if (result.offset !== offset + bytes.byteLength) throw Object.assign(new Error('接收位置不一致'),{fatal:true});
        offset = result.offset;
        this.progress(offset / Math.max(file.size,1)*100, `直传 ${file.name} · 已确认 ${(offset/1024**2).toFixed(1)} MiB`);
      }
      const completed = wait('complete'); channel.send(JSON.stringify({type:'end'}));
      if ((await completed).offset !== file.size) throw Object.assign(new Error('文件完成确认不一致'),{fatal:true});
      this.progress(100,'对方已完整接收并逐块校验 · 文件未上传云端');
    } finally { clearTimeout(timer); session.cancel = null; session.close(); }
  }
}
