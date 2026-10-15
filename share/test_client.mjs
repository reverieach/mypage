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
function client(name) {
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
  });
  context.window = {addEventListener(){}};
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

test('oversized direct metadata is rejected without allocating a file buffer', async () => {
  const b = client('B'); let closed = false; const replies = [];
  b.session = {peer:'A', close(){closed=true;}};
  b.channel = {send:(data)=>replies.push(JSON.parse(data))};
  vm.runInContext('receiveChannel(session,channel)', b);
  await b.channel.onmessage({data:JSON.stringify({type:'begin', kind:'file', size:33*1024*1024, name:'large'})});
  assert.equal(closed,true); assert.ok(replies[0].error);
  assert.equal(vm.runInContext('received.length', b),0);
});
