/**
 * Step 3: jackywu.ca's own scripts/lib/gpx.mjs, unchanged, bundled for the browser
 * and executed in a V8 context that has no Node APIs at all. Output must match a
 * plain Node run byte for byte. (No GPX is in the repo — raw tracks never were — so
 * the input is a synthetic 6,000-point loop; accuracy is already calibrated upstream.)
 */
import * as esbuild from 'esbuild';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const lib = `${process.argv[2]}/scripts/lib/gpx.mjs`;
const pts = Array.from({ length: 6000 }, (_, i) => {
  const t = (i / 6000) * 2 * Math.PI;
  return `<trkpt lat="${(50.1 + 0.05 * Math.sin(t)).toFixed(6)}" lon="${(-122.95 + 0.08 * Math.cos(t)).toFixed(6)}"><ele>${(700 + 900 * Math.sin(t / 2) ** 2 + 3 * Math.sin(i)).toFixed(1)}</ele></trkpt>`;
}).join('');
const gpx = `<?xml version="1.0"?><gpx><trk><name>synthetic loop</name><trkseg>${pts}</trkseg></trk></gpx>`;
const run = (g) => { const { pts } = g.parse(gpx); const { cum, total } = g.measure(pts);
  return { km: +(total / 1000).toFixed(1), gainM: g.gain(pts), route: g.routeSvg(pts), profile: g.profileSvg(pts, cum) }; };

const { outputFiles, metafile } = await esbuild.build({ entryPoints: [lib], bundle: true, write: false, format: 'iife',
  globalName: 'gpx', platform: 'browser', metafile: true, logLevel: 'error' });
const imports = Object.values(metafile.inputs).flatMap((i) => i.imports);
const sandbox = vm.createContext({});                  // no require, process, Buffer, fs
vm.runInContext(outputFiles[0].text, sandbox);
const inBrowserish = run(sandbox.gpx);
const inNode = run(await import(lib));
assert.deepEqual(JSON.parse(JSON.stringify(inBrowserish)), JSON.parse(JSON.stringify(inNode)));
console.log(`gpx.mjs imports: ${imports.length}; bundle ${outputFiles[0].text.length} bytes; runs with no Node APIs: yes; identical to Node: yes`);
console.log(`  ${inNode.km} km, +${inNode.gainM} m, route ${inNode.route.points} points, profile ${inNode.profile.lo}–${inNode.profile.hi} m`);
