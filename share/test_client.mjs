// Protocol tests without a browser: two real client state machines over a simulated ordered channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

function element() {
  const classes = new Set();
  return {value:'', options:[], children:[], classList:{add(name){classes.add(name);}, remove(name){classes.delete(name);}, contains(name){return classes.has(name);}, toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}, append(...nodes){this.children.push(...nodes);}, prepend(...nodes){this.children.unshift(...nodes);}, setAttribute(){}, replaceChildren(...nodes){this.children=nodes;},
    addEventListener(){}, replaceWith(){}, click(){}, add(option){this.options.push(option);}};
}

test('toast fades after four seconds and a newer message cancels stale cleanup', () => {
  const timers = new Map(); let next = 0;
  const a = client('A', {setTimeout(fn, ms){timers.set(++next,{fn,ms});return next;}, clearTimeout(id){timers.delete(id);}});
  vm.runInContext("message('已复制')",a);
  assert.equal(vm.runInContext("$('message').classList.contains('visible')",a),true);
  const fade = [...timers.values()].find(t=>t.ms===4000); fade.fn();
  assert.equal(vm.runInContext("$('message').classList.contains('visible')",a),false);
  vm.runInContext("message('新提示')",a);
  assert.equal([...timers.values()].some(t=>t.ms===250),false);
  assert.equal(vm.runInContext("$('message').textContent",a),'新提示');
  vm.runInContext("message('')",a);
  assert.equal(vm.runInContext("$('message').classList.contains('visible')",a),false);
});

