/* Same client on phones and in MyPage. File bytes never enter the signaling socket. */
const $ = (id) => document.getElementById(id);
const KEY = 'mypage-share-device-v1';
const DIRECT_LIMIT = DirectFiles.limit;
let identity = null, socket = null, heartbeat = null, reconnect = null, busy = false;
let roster = [], cloudItems = [], received = [], directBytes = 0;
const sessions = new Map();
const imageCache = new Map();
const IMAGE_CACHE_LIMIT = 64 * 1024 * 1024;
let pendingFile = null;
let lanStunUrls = [];
const directFiles = new DirectFiles({hash, progress, complete(meta, peer, blob) {
  if (!identity || received.some(item => item.id === meta.id)) return;
  received.unshift({...meta, direct:true, sender:peer, recipient:identity.id, created:Date.now()/1000, blob, url:URL.createObjectURL(blob), resumable:true});
  renderItems(); progress(100, `已直连接收 ${meta.name}，请保存到文件夹`);
}});
directFiles.cleanupOldFiles();
window.addEventListener('message', event => {
  if (event.source !== window.parent || window.parent === window || event.data?.type !== 'mypage-lan-stun') return;
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(event.origin) && !['http://127.0.0.1:3217','http://localhost:5173','http://127.0.0.1:5173'].includes(event.origin)) return;
  lanStunUrls = (Array.isArray(event.data.urls) ? event.data.urls : []).filter(url => {
    const match = /^stun:(\d+\.\d+\.\d+\.\d+):3220$/.exec(url);
    if (!match) return false;
    const ip = match[1].split('.').map(Number);
    return ip.every(n=>n>=0 && n<=255) && (ip[0] === 10 || (ip[0] === 172 && ip[1]>=16 && ip[1]<=31) || (ip[0] === 192 && ip[1] === 168));
  }).slice(0,4);
  $('lanHint').textContent = lanStunUrls.length ? '局域网辅助已连接 · 仅探测地址，不中转文件' : '本机局域网辅助未运行，VPN 环境下直连可能失败';
});
if (window.parent && window.parent !== window) window.parent.postMessage({type:'mypage-share-ready'}, '*');
try { identity = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* private browsing */ }
if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embed');

