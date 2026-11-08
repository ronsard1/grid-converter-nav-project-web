// Small changes to the generated Android project: GPS permission, our print module, version number.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const cfg = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8'));
const pkgPath = cfg.appId.split('.');
const javaDir = join(root, 'android/app/src/main/java', ...pkgPath);
mkdirSync(javaDir, { recursive: true });
for (const f of ['MainActivity.java', 'HtmlPrintPlugin.java']) {
  const src = readFileSync(join(root, 'build/android', f), 'utf8').replace(/__PACKAGE__/g, cfg.appId);
  writeFileSync(join(javaDir, f), src);
}
// Location permission (for "My position")
const man = join(root, 'android/app/src/main/AndroidManifest.xml');
let m = readFileSync(man, 'utf8');
for (const p of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']) {
  if (!m.includes(p)) m = m.replace('</manifest>', `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
}
if (!m.includes('android.hardware.location.gps')) m = m.replace('</manifest>', '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>');
writeFileSync(man, m);
// Version: build number from GitHub, so each new APK installs as an update
const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
const gradle = join(root, 'android/app/build.gradle');
let g = readFileSync(gradle, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "1.0.${run}"`);
writeFileSync(gradle, g);
// Same signing key for every build -> updates keep your data (debug key used for test installs)
const home = process.env.HOME || '/root';
mkdirSync(join(home, '.android'), { recursive: true });
copyFileSync(join(root, 'build/android/gridnav-test.keystore'), join(home, '.android/debug.keystore'));
console.log('android patched: version', run, 'package', cfg.appId);
