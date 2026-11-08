// Copies the web app into www/ and bundles the libraries (map + fonts) so the APK needs no internet.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd(), www = join(root, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'vendor', 'leaflet'), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) cpSync(join(root, f), join(www, f));
for (const d of ['css', 'js', 'icons']) cpSync(join(root, d), join(www, d), { recursive: true });
// Leaflet (map)
cpSync(join(root, 'node_modules/leaflet/dist'), join(www, 'vendor/leaflet'), { recursive: true });
// Capacitor core (bridge to the phone's features, no bundler needed)
const capJs = ['node_modules/@capacitor/core/dist/capacitor.js', 'node_modules/@capacitor/core/dist/index.cjs.js'].find(p => existsSync(join(root, p)));
if (capJs && capJs.endsWith('capacitor.js')) cpSync(join(root, capJs), join(www, 'vendor/capacitor.js'));
// Fonts (Barlow + Barlow Condensed, latin)
mkdirSync(join(www, 'vendor/fonts'), { recursive: true });
let css = '';
for (const [pkg, family, weights] of [['barlow', 'Barlow', [400, 500, 600, 700]], ['barlow-condensed', 'Barlow Condensed', [500, 600, 700]]]) {
  for (const w of weights) {
    const file = `${pkg}-latin-${w}-normal.woff2`, src = join(root, 'node_modules/@fontsource', pkg, 'files', file);
    if (!existsSync(src)) { console.warn('font missing', file); continue; }
    cpSync(src, join(www, 'vendor/fonts', file));
    css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${file}) format('woff2');}\n`;
  }
}
writeFileSync(join(www, 'vendor/fonts.css'), css);
console.log('www ready:', readdirSync(www).join(', '));