function message(text) { $('message').textContent = text; $('message').classList.toggle('visible', !!text); }
function size(n) { return n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MiB` : `${Math.ceil(n / 1024)} KiB`; }
function deviceName(id) { return roster.find((d) => d.id === id)?.name || '设备'; }
function progress(value, text) { $('progress').hidden = false; $('progress').value = value; $('progressText').textContent = text; }
function remember() {
  try { if (identity) localStorage.setItem(KEY, JSON.stringify(identity)); else localStorage.removeItem(KEY); }
  catch { message('浏览器不允许保存配对信息；本次仍可使用，下次可能需要重新配对。'); }
}
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers: {...options.headers, Authorization: `Bearer ${identity?.token || ''}`}});
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/pair') logout();
    throw new Error(error.detail || `请求失败 (${response.status})`);
  }
  return response.json();
}
function post(path, value) { return api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value)}); }
function logout() {
  clearImages(new Set());
  for (const item of received) if (item.url) URL.revokeObjectURL(item.url);
  for (const id of directFiles.entries.keys()) directFiles.remove(id).catch(()=>{});
  received = []; cloudItems = []; directBytes = 0; pendingFile = null; $('resumeFile').hidden = true; $('cancelResume').hidden = true;
  identity = null; remember(); clearTimeout(reconnect); clearInterval(heartbeat);
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  for (const session of sessions.values()) session.close();
  sessions.clear(); $('login').hidden = false; $('workspace').hidden = true; $('refresh').hidden = true;
}
function signal(value) {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('直连协调服务暂未连接');
  socket.send(JSON.stringify(value));
}
function connect() {
  if (!identity) return;
  const token = identity.token;
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.onopen = () => socket.send(JSON.stringify({token}));
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'ready') {
      $('status').textContent = '已连接 · 直连优先 / 云端兜底';
      clearInterval(heartbeat);
      heartbeat = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'ping'})); }, 15000);
      refresh().catch((e) => message(e.message));
    } else if (data.type === 'offer') {
      acceptOffer(data).catch(() => { try { signal({type:'reject', to:data.from, session:data.session}); } catch { /* disconnected */ } });
    } else if (data.type === 'answer' || data.type === 'reject') {
      const session = sessions.get(data.session);
      if (!session || session.peer !== data.from) return;
      if (data.type === 'reject') session.close(new Error('对方未能建立直连，请稍后重试或使用云端'));
      else { session.answerReceived = true; session.pc.setRemoteDescription({type:'answer', sdp:data.sdp}).catch(() => session.close(new Error('直连应答无效，请刷新两端页面后重试'))); }
    }
  };
  socket.onclose = (event) => {
    clearInterval(heartbeat);
    $('status').textContent = '直连协调已断开 · 可尝试云端';
    if (event.code === 4001) { message('此设备在另一个页面上线。请只保留一个传输页面，或刷新此页接管。'); return; }
    if (identity?.token === token) reconnect = setTimeout(connect, 5000);
  };
}
async function refresh() {
  if (!identity) return;
  const result = await api('/api/devices');
  roster = result.devices;
  const selected = $('target').value;
  $('target').replaceChildren();
  for (const device of roster.filter((d) => d.id !== result.self)) {
    const option = document.createElement('option'); option.value = device.id;
    option.textContent = `${device.name} · ${device.online ? '页面在线' : '离线，可云暂存'}`;
    $('target').append(option);
  }
  if (roster.some((d) => d.id === selected && d.id !== result.self)) $('target').value = selected;
  if (!$('target').options.length) $('target').add(new Option('请先添加另一台设备', ''));
  $('usage').textContent = `本服务文件下载预算：${size(result.usage)} / ${size(result.budget)}（不是阿里云账单总流量）`;
  cloudItems = (await api('/api/items')).items;
  renderItems();
}
function showApp() {
  $('login').hidden = true; $('workspace').hidden = false; $('refresh').hidden = false;
  $('deviceName').textContent = identity.name;
  connect(); refresh().catch((e) => message(e.message));
}
function gathering(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', change); resolve(); };
    const change = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, 2500); pc.addEventListener('icegatheringstatechange', change);
  });
}
function makeSession(id, peer) {
  if (sessions.size >= 4) throw new Error('直连会话过多');
  // Optional LAN-only STUN discovers the physical address behind VPN routing. Never TURN.
  const pc = new RTCPeerConnection({iceServers:lanStunUrls.map(urls=>({urls}))});
  const session = {pc, peer, id, channel:null, closed:false, close(error = new Error('直连断开，请重新发送（不会自动重传到云端）')) {
    if (session.closed) return;
    session.closed = true;
    clearTimeout(session.timer); clearTimeout(session.handshakeTimer); pc.close(); sessions.delete(id);
    session.openReject?.(error);
    session.cancel?.(error);
  }};
  session.timer = setTimeout(() => session.close(), 180000);
  sessions.set(id, session); return session;
}
async function directDiagnostic(session) {
  const pc = session.pc;
  const candidates = (description) => description?.sdp.match(/^a=candidate:.*$/gm) || [];
  const local = candidates(pc.localDescription), remote = candidates(pc.remoteDescription);
  let pairs = [], synthetic = 0;
  try { (await pc.getStats()).forEach((stat) => {
    if (stat.type === 'candidate-pair') pairs.push(`${stat.state}[请求${stat.requestsSent || 0}/响应${stat.responsesReceived || 0}]`);
    if (stat.type === 'remote-candidate' && /^198\.(18|19)\./.test(stat.address || '')) synthetic++;
  }); } catch { /* closed */ }
  return `ICE ${pc.iceConnectionState}；本地/远端候选 ${local.length}/${remote.length}；mDNS ${local.filter((c) => c.includes('.local')).length}/${remote.filter((c) => c.includes('.local')).length}；候选对 ${pairs.join(',') || '无'}${synthetic ? `；测试网段远端 ${synthetic}` : ''}；对方${session.answerReceived ? '已' : '未'}应答`;
}
async function openDirect(peer) {
  if (!window.RTCPeerConnection || !roster.find((d) => d.id === peer)?.online) throw new Error('对方页面未在线');
  const session = makeSession(crypto.randomUUID(), peer);
  const channel = session.channel = session.pc.createDataChannel('mypage-file', {ordered:true});
  try {
    const opened = new Promise((resolve, reject) => {
      session.openReject = reject;
      session.handshakeTimer = setTimeout(async () => {
        reject(new Error(`直连未建立（${await directDiagnostic(session)}）。可改用云端；诊断不包含 IP 或凭证。`));
      }, 12000);
      channel.onopen = () => { clearTimeout(session.handshakeTimer); session.openReject = null; resolve(); };
      channel.onerror = () => reject(new Error('直连失败'));
      channel.onclose = () => reject(new Error('直连通道已关闭'));
    });
    // Attach a handler immediately to avoid an unhandled rejection while gathering ICE.
    opened.catch(() => {});
    await session.pc.setLocalDescription(await session.pc.createOffer()); await gathering(session.pc);
    if (session.closed) { await opened; throw new Error('直连会话已关闭'); }
    signal({type:'offer', to:peer, session:session.id, sdp:session.pc.localDescription.sdp});
    await opened; return session;
  } catch (error) {
    // Release the receiver's slot immediately instead of leaving failed attempts for 3 minutes.
    try { signal({type:'reject', to:peer, session:session.id}); } catch { /* disconnected */ }
    session.close(error); throw error;
  }
}
async function hash(bytes) {
  const value = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2,'0')).join('');
}
async function acceptOffer(data) {
  if (sessions.has(data.session)) return;
  const session = makeSession(data.session, data.from);
  session.pc.ondatachannel = (event) => receiveChannel(session, event.channel);
  try {
    await session.pc.setRemoteDescription({type:'offer', sdp:data.sdp});
    await session.pc.setLocalDescription(await session.pc.createAnswer()); await gathering(session.pc);
    signal({type:'answer', to:data.from, session:data.session, sdp:session.pc.localDescription.sdp});
  } catch (error) { session.close(); throw error; }
}
function receiveChannel(session, channel) {
  channel.binaryType = 'arraybuffer';
  let meta = null, chunks = [], bytes = 0, finishing = false;
  const fail = () => { chunks = []; try { channel.send(JSON.stringify({error:'接收失败或文件超限'})); } catch { /* closed */ } session.close(); };
  channel.onclose = () => { chunks = []; session.close(); };
  channel.onmessage = async (event) => {
    try {
      if (finishing) return;
      if (typeof event.data !== 'string') {
        if (!meta || meta.kind !== 'file' || bytes + event.data.byteLength > meta.size) return fail();
        bytes += event.data.byteLength; chunks.push(event.data);
        progress(bytes / Math.max(meta.size,1) * 100, `正在直连接收 ${meta.name} · ${size(bytes)}`); return;
      }
      if (event.data.length > 65536) return fail();
      const value = JSON.parse(event.data);
      if (!meta && value.type === 'begin' && value.version === 2 && value.kind === 'file') { directFiles.receive(session, channel, event); return; }
      if (value.type === 'begin') {
        if (meta || !['file','text'].includes(value.kind) || !Number.isInteger(value.size) || value.size < 0 || value.size > 32 * 1024 * 1024 || String(value.name).length > 180) return fail();
        if (value.kind === 'text' && new TextEncoder().encode(value.text || '').length > 16384) return fail();
        if (directBytes + value.size > 64 * 1024 * 1024 || received.length >= 30) {
          channel.send(JSON.stringify({error:'请接收端先移除已保存的直连内容'})); session.close(); return;
        }
        meta = value; channel.send(JSON.stringify({type:'accepted'}));
      } else if (value.type === 'end' && meta) {
        finishing = true;
        if (meta.kind === 'file' && bytes !== meta.size) return fail();
        let blob = null;
        if (meta.kind === 'file') {
          blob = new Blob(chunks, {type:'application/octet-stream'}); chunks = [];
          if (await hash(await blob.arrayBuffer()) !== meta.digest) return fail();
        }
        if (!received.some((item) => item.id === meta.id)) {
          received.unshift({...meta, direct:true, sender:session.peer, recipient:identity.id, created:Date.now()/1000,
                            blob, url:blob ? URL.createObjectURL(blob) : null});
          directBytes += meta.size;
        }
        renderItems(); progress(100, `已直连接收 ${meta.name}，请及时保存`);
        channel.send(JSON.stringify({type:'complete'}));
      }
    } catch { fail(); }
  };
}
async function sendDirect(session, item, file) {
  if (file) return sendResumableFile(session, item, file);
  const channel = session.channel;
  let acceptedResolve, completeResolve, rejectTransfer;
  const accepted = new Promise((resolve, reject) => { acceptedResolve = resolve; rejectTransfer = reject; });
  const completed = new Promise((resolve, reject) => { completeResolve = resolve; session.cancel = reject; });
  completed.catch(() => {});
  channel.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.error) { rejectTransfer(new Error(data.error)); session.cancel(new Error(data.error)); }
    if (data.type === 'accepted') acceptedResolve();
    if (data.type === 'complete') completeResolve();
  };
  channel.onclose = () => { rejectTransfer(new Error('直连中断')); session.cancel?.(new Error('直连中断，请重新发送')); };
  const deadline = setTimeout(() => { rejectTransfer(new Error('接收超时')); session.cancel?.(new Error('接收超时')); }, 120000);
  try {
    channel.send(JSON.stringify({...item, type:'begin', digest:''}));
    await accepted;
    channel.send(JSON.stringify({type:'end'})); await completed;
    progress(100, '对方已确认接收 · 文件没有上传云端');
  } finally { clearTimeout(deadline); session.cancel = null; session.close(); }
}
async function sendResumableFile(session, item, file) {
  pendingFile = {item, file}; $('resumeFile').hidden = true; $('cancelResume').hidden = true;
  try {
    item.fingerprint ||= await directFiles.fingerprint(file);
    for (let attempt=0; attempt<3; attempt++) {
      try {
        if (!session) session = await openDirect(item.recipient);
        await directFiles.send(session, item, file);
        pendingFile = null; return;
      } catch (error) {
        session?.close(); session = null;
        if (error.fatal || attempt === 2) throw error;
        progress(0, `直连中断，正在第 ${attempt+1} 次重连；从已确认分块继续，不上传云端`);
        await new Promise(resolve=>setTimeout(resolve, 1000*(attempt+1)));
      }
    }
  } finally {
    session?.close(); $('resumeFile').hidden = !pendingFile; $('cancelResume').hidden = !pendingFile;
  }
}
function cloudUpload(id, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('PUT', `/api/items/${id}/file`);
    xhr.setRequestHeader('Authorization', `Bearer ${identity.token}`); xhr.timeout = 300000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(event.loaded/event.total*100, `云端上传 ${file.name}`); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else { let detail = '上传失败'; try { detail = JSON.parse(xhr.responseText).detail || detail; } catch { /* proxy response */ } reject(new Error(detail)); }
    };
    xhr.onerror = xhr.ontimeout = () => reject(new Error('云上传中断，请重新选择文件发送'));
    xhr.send(file);
  });
}
async function send(file = null) {
  if (!identity || busy) return;
  const recipient = $('target').value, text = $('text').value.trim();
  if (!recipient) return message('请先添加并选择接收设备');
  if (!file && !text) return;
  if (file && pendingFile) throw new Error('请先继续或取消上次直传');
  if (file && file.size > DIRECT_LIMIT) throw new Error('直连文件不能超过 2 GiB');
  if (!file && new TextEncoder().encode(text).length > 16384) throw new Error('文字不能超过 16 KiB');
  const mode = $('mode').value;
  if (file && mode === 'cloud' && file.size > 200 * 1024 * 1024) throw new Error('云端仍限 200 MiB，大文件请选择直连');
  busy = true; $('sendText').disabled = true; $('files').disabled = true;
  const item = {id:crypto.randomUUID(), recipient, kind:file ? 'file' : 'text', name:file ? file.name.slice(0,180) : text.split('\n')[0].slice(0,80), text:file ? '' : text, size:file ? file.size : new TextEncoder().encode(text).length};
  try {
    message(''); progress(0,'正在选择传输通道…');
    let session = null;
    if (mode !== 'cloud' && item.size <= DIRECT_LIMIT) {
      $('channel').textContent = '尝试直连…';
      try { session = await openDirect(recipient); }
      catch (error) { if (mode === 'direct') throw error; message(`直连暂不可用，改为云端暂存。${error.message}`); }
    } else if (mode === 'direct') throw new Error('直连单文件上限 2 GiB');
    if (session) {
      $('channel').textContent = '设备直连 · 不上传云端';
      // Once bytes start flowing, never silently switch to cloud and create duplicates.
      await sendDirect(session, item, file);
    } else {
      if (item.size > 200 * 1024 * 1024) throw new Error('直连未建立：大于 200 MiB 的文件不会转到云端，请保持两端在线并检查局域网');
      $('channel').textContent = '云端暂存 · 24 小时有效';
      const record = await post('/api/items', item);
      try { if (file && !record.ready) await cloudUpload(item.id, file); }
      catch (error) { await api(`/api/items/${item.id}`, {method:'DELETE'}).catch(() => {}); throw error; }
      progress(100,'已存云端，接收端打开页面后可领取'); await refresh();
    }
    if (!file) $('text').value = '';
  } catch (error) {
    $('channel').textContent = '传输未完成'; progress($('progress').value, error.message); throw error;
  } finally { busy = false; $('sendText').disabled = false; $('files').disabled = false; }
}
function renderItems() {
  const list = $('items'); list.replaceChildren();
  const all = [...received, ...cloudItems].sort((a,b) => b.created-a.created);
  clearImages(new Set(all.map((item) => item.id)));
  if (!all.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '还没有共享内容'; list.append(empty); }
  for (const item of all) {
    const card = document.createElement('article'); card.className = item.kind === 'text' ? 'item text-item' : 'item';
    const title = document.createElement('div'); title.className = 'item-title'; title.textContent = item.name;
    const meta = document.createElement('div'); meta.className = 'sub';
    meta.textContent = `${deviceName(item.sender)} → ${deviceName(item.recipient)} · ${size(item.size)} · ${item.direct ? '直连，刷新后不保留' : '云端，24h 自动删除'}`;
    card.append(title, meta);
    if (imageType(item)) { card.classList.add('image-item'); addImagePreview(card, item); card.append(title, meta); }
    if (item.kind === 'text') { const preview = document.createElement('div'); preview.className = 'preview'; preview.textContent = item.text; card.append(preview); }
    const actions = document.createElement('div'); actions.className = 'actions';
    const save = document.createElement(item.direct && item.url ? 'a' : 'button');
    save.textContent = item.kind === 'text' ? '复制' : imageType(item) ? '保存图片' : '保存文件';
    if (item.direct && item.url) { save.href = item.url; save.download = item.name; }
    else save.onclick = async () => {
      try {
        if (item.kind === 'text') { await navigator.clipboard.writeText(item.text); message('已复制'); }
        else {
          save.disabled = true; save.textContent = '下载中…';
          const cached = imageCache.get(item.id);
          const blob = cached && !cached.error ? (await cached.promise).blob : await fileBlob(item);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = item.name; link.textContent = imageType(item) ? '保存图片' : '下载完成，点击保存';
          // Keep an explicit user-gesture download link for Safari and embedded pages.
          save.replaceWith(link); link.click(); setTimeout(() => URL.revokeObjectURL(url), 300000);
        }
      } catch (error) { message(error.message); save.textContent = '重试下载'; save.disabled = false; }
    };
    const remove = document.createElement('button'); remove.textContent = '移除'; remove.className = 'danger';
    remove.onclick = async () => {
      if (!confirm(item.direct ? '从此页移除？请确认已经保存。' : '删除云端内容？另一台设备将无法再领取。')) return;
      try {
        if (item.direct) { if (item.url) URL.revokeObjectURL(item.url); if (item.resumable) await directFiles.remove(item.id); else directBytes -= item.size; received = received.filter((entry) => entry !== item); renderItems(); }
        else { await api(`/api/items/${item.id}`, {method:'DELETE'}); await refresh(); }
      } catch (error) { message(error.message); }
    };
    actions.append(save);
    if (imageType(item)) {
      const copy = document.createElement('button'); copy.textContent = '复制图片';
      copy.onclick = async () => {
        try { copy.disabled = true; await copyImage(item); message('已复制图片，可粘贴到聊天或文档中（动图复制为静态图片）'); }
        catch (error) { message(`未能复制图片：${error.message}。可使用「保存图片」。`); }
        finally { copy.disabled = false; }
      };
      actions.append(copy);
    }
    if (imageType(item)) { remove.className = 'image-remove danger'; remove.setAttribute('aria-label', `移除 ${item.name}`); card.prepend(remove); }
    else actions.append(remove);
    card.append(actions); list.append(card);
  }
}
function imageType(item) {
  if (item.kind !== 'file') return '';
  const ext = item.name.split('.').pop().toLowerCase();
  return ({png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', avif:'image/avif', bmp:'image/bmp'})[ext] || '';
}
async function fileBlob(item) {
  if (item.direct) return item.blob;
  const response = await fetch(`/api/items/${item.id}/file`, {headers:{Authorization:`Bearer ${identity.token}`}});
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.detail || '下载失败'); }
  return response.blob();
}
function clearImages(keep) {
  for (const [id, entry] of imageCache) if (!keep.has(id)) {
    imageCache.delete(id);
    entry.promise.then((value) => URL.revokeObjectURL(value.url), () => {});
  }
}
function loadImage(item) {
  if (imageCache.has(item.id)) return imageCache.get(item.id).promise;
  const used = [...imageCache.values()].reduce((sum, entry) => sum + entry.size, 0);
  if (used + item.size > IMAGE_CACHE_LIMIT) return Promise.reject(new Error('图片预览内存限额已满，请保存原文件或刷新页面后重试'));
  const entry = {size:item.size, error:false};
  entry.promise = fileBlob(item).then((blob) => {
    // Never embed server URLs with credentials; only render authenticated raster blobs.
    blob = blob.slice(0, blob.size, imageType(item));
    return {blob, url:URL.createObjectURL(blob)};
  }).catch((error) => { entry.error = true; entry.size = 0; throw error; });
  imageCache.set(item.id, entry);
  return entry.promise;
}
function addImagePreview(card, item) {
  const box = document.createElement('div'); box.className = 'image-preview';
  const load = document.createElement('button'); load.className = 'pill';
  load.textContent = '加载图片预览（下载原图，消耗流量）'; box.append(load); card.append(box);
  const display = async () => {
    try {
      load.disabled = true;
      const {url} = await loadImage(item);
      const img = document.createElement('img'); img.alt = item.name; img.loading = 'lazy';
      img.onerror = () => { box.textContent = '此图片无法预览，请保存原文件查看'; };
      img.src = url; box.replaceChildren(img);
    } catch (error) { load.textContent = error.message; load.disabled = false; }
  };
  load.onclick = () => {
    if (imageCache.get(item.id)?.error) clearImages(new Set([...imageCache.keys()].filter((id) => id !== item.id)));
    display();
  };
  // Auto-preview small images only; the cache prevents repeat downloads on roster refresh.
  const used = [...imageCache.values()].reduce((sum, entry) => sum + entry.size, 0);
  if (imageCache.has(item.id) || (item.size <= 8 * 1024 * 1024 && used + item.size <= IMAGE_CACHE_LIMIT)) display();
}
async function imagePng(item) {
  const {url} = await loadImage(item);
  const img = new Image(); img.src = url; await img.decode();
  if (img.naturalWidth * img.naturalHeight > 32 * 1024 * 1024) throw new Error('图片像素过大，请保存原图');
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片转换失败')), 'image/png'));
}
function copyImage(item) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('当前浏览器不支持复制图片');
  // Start the write in the click handler; awaiting download first loses Safari's user gesture.
  const png = imagePng(item); png.catch(() => {});
  return navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
}
$('pair').onclick = async () => {
  try { identity = await post('/api/pair', {code:$('code').value, name:$('name').value}); $('code').value = ''; remember(); showApp(); }
  catch (error) { message(error.message); }
};
$('invite').onclick = async () => {
  try { const value = await post('/api/invite', {}); $('inviteCode').hidden = false; $('inviteCode').textContent = `单次配对码：${value.code}（10 分钟）`; }
  catch (error) { message(error.message); }
};
$('forget').onclick = async () => { if (confirm('取消当前设备的配对？')) { try { await api('/api/device', {method:'DELETE'}); logout(); } catch (error) { message(error.message); } } };
$('refresh').onclick = () => { refresh().catch((error) => message(error.message)); if (!socket || socket.readyState > 1) { clearTimeout(reconnect); connect(); } };
$('sendText').onclick = () => send().catch((error) => message(error.message));
$('resumeFile').onclick = async () => {
  if (!pendingFile || busy) return;
  busy = true; $('sendText').disabled = true; $('files').disabled = true;
  try { await sendResumableFile(null, pendingFile.item, pendingFile.file); }
  catch (error) { message(`续传未完成：${error.message}。两端保持页面打开，10 分钟内可再次续传。`); }
  finally { busy = false; $('sendText').disabled = false; $('files').disabled = false; }
};
$('cancelResume').onclick = () => { if (!busy) { pendingFile = null; $('resumeFile').hidden = true; $('cancelResume').hidden = true; message('已取消重试；接收端未完成暂存将在空闲 10 分钟后清理'); } };
async function sendFiles(files) { for (const file of files) { try { await send(file); } catch (error) { message(error.message); break; } } }
$('files').onchange = async (event) => { await sendFiles(Array.from(event.target.files)); event.target.value = ''; };
document.querySelector('.drop').ondragover = (event) => event.preventDefault();
document.querySelector('.drop').ondrop = (event) => { event.preventDefault(); if (!busy) sendFiles(Array.from(event.dataTransfer.files)); };
setInterval(() => { if (identity && !busy) refresh().catch(() => {}); }, 15000);
setInterval(() => directFiles.expire().catch(()=>{}), 60000);
window.addEventListener('beforeunload', (event) => { if (busy || pendingFile || directFiles.entries.size || received.some((item) => item.kind === 'file')) { event.preventDefault(); event.returnValue = ''; } });
if (!window.isSecureContext) {
  $('pair').disabled = true;
  message('请使用 HTTPS 地址。证书尚未启用时，不要输入配对码或传输文件。');
} else if (identity?.token) showApp();
