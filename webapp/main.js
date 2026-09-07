const connectButton = document.getElementById("connect");
const autosetButton = document.getElementById("autoset");
const pauseButton = document.getElementById("pause");
const status = document.getElementById("status");

const canvas = document.getElementById("scope");
const ctx = canvas.getContext("2d");
const zoomSlider = document.getElementById("zoom");
const vppValue = document.getElementById("vpp");
const vmaxValue = document.getElementById("vmax");
const frequencyValue = document.getElementById("frequency");

const BUFFER_SIZE = 5000;

const samples = new Uint8Array(BUFFER_SIZE);
let writeIndex = 0;
let bufferedSamples = 0;
let receivedSamples = 0;
let sampleRate = 0;
let sampleRateStart = 0;
let connected = false;
let paused = false;

// -------------------------
// Zoom / view settings
// -------------------------

// Number of samples currently visible
let visibleSamples = 1000;

// ADC midpoint and total value range shown by the canvas
let displayCenter = 127.5;
let displayRange = 255;

// Position of the right edge of the view
// 0 = newest samples
let viewOffset = 0;


// -------------------------
// USB connection
// -------------------------

connectButton.addEventListener("click", async () => {

    try {

        const port = await navigator.serial.requestPort();

        await port.open({
            baudRate: 115200
        });

        connected = true;
        status.textContent = "Connected";

        readSerial(port);

    } catch (error) {

        console.error(error);
        status.textContent = "Connection error";

    }

});


// -------------------------
// Read USB data
// -------------------------

async function readSerial(port) {

    const reader = port.readable.getReader();

    try {

        while (connected) {

            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            if (value) {

                if (sampleRateStart === 0) {
                    sampleRateStart = performance.now();
                }

                for (let i = 0; i < value.length; i++) {

                    samples[writeIndex] = value[i];

                    writeIndex++;

                    if (writeIndex >= BUFFER_SIZE) {
                        writeIndex = 0;
                    }

                    bufferedSamples = Math.min(
                        BUFFER_SIZE,
                        bufferedSamples + 1
                    );

                    receivedSamples++;

                }

                const elapsedSeconds =
                    (performance.now() - sampleRateStart) / 1000;

                if (elapsedSeconds > 0) {
                    sampleRate = receivedSamples / elapsedSeconds;
                }

            }

        }

    } catch (error) {

        console.error(error);

    } finally {

        reader.releaseLock();

    }

}


// -------------------------
// Read sample from buffer
// -------------------------

function getSample(indexFromNewest) {

    let index =
        writeIndex - 1 - indexFromNewest;

    index %= BUFFER_SIZE;

    if (index < 0) {
        index += BUFFER_SIZE;
    }

    return samples[index];
}


function updateMeasurements() {

    const sampleCount = Math.min(
        Math.floor(visibleSamples),
        bufferedSamples
    );

    if (sampleCount < 2) {
        return;
    }

    let minimum = 255;
    let maximum = 0;
    const midpoint = displayCenter;
    const crossings = [];
    let previousSample = getSample(viewOffset + sampleCount - 1);

    for (let samplePosition = sampleCount - 1; samplePosition >= 0; samplePosition--) {

        const sample = getSample(viewOffset + samplePosition);

        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);

        if (previousSample < midpoint && sample >= midpoint) {
            crossings.push(samplePosition);
        }

        previousSample = sample;

    }

    const peakToPeak = (maximum - minimum) * 3.3 / 255;
    const maximumVoltage = maximum * 3.3 / 255;

    vppValue.textContent = `${peakToPeak.toFixed(2)} V`;
    vmaxValue.textContent = `${maximumVoltage.toFixed(2)} V`;

    if (crossings.length >= 2 && sampleRate > 0) {

        const periods = [];

        for (let i = 1; i < crossings.length; i++) {
            periods.push(crossings[i - 1] - crossings[i]);
        }

        const averagePeriod =
            periods.reduce((total, period) => total + period, 0) / periods.length;

        const frequency = sampleRate / averagePeriod;
        frequencyValue.textContent = `${frequency.toFixed(1)} Hz est.`;

    } else {
        frequencyValue.textContent = "--";
    }

}


// -------------------------
// Draw waveform
// -------------------------

