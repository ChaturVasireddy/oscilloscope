const $ = id => document.getElementById(id);
const canvas = $('scope'), ctx = canvas.getContext('2d');
const CAPACITY = 5000, buffer = new Uint8Array(CAPACITY);
let writeIndex = 0, size = 0, frozen = null, paused = false;
let port = null, reader = null, connecting = false, demo = false, demoPhase = 0;
let visible = 1000, center = 127.5, range = 255, offset = 0;
let estimatedRate = 0, rateStart = 0, rateBytes = 0, pendingAutoset = false;
function message(text) { $('status').textContent = text; }
function snapshot() { return Uint8Array.from({length:size}, (_, i) => buffer[(writeIndex - size + i + CAPACITY) % CAPACITY]); }
function dataSource() { return frozen || snapshot(); }
function sampleRate() { return demo ? 32000 : Number($('rate').value) > 0 ? Number($('rate').value) : estimatedRate; }
function controls() {
    $('connect').textContent = port ? 'Disconnect' : 'Connect RP2350';
    $('connect').disabled = connecting || demo || !('serial' in navigator);
    $('demo').disabled = !!port || connecting;
    $('demo').textContent = demo ? 'Stop demo' : 'Start demo';
    $('pause').textContent = paused ? 'Resume' : 'Pause';
    $('pause').disabled = !size;
    $('csv').disabled = $('png').disabled = !size;
    $('zoom').value = visible;
    $('windowValue').textContent = `${visible} samples`;
}
function resetAcquisition() {
    writeIndex = size = 0; frozen = null; paused = false; offset = 0;
    estimatedRate = rateStart = rateBytes = 0;
}
function append(values) {
    for (const v of values) { buffer[writeIndex] = v; writeIndex = (writeIndex + 1) % CAPACITY; size = Math.min(CAPACITY, size + 1); }
    if (pendingAutoset && size >= 256) doAutoset();
}
function doAutoset() {
    const result = ScopeSignal.autoset(dataSource());
    if (!result || size < 2) { pendingAutoset = true; message('Autoset armed — waiting for waveform data.'); return; }
    pendingAutoset = false;
    center = result.center; range = result.range; visible = result.count; offset = 0;
    $('vertical').value = 'auto';
    message(result.periodic ? 'Autoset complete — amplitude fitted, approximately five cycles shown.' : 'Amplitude fitted — no repeating signal detected; showing the capture.');
    controls();
}
$('connect').onclick = async () => {
    if (port) { if (reader) await reader.cancel(); return; }
    connecting = true; controls();
    let selected;
    try {
        selected = await navigator.serial.requestPort();
        await selected.open({baudRate:115200});
        port = selected; resetAcquisition(); message('Connected — acquiring CH 1.');
        reader = port.readable.getReader();
        connecting = false; controls();
        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            if (!value) continue;
            const now = performance.now();
            if (!rateStart) rateStart = now;
            else rateBytes += value.length;
            if (now - rateStart >= 1000) {
                estimatedRate = rateBytes * 1000 / (now - rateStart);
                rateStart = now; rateBytes = 0;
            }
            append(value);
        }
        message('Disconnected — last capture retained.');
    } catch (error) { message(error.name === 'NotFoundError' ? 'Connection cancelled.' : `Serial error: ${error.message}`); }
    finally {
        if (reader) { reader.releaseLock(); reader = null; }
        if (selected) { try { await selected.close(); } catch (_) { /* Port may already be closed. */ } }
        port = null; connecting = false; controls();
    }
};
$('demo').onclick = () => {
    demo = !demo;
    if (demo) { resetAcquisition(); demoPhase = 0; pendingAutoset = true; message('Demo — 1 kHz sine wave at 32 kS/s.'); }
    else message('Demo stopped — last capture retained.');
    controls();
};
setInterval(() => {
    if (!demo) return;
    append(Uint8Array.from({length:640}, () => Math.round(128 + 100 * Math.sin(2 * Math.PI * demoPhase++ / 32))));
}, 20);
$('pause').onclick = () => {
    paused = !paused; frozen = paused ? snapshot() : null; offset = 0;
    message(paused ? 'Paused — frozen capture. Pan, zoom, autoset, or export.' : demo ? 'Demo running.' : port ? 'Connected — acquiring CH 1.' : 'Last capture displayed.'); controls();
};
$('autoset').onclick = doAutoset;
function resetView() { visible = 1000; center = 127.5; range = 255; offset = 0; $('vertical').value = 'auto'; controls(); }
$('reset').onclick = resetView; canvas.ondblclick = resetView;
$('zoom').oninput = () => { visible = Number($('zoom').value); offset = Math.min(offset, Math.max(0, dataSource().length - visible)); controls(); };
$('vertical').onchange = () => { if ($('vertical').value === 'auto') doAutoset(); else range = Number($('vertical').value); };
let lastX = null;
canvas.onpointerdown = e => { lastX = e.clientX; canvas.setPointerCapture(e.pointerId); };
canvas.onpointerup = canvas.onpointercancel = () => { lastX = null; };
canvas.onpointermove = e => {
    if (lastX === null) return;
    offset = Math.max(0, Math.min(Math.max(0, dataSource().length - visible), offset + (e.clientX - lastX) * visible / canvas.getBoundingClientRect().width));
    lastX = e.clientX;
};
canvas.addEventListener('wheel', e => {
    e.preventDefault(); visible = Math.round(Math.max(16, Math.min(CAPACITY, visible * (e.deltaY > 0 ? 1.15 : 1 / 1.15))));
    offset = Math.min(offset, Math.max(0, dataSource().length - visible)); controls();
}, {passive:false});
function view(data) {
    const count = Math.min(visible, data.length);
    let end = data.length - Math.min(Math.round(offset), Math.max(0, data.length - count));
    if (offset === 0 && $('trigger').value !== 'off' && data.length > count) {
        const stats = ScopeSignal.analyze(data), rising = $('trigger').value === 'rising';
        const low = stats.center - Math.max(2, (stats.max - stats.min) * .08);
        const high = stats.center + Math.max(2, (stats.max - stats.min) * .08);
        let armed = false, candidate = -1;
        for (let i = 1; i <= data.length - count; i++) {
            if (rising ? data[i - 1] < low : data[i - 1] > high) armed = true;
            if (armed && (rising ? data[i - 1] < stats.center && data[i] >= stats.center : data[i - 1] > stats.center && data[i] <= stats.center)) { candidate = i; armed = false; }
        }
        if (candidate >= 0) end = candidate + count;
    }
    return data.slice(end - count, end);
}
function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('csv').onclick = () => {
    const data = view(dataSource()), rate = sampleRate();
    const rows = ['sample,time_seconds,adc,voltage,sample_rate_source', ...Array.from(data, (v, i) => `${i},${rate ? i / rate : ''},${v},${(v * 3.3 / 255).toFixed(6)},${demo ? 'demo' : Number($('rate').value) > 0 ? 'manual' : 'estimated'}`)];
    download(new Blob([rows.join('\n')], {type:'text/csv'}), 'scope-capture.csv');
};
$('png').onclick = () => canvas.toBlob(blob => { if (blob) download(blob, 'scope-capture.png'); });
function draw() {
    const width = canvas.width, height = canvas.height;
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1; ctx.strokeStyle = '#20313c'; ctx.beginPath();
    for (let x = 0; x <= width; x += width / 10) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = 0; y <= height; y += height / 8) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    const data = view(dataSource()), stats = ScopeSignal.analyze(data), rate = sampleRate();
    if (data.length > 1) {
        ctx.strokeStyle = '#55e5b4'; ctx.lineWidth = 2; ctx.beginPath();
        data.forEach((v, i) => { const x = i * width / (data.length - 1), y = height / 2 - (v - center) / range * height; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    } else {
        ctx.fillStyle = '#7e97a7'; ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Connect RP2350 or start the demo to see a waveform', width / 2, height / 2); ctx.textAlign = 'left';
    }
    const volts = v => `${(v * 3.3 / 255).toFixed(3)} V`;
    for (const [id, value] of Object.entries({vpp:stats && stats.max - stats.min,vmax:stats?.max,vmin:stats?.min,mean:stats?.mean,rms:stats?.rms})) $(id).textContent = stats ? volts(value) : '—';
    $('frequency').textContent = stats?.period && rate ? `${(rate / stats.period).toFixed(1)} Hz${!demo && !Number($('rate').value) ? ' est.' : ''}` : '—';
    $('scale').textContent = `${volts(range / 8)}/div · ${rate ? ((Math.max(0, data.length - 1) / rate / 10) * 1000).toFixed(3) + ' ms/div' : 'timebase pending'}`;
    $('acquisition').textContent = `${paused ? 'PAUSED' : demo || port ? 'LIVE' : 'IDLE'} · ${data.length} / ${size} samples · ${rate ? (rate / 1000).toFixed(2) + ' kS/s' : 'rate unknown'}`;
    controls(); requestAnimationFrame(draw);
}
if (!('serial' in navigator)) message('Web Serial is unavailable. Use Chrome or Edge on localhost/HTTPS, or try the demo.');
draw();
