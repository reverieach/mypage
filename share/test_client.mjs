// Protocol tests without a browser: two real client state machines over a simulated ordered channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

function element() {
  return {value:'', options:[], classList:{add(){}, toggle(){}}, append(){}, replaceChildren(){},
    addEventListener(){}, replaceWith(){}, click(){}, add(option){this.options.push(option);}};
}
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
    a.file = fileMode ? {name:'test.bin', arrayBuffer:async()=>bytes.buffer} : null;
    a.item = {id:webcrypto.randomUUID(), kind:fileMode?'file':'text', name:'test', text:'hello', size:fileMode?bytes.length:5};
    await vm.runInContext('sendDirect(session,item,file)', a);
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
