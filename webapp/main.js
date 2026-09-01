const connectButton = document.getElementById("connect");
const status = document.getElementById("status");

const canvas = document.getElementById("scope");
const ctx = canvas.getContext("2d");

const BUFFER_SIZE = 5000;

const samples = new Uint8Array(BUFFER_SIZE);
let writeIndex = 0;
let connected = false;

// -------------------------
// Zoom / view settings
// -------------------------

// Number of samples currently visible
let visibleSamples = 1000;

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

                for (let i = 0; i < value.length; i++) {

                    samples[writeIndex] = value[i];

                    writeIndex++;

                    if (writeIndex >= BUFFER_SIZE) {
                        writeIndex = 0;
                    }

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


// -------------------------
// Draw waveform
// -------------------------

function draw() {

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


    for (let x = 0; x < width; x++) {

        // Which sample should appear at this pixel?
        const samplePosition =
            Math.floor(
                x * visibleSamples / width
            );

        const sample =
            getSample(
                samplePosition + viewOffset
            );

        const y =
            height -
            (sample / 255) * height;


        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

    }

    ctx.stroke();


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
// Mouse-wheel zoom
// -------------------------

canvas.addEventListener("wheel", (event) => {

    event.preventDefault();

    const oldVisibleSamples = visibleSamples;

    if (event.deltaY < 0) {
        visibleSamples *= 0.98;
    } else {
        visibleSamples *= 1.02;
    }

    // Clamp zoom
    visibleSamples = Math.max(
        50,
        Math.min(BUFFER_SIZE, visibleSamples)
    );


    // Keep the point under the mouse
    // approximately stationary

    const mouseRatio =
        event.offsetX / canvas.width;

    const mouseSample =
        mouseRatio * oldVisibleSamples;

    const newMouseSample =
        mouseRatio * visibleSamples;

    viewOffset +=
        mouseSample - newMouseSample;


    // Clamp offset

    const maxOffset =
        BUFFER_SIZE - visibleSamples;

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

});


// Start rendering
draw();