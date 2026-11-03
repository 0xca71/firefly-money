// Bundles app/src into app/assets/js: boot.js (runs in <head> before first paint), app.js (everything else) and
// leaflet.js + leaflet.css (the map library, loaded by the Map page when it opens).
// npm run build, or npm run watch to rebuild on every save while dev/mock_server.py is running.
// npm run build:demo builds the online demo into site/ instead: the same app plus demo.js, which answers
// the API calls in the browser with made-up data, as plain files for GitHub Pages (or any static host).
// GOATCOUNTER=<site code> adds GoatCounter visitor stats (cookie-free) to the demo; the Docker image never has them.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const demo = process.argv.includes('--demo');
const options = {
  entryPoints: { boot: 'app/src/boot.ts', app: 'app/src/main.ts', leaflet: 'app/src/vendor/leaflet.ts', ...(demo ? { demo: 'app/src/demo/demo.ts' } : {}) },
  outdir: demo ? 'site/assets/js' : 'app/assets/js',
  bundle: true,
  minify: true,
  sourcemap: 'linked',
  format: 'iife',
  target: 'es2020',
  loader: { '.png': 'dataurl' },   // the few pictures leaflet.css uses
  logLevel: 'info',
};

if (demo) {
  rmSync('site', { recursive: true, force: true });
  await esbuild.build(options);
  cpSync('app/assets/money.css', 'site/assets/money.css');
  cpSync('docs/icon.svg', 'site/icon.svg');
  // The page's Content-Security-Policy, taken from the nginx config so the demo runs under the same rules
  // (frame-ancestors only works as a header, so it's left out of the <meta> version)
  let csp = readFileSync('app/default.conf.template', 'utf8').match(/add_header Content-Security-Policy "(.*?)";/)[1]
    .split('; ').filter(d => !d.startsWith('frame-ancestors')).join('; ');
  // Visitor stats: the script comes from gc.zgo.at and reports to <code>.goatcounter.com (by beacon, or an image if that fails)
  const gc = (process.env.GOATCOUNTER || '').trim().toLowerCase();
  if (gc && !/^[a-z0-9-]+$/.test(gc)) throw new Error(`GOATCOUNTER should be a site code like "my-site", not "${gc}"`);
  const gcHost = `https://${gc}.goatcounter.com`;
  if (gc) csp = csp.replace("script-src 'self'", "script-src 'self' https://gc.zgo.at")
    .replace("connect-src 'self'", `connect-src 'self' ${gcHost}`).replace("img-src 'self'", `img-src 'self' ${gcHost}`);
  const version = 'demo · ' + new Date().toISOString().slice(0, 10);
  const page = readFileSync('app/index.html', 'utf8')
    .replaceAll('${MONEY_VERSION}', version)
    .replaceAll('${FIREFLY_URL}', '')
    .replace(/<link rel="manifest"[^>]*>\n/, '')                    // no install-as-app in the demo
    .replaceAll('href="/', 'href="').replaceAll('src="/', 'src="')  // GitHub Pages serves the site from /<repo>/
    .replace('<script src="assets/js/boot.js', `<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>.demo-badge { position: fixed; left: 50%; transform: translateX(-50%); bottom: 12px; white-space: nowrap; z-index: 50; padding: 6px 12px; border-radius: 999px; font: 600 12px/1.4 system-ui, sans-serif;
  background: #1c1c1e; color: #fff; border: 1px solid rgba(255,255,255,.22); text-decoration: none; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
  @media (max-width: 900px) { .demo-badge { left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom)); } }</style>
<script src="assets/js/demo.js"></script>
${gc ? `<script data-goatcounter="${gcHost}/count" async src="https://gc.zgo.at/count.js"></script>\n` : ''}<script src="assets/js/boot.js`);
  mkdirSync('site', { recursive: true });
  writeFileSync('site/index.html', page);
  writeFileSync('site/.nojekyll', '');
} else if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
