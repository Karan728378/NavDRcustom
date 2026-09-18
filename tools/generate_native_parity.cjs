// Regenerate the synthetic math-parity fixture from the existing browser filter.
// This checks a port, not field accuracy. Run from the repository root.
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/navigation-core.js', 'utf8'), context);
const { PlanarEKF, geo } = context.window.NavDR.Core;
const filter = new PlanarEKF();
const origin = { lat: 28, lon: 77 };
filter.observe({ ...origin, speedMps: 10, heading: 0, accuracy: 3, timestampMs: 0 });
const header = ['timeMs', 'acceleration', 'yawRate', 'hasFix', 'lat', 'lon', 'speed', 'bearing', 'accuracy',
    ...Array.from({length: 6}, (_,i) => `x${i}`), ...Array.from({length: 36}, (_,i) => `p${Math.floor(i/6)}${i%6}`)];
const rows = [header.join(',')];
for (let i = 1; i <= 120; i++) {
    const acceleration = i < 40 ? 0.2 : -0.1;
    const yawRate = i > 60 ? 0.03 : 0;
    filter.predict({ forward: acceleration, yawRate }, 0.01);
    const hasFix = i === 40 || i === 100;
    const p = geo([i * 0.1 + 0.3, 0.1], origin);
    if (hasFix) filter.observe({ ...p, speedMps: 10, heading: 0, accuracy: 3, timestampMs: i * 10 });
    rows.push([i * 10, acceleration, yawRate, hasFix ? 1 : 0, p.lat, p.lon, 10, 0, 3,
        ...filter.x, ...filter.P.flat()].join(','));
}
const destination = 'native/android/navigation/src/test/resources/browser-planar-parity.csv';
fs.mkdirSync(require('node:path').dirname(destination), {recursive: true});
fs.writeFileSync(destination, rows.join('\n') + '\n');
console.log(destination);
