/* Pure signal processing, shared with the regression tests. */
(function (root) {
    function analyze(data) {
        if (!data.length) return null;
        let min = 255, max = 0, sum = 0, squares = 0;
        for (const v of data) { min = Math.min(min, v); max = Math.max(max, v); sum += v; squares += v * v; }
        const center = (min + max) / 2;
        const hysteresis = Math.max(2, (max - min) * .08);
        const crossings = [];
        let armed = false;
        for (let i = 1; i < data.length; i++) {
            if (data[i - 1] < center - hysteresis) armed = true;
            if (armed && data[i - 1] < center && data[i] >= center) {
                crossings.push(i - 1 + (center - data[i - 1]) / (data[i] - data[i - 1]));
                armed = false;
            }
        }
        const periods = crossings.slice(1).map((x, i) => x - crossings[i]).sort((a, b) => a - b);
        const period = max - min >= 8 && periods.length ? periods[Math.floor(periods.length / 2)] : null;
        return { min, max, center, mean: sum / data.length, rms: Math.sqrt(squares / data.length), period };
    }
    function autoset(data) {
        const stats = analyze(data);
        if (!stats) return null;
        return { center: stats.center, range: Math.max(16, (stats.max - stats.min) * 1.25), count: Math.min(data.length, Math.max(16, Math.round(stats.period ? stats.period * 5 : data.length))), periodic: !!stats.period };
    }
    root.ScopeSignal = { analyze, autoset };
    if (typeof module !== 'undefined') module.exports = root.ScopeSignal;
})(globalThis);