test('completed progress collapses, ongoing upload and retry cancel its cleanup', () => {
  const timers = new Map(); let next = 0;
  const a = client('A',{setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext("progress(100,'完成')",a);
  [...timers.values()].find(t=>t.ms===4000).fn();
  assert.equal(vm.runInContext("$('transferStatus').classList.contains('visible')",a),false);
  vm.runInContext("progress(100,'等待服务器确认',false)",a);
  assert.equal(timers.size,0);
  assert.equal(vm.runInContext("$('transferStatus').hidden",a),false);
  vm.runInContext("progress(100,'完成')",a);
  [...timers.values()].find(t=>t.ms===4000).fn();
  [...timers.values()].find(t=>t.ms===250).fn();
  assert.equal(vm.runInContext("$('transferStatus').hidden",a),true);
});
function client(name, overrides = {}) {
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const context = vm.createContext({
    console, crypto:webcrypto, TextEncoder, Blob, Uint8Array, ArrayBuffer,
    URL:{createObjectURL:()=>'blob:test', revokeObjectURL(){}}, URLSearchParams,
    location:{search:'', protocol:'https:', host:'share.test'},
    localStorage:{getItem:()=>null, setItem(){}, removeItem(){}},
    document:{getElementById:get, querySelector:get, createElement:element, body:element()},
    setTimeout, clearTimeout, setInterval:()=>0, clearInterval(){},
    navigator:{}, confirm:()=>true, Option:function(text,value){this.text=text;this.value=value;},
    ...overrides,
  });
  context.window = {isSecureContext:true, addEventListener(){}};
  vm.runInContext(readFileSync(new URL('./web/direct-files.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('./web/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext(`identity = {id:${JSON.stringify(name)}, token:'test'};`, context);
  return context;
}

test('direct text and chunked file are acknowledged only after complete receive', async () => {
  const a = client('A'), b = client('B');
  const ca = {readyState:'open', bufferedAmount:0};
  const cb = {readyState:'open', bufferedAmount:0};
  ca.send = (data) => queueMicrotask(() => cb.onmessage({data}));
  cb.send = (data) => queueMicrotask(() => ca.onmessage({data}));
  for (const fileMode of [false,true]) {
    b.session = {peer:'A', close(){}}; b.channel = cb;
    vm.runInContext('receiveChannel(session, channel)', b);
    a.session = {channel:ca, close(){}};
    const bytes = new Uint8Array(200000).map((_, i) => i % 251);
    a.file = fileMode ? Object.assign(new Blob([bytes]), {name:'test.bin'}) : null;
    a.item = {id:webcrypto.randomUUID(), kind:fileMode?'file':'text', name:'test', text:'hello', size:fileMode?bytes.length:5};
    await vm.runInContext('sendDirect(session,item,file)', a);
    cb.onclose?.();
  }
  assert.equal(vm.runInContext('received.length', b), 2);
  assert.equal(vm.runInContext('received[0].size', b), 200000);
  assert.equal(vm.runInContext('received[1].text', b), 'hello');
});

function handshakeClient() {
  const signals = [], peers = [];
  let expire;
  class Peer {
    constructor() { this.iceGatheringState = 'complete'; this.iceConnectionState = 'checking'; this.closed = 0; peers.push(this); }
    createDataChannel() { return this.channel = {}; }
    async createOffer() { return {type:'offer', sdp:'a=candidate:1 1 udp 1 private-host.local 1234 typ host\r\n'}; }
    async setLocalDescription(value) { this.localDescription = value; }
    async getStats() { return new Map([['pair', {type:'candidate-pair', state:'in-progress', requestsSent:90, responsesReceived:0}]]); }
    close() { this.closed++; }
  }
  const a = client('A', {RTCPeerConnection:Peer, WebSocket:{OPEN:1},
    setTimeout(fn, ms) { if (ms === 12000) { expire = fn; return 0; } return setTimeout(fn, ms); },
  });
  a.window.RTCPeerConnection = Peer;
  a.testSocket = {readyState:1, send:(data)=>signals.push(JSON.parse(data))};
  vm.runInContext("socket=testSocket; roster=[{id:'B',online:true}];", a);
  return {a, signals, peers, expire:()=>expire()};
}

test('rejected handshake immediately rejects and releases both session slots', async () => {
  const {a, signals, peers} = handshakeClient();
  const pending = vm.runInContext("openDirect('B')", a);
  const rejected = assert.rejects(pending, /test rejection/);
  await new Promise(setImmediate);
  vm.runInContext("sessions.values().next().value.close(new Error('test rejection'))", a);
  await rejected;
  assert.deepEqual(signals.map((s)=>s.type), ['offer','reject']);
  assert.equal(vm.runInContext('sessions.size',a),0);
  assert.equal(peers[0].closed,1);
});

test('handshake timeout reports redacted network diagnostics and cancels the receiver', async () => {
  const {a, signals, expire} = handshakeClient();
  const pending = vm.runInContext("openDirect('B')", a);
  const rejected = assert.rejects(pending, (error) => {
    assert.match(error.message, /请求90\/响应0/);
    assert.match(error.message, /ICE checking/);
    assert.doesNotMatch(error.message, /private-host\.local/);
    return true;
  });
  await new Promise(setImmediate);
  await expire(); await rejected;
  assert.equal(signals.at(-1).type,'reject');
  assert.equal(vm.runInContext('sessions.size',a),0);
});

test('automatic mode falls back before transfer, but never after payload failure', async () => {
  const a = client('A');
  vm.runInContext(`
    $('target').value='B'; $('text').value='test'; $('mode').value='auto';
    cloudCalls=0; post=async()=>{cloudCalls++; return {ready:true};}; refresh=async()=>{};
    openDirect=async()=>{throw new Error('test network unavailable');};
  `,a);
  await vm.runInContext('send()',a);
  assert.equal(vm.runInContext('cloudCalls',a),1);
  assert.match(vm.runInContext("$('message').textContent",a),/改为云端暂存/);
  vm.runInContext(`$('text').value='test again'; openDirect=async()=>({}); sendDirect=async()=>{throw new Error('payload interrupted');};`,a);
  await assert.rejects(vm.runInContext('send()',a),/payload interrupted/);
  assert.equal(vm.runInContext('cloudCalls',a),1);
});

test('oversized direct metadata is rejected without allocating a file buffer', async () => {
  const b = client('B'); let closed = false; const replies = [];
  b.session = {peer:'A', close(){closed=true;}};
  b.channel = {send:(data)=>replies.push(JSON.parse(data))};
  vm.runInContext('receiveChannel(session,channel)', b);
  await b.channel.onmessage({data:JSON.stringify({type:'begin', kind:'file', size:33*1024*1024, name:'large'})});
  assert.equal(closed,true); assert.ok(replies[0].error);
  assert.equal(vm.runInContext('received.length', b),0);
});

test('image preview downloads once across refreshes, shares blob, and revokes on removal', async () => {
  const calls = [], revoked = [];
  const a = client('A', {fetch:async (url, options) => {
    calls.push({url, options}); return {ok:true, blob:async()=>new Blob(['png'])};
  }, URL:{createObjectURL:()=> 'blob:image', revokeObjectURL:(url)=>revoked.push(url)}});
  vm.runInContext("cloudItems=[{id:'photo',kind:'file',name:'photo.PNG',size:3,created:1}]; renderItems();", a);
  await new Promise(setImmediate);
  vm.runInContext('renderItems()', a);
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test');
  assert.equal(calls[0].url, '/api/items/photo/file');
  assert.equal(await vm.runInContext('loadImage(cloudItems[0]).then(v=>v.blob.type)', a), 'image/png');
  assert.equal(vm.runInContext("$('items').children[0].children.at(-1).children.map(b=>b.textContent).join(',')", a), '保存图片,复制图片');
  vm.runInContext('cloudItems=[]; renderItems()', a);
  await new Promise(setImmediate);
  assert.deepEqual(revoked, ['blob:image']);
});

test('direct image preview uses local blob without credentials; unsafe types have no preview', async () => {
  let request;
  const a = client('A', {fetch:async (...args) => { request=args; return {ok:true,blob:async()=>new Blob(['jpg'])}; }});
  await vm.runInContext("loadImage({id:'direct',kind:'file',name:'a.jpg',size:3,direct:true,blob:new Blob(['jpg']),url:'blob:direct'})", a);
  assert.equal(request, undefined);
  assert.equal(vm.runInContext("imageType({kind:'file',name:'a.svg'})",a),'');
  assert.equal(vm.runInContext("imageType({kind:'text',name:'a.png'})",a),'');
});

test('large images require explicit preview and failed previews do not redownload every refresh', async () => {
  let calls = 0;
  const a = client('A', {fetch:async()=>{calls++; return {ok:false,json:async()=>({detail:'budget exhausted'})};}});
  vm.runInContext("cloudItems=[{id:'large',kind:'file',name:'big.jpg',size:9*1024*1024}]; renderItems();",a);
  assert.equal(calls,0);
  vm.runInContext("cloudItems=[{id:'small',kind:'file',name:'small.jpg',size:3}]; renderItems();",a);
  await new Promise(setImmediate);
  vm.runInContext('renderItems()',a);
  await new Promise(setImmediate);
  assert.equal(calls,1);
  await assert.rejects(vm.runInContext("loadImage({id:'huge',size:65*1024*1024})",a), /内存限额/);
});

test('copy image writes a promised PNG during the click gesture and reports unsupported browsers', async () => {
  let written;
  const a = client('A', {ClipboardItem:class {constructor(data){this.data=data;}},
    navigator:{clipboard:{write(items){written=items;return Promise.resolve();}}}});
  vm.runInContext("imagePng=async()=>new Blob(['png'],{type:'image/png'}); copyImage({})",a);
  assert.ok(written, 'clipboard write must happen before awaiting image conversion');
  assert.equal((await written[0].data['image/png']).type,'image/png');
  const unsupported = client('A');
  assert.throws(()=>vm.runInContext('copyImage({})',unsupported),/不支持复制图片/);
});

test('large files never fall back to cloud if direct handshake fails', async () => {
  const a = client('A');
  a.file = {name:'large.bin', size:1024**3};
  vm.runInContext("$('target').value='B'; $('mode').value='auto'; cloudCalls=0; post=async()=>{cloudCalls++;}; openDirect=async()=>{throw new Error('offline');};",a);
  await assert.rejects(vm.runInContext('send(file)',a), /不会转到云端/);
  assert.equal(vm.runInContext('cloudCalls',a),0);
});

test('resumable receiver validates chunks and resumes only the same sender and file', async () => {
  const a = client('A');
  a.meta = {id:webcrypto.randomUUID(),name:'part.bin',size:256*1024+5,fingerprint:'a'.repeat(64)};
  const entry = await vm.runInContext("directFiles.open(meta,'B')",a);
  a.entry = entry; a.bytes = new Uint8Array(256*1024).fill(42).buffer;
  const digest = await vm.runInContext('hash(bytes)',a); a.digest = digest;
  await vm.runInContext('directFiles.append(entry,0,bytes,digest)',a);
  assert.equal(entry.offset,256*1024);
  assert.equal((await vm.runInContext("directFiles.open(meta,'B')",a)).offset,256*1024);
  await assert.rejects(vm.runInContext("directFiles.open(meta,'C')",a),/不匹配/);
  await assert.rejects(vm.runInContext('directFiles.append(entry,0,bytes,digest)',a),/顺序/);
  await assert.rejects(vm.runInContext('directFiles.finish(entry)',a),/未接收完整/);
  a.tail = new Uint8Array([1,2,3,4,5]).buffer;
  await assert.rejects(vm.runInContext("directFiles.append(entry,entry.offset,tail,'bad')",a),/校验/);
  a.tailDigest = await vm.runInContext('hash(tail)',a);
  await vm.runInContext('directFiles.append(entry,entry.offset,tail,tailDigest)',a);
  const blob = await vm.runInContext('directFiles.finish(entry)',a);
  assert.equal(blob.size,256*1024+5);
  assert.deepEqual(new Uint8Array(await blob.slice(-5).arrayBuffer()),new Uint8Array([1,2,3,4,5]));
});

test('large receiver uses disk writer; unsupported or insufficient storage refuses safely', async () => {
  const writes = [], data = new Map();
  const writer = {write:async value=>writes.push(value),close:async()=>{},abort:async()=>{}};
  const dir = {getFileHandle:async name=>{data.set(name,true);return {createWritable:async()=>writer,getFile:async()=>new Blob()};},removeEntry:async name=>data.delete(name)};
  const a = client('A',{navigator:{storage:{estimate:async()=>({quota:10*1024**3,usage:0}),getDirectory:async()=>({getDirectoryHandle:async()=>dir})}}});
  a.meta={id:webcrypto.randomUUID(),name:'2GB.bin',size:2*1024**3,fingerprint:'b'.repeat(64)};
  const entry = await vm.runInContext("directFiles.open(meta,'B')",a);
  assert.equal(entry.disk,true); assert.equal(entry.chunks.length,0);
  a.entry=entry; a.bytes=new Uint8Array(256*1024).buffer; a.digest=await vm.runInContext('hash(bytes)',a);
  await vm.runInContext('directFiles.append(entry,0,bytes,digest)',a);
  assert.equal(writes[0].data.byteLength,256*1024); assert.equal(entry.chunks.length,0);
  await vm.runInContext('directFiles.remove(meta.id)',a); assert.equal(data.size,0);
  const b=client('B'); b.meta=a.meta;
  await assert.rejects(vm.runInContext("directFiles.open(meta,'A')",b),/不支持大文件落盘/);
  a.navigator.storage.estimate=async()=>({quota:1024,usage:1024});
  await assert.rejects(vm.runInContext("directFiles.open(meta,'B')",a),/空间不足/);
  assert.equal(vm.runInContext('directFiles.entries.size',a),0);
});