function draw() {

    if (paused) {
        requestAnimationFrame(draw);
        return;
    }

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);


    // Grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    for (let y = 0; y <= height; y += height / 4) {

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

    }

    for (let x = 0; x <= width; x += width / 10) {

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

    }


    // Waveform
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;

    ctx.beginPath();


    const sampleCount = Math.min(
        Math.max(2, Math.floor(visibleSamples)),
        Math.max(2, bufferedSamples)
    );

    for (let samplePosition = 0; samplePosition < sampleCount; samplePosition++) {

        const x =
            samplePosition * width / (sampleCount - 1);

        const sample =
            getSample(
                samplePosition + viewOffset
            );

        const y =
            height / 2 -
            ((sample - displayCenter) / displayRange) * height;


        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

    }

    ctx.stroke();

    updateMeasurements();


    // Center line
    ctx.strokeStyle = "#555";

    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();


    // Continue rendering
    requestAnimationFrame(draw);
}


// -------------------------
// Pause display
// -------------------------

pauseButton.addEventListener("click", () => {

    paused = !paused;
    pauseButton.textContent = paused ? "Resume" : "Pause";
    status.textContent = paused ? "Paused" : connected ? "Connected" : "Disconnected";

});


// -------------------------
// Autoset timebase and vertical scale
// -------------------------

autosetButton.addEventListener("click", () => {

    const sampleCount = Math.min(
        BUFFER_SIZE,
        bufferedSamples
    );

    if (sampleCount < 2) {
        status.textContent = "Autoset waiting for waveform data";
        return;
    }

    let minimum = 255;
    let maximum = 0;
    let sum = 0;
    let previousSample = getSample(sampleCount - 1);

    for (let samplePosition = 0; samplePosition < sampleCount; samplePosition++) {

        const sample = getSample(samplePosition);

        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
        sum += sample;

        previousSample = sample;

    }

    displayCenter = sum / sampleCount;
    displayRange = Math.max(
        16,
        Math.min(255, (maximum - minimum) * 1.25)
    );

    const crossings = [];
    previousSample = getSample(sampleCount - 1);

    for (let samplePosition = sampleCount - 2; samplePosition >= 0; samplePosition--) {

        const sample = getSample(samplePosition);

        if (previousSample < displayCenter && sample >= displayCenter) {
            crossings.push(samplePosition);
        }

        previousSample = sample;

    }

    if (crossings.length >= 2) {

        const periods = [];

        for (let i = 1; i < crossings.length; i++) {
            periods.push(crossings[i - 1] - crossings[i]);
        }

        const averagePeriod =
            periods.reduce((total, period) => total + period, 0) / periods.length;

        visibleSamples = Math.max(
            2,
            Math.min(BUFFER_SIZE, Math.round(averagePeriod * 5))
        );

        zoomSlider.value = visibleSamples;

        const centerCrossing = crossings[Math.floor(crossings.length / 2)];
        viewOffset = centerCrossing - Math.floor(visibleSamples / 2);

    } else {
        status.textContent = "Autoset needs at least two cycles";
        return;
    }

    const maxOffset = Math.max(0, bufferedSamples - visibleSamples);

    viewOffset = Math.max(
        0,
        Math.min(maxOffset, viewOffset)
    );

    status.textContent = "Autoset complete";

});


// -------------------------
// Slider zoom
// -------------------------

zoomSlider.addEventListener("input", () => {

    visibleSamples = Number(zoomSlider.value);

    const maxOffset = BUFFER_SIZE - visibleSamples;

    viewOffset = Math.max(
        0,
        Math.min(maxOffset, viewOffset)
    );

});


// -------------------------
// Horizontal pan
// -------------------------

let dragging = false;
let lastX = 0;

canvas.addEventListener("mousedown", (event) => {

    dragging = true;
    lastX = event.clientX;

});

window.addEventListener("mouseup", () => {

    dragging = false;

});

canvas.addEventListener("mousemove", (event) => {

    if (!dragging) {
        return;
    }

    const dx =
        event.clientX - lastX;

    lastX = event.clientX;


    // Convert pixels to samples

    const samplesPerPixel =
        visibleSamples / canvas.width;

    viewOffset -=
        dx * samplesPerPixel;


    const maxOffset =
        BUFFER_SIZE - visibleSamples;

    viewOffset = Math.max(
        0,
        Math.min(maxOffset, viewOffset)
    );

});


// -------------------------
// Double click = reset view
// -------------------------

canvas.addEventListener("dblclick", () => {

    visibleSamples = 1000;
    viewOffset = 0;
    displayCenter = 127.5;
    displayRange = 255;
    zoomSlider.value = visibleSamples;

});


// Start rendering
draw();