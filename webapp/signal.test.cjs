const test = require('node:test');
const assert = require('node:assert/strict');
const {analyze, autoset} = require('./signal.js');
const sine = Uint8Array.from({length:5000}, (_, i) => Math.round(128 + 127 * Math.sin(i * 2 * Math.PI / 32)));
test('autoset detects five cycles and leaves headroom at full scale', () => {
    const result = autoset(sine);
    assert.equal(result.count, 160);
    assert.ok(result.center - result.range / 2 < 1);
    assert.ok(result.center + result.range / 2 > 255);
    assert.equal(analyze(sine).period, 32);
});
test('DC and low-amplitude noise get a usable vertical fit without false frequency', () => {
    assert.deepEqual(autoset(new Uint8Array(100).fill(200)), {center:200,range:16,count:100,periodic:false});
    assert.equal(analyze(Uint8Array.from({length:100}, (_, i) => 127 + i % 3)).period, null);
    assert.equal(autoset([]), null);
});
test('asymmetric duty cycle is centered by extrema and period remains accurate', () => {
    const data = Uint8Array.from({length:1000}, (_, i) => i % 100 < 10 ? 240 : 20);
    assert.equal(autoset(data).center, 130);
    assert.equal(autoset(data).count, 500);
});
const fs = require('node:fs'), vm = require('node:vm');
function app() {
    const elements = new Map();
    const context = new Proxy({}, {get: (_, key) => () => {}});
    function get(id) {
        if (!elements.has(id)) elements.set(id, {value:id === 'trigger' ? 'rising' : '', textContent:'', width:1200,height:480, getContext:()=>context,addEventListener(){},setPointerCapture(){},getBoundingClientRect:()=>({width:600})});
        return elements.get(id);
    }
    const sandbox = {document:{getElementById:get},navigator:{serial:{}},setInterval(){},setTimeout(){},requestAnimationFrame(){},performance:{now:()=>1000},ScopeSignal:require('./signal.js')};
    vm.createContext(sandbox); vm.runInContext(fs.readFileSync(__dirname + '/main.js','utf8'),sandbox);
    return {get, run: code => vm.runInContext(code,sandbox), sandbox};
}
test('paused capture stays frozen while acquisition continues; autoset redraws it', () => {
    const a = app();
    a.run('append(Uint8Array.from({length:1000}, (_, i) => Math.round(128 + 100 * Math.sin(i * Math.PI / 16))))');
    a.get('pause').onclick();
    a.run('append(new Uint8Array(5000).fill(0))');
    a.get('autoset').onclick(); a.run('draw()');
    assert.equal(a.run('visible'),160);
    assert.ok(Number.parseFloat(a.get('vpp').textContent) > 2);
    assert.equal(a.run('dataSource().length'),1000);
});
test('fractional panning produces finite integer-indexed samples', () => {
    const a = app(); a.run('append(Uint8Array.from({length:5000}, (_, i) => i % 256)); offset = 123.456');
    assert.equal(a.run('view(dataSource()).length'),1000);
    assert.equal(a.run('view(dataSource())[0]'),3877 % 256);
});
test('autoset requested before data automatically applies to incoming capture', () => {
    const a = app(); a.get('autoset').onclick();
    assert.equal(a.run('pendingAutoset'),true);
    a.run('append(new Uint8Array(300).fill(180))');
    assert.equal(a.run('pendingAutoset'),false);
    assert.equal(a.run('center'),180);
});
test('serial stream ending releases the reader and closes the port', async () => {
    const a = app(); let released = false, closed = false;
    a.sandbox.navigator.serial.requestPort = async () => ({open:async()=>{},readable:{getReader:()=>({read:async()=>({done:true}),releaseLock(){released=true;}})},close:async()=>{closed=true;}});
    await a.get('connect').onclick();
    assert.ok(released && closed);
    assert.equal(a.run('port'),null);
    assert.equal(a.get('connect').disabled,false);
});
