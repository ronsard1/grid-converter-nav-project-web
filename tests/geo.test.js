const G = require(__dirname + '/../js/geo.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// 1. Known reference (Veness / GeographicLib): Eiffel Tower 48.8582 N 2.2945 E → 31U 448252 5411933
let u = G.toUTM(48.8582, 2.2945, 31);
ok(Math.abs(u.E - 448251.795) < 0.01 && Math.abs(u.N - 5411932.678) < 0.01, `Eiffel ${u.E.toFixed(3)} ${u.N.toFixed(3)}`);

// 2. Round trip across Rwanda, both zones and datums
let maxErr = 0;
for (let lat = -2.9; lat <= -1.0; lat += 0.13) for (let lon = 28.8; lon <= 30.95; lon += 0.11) for (const ell of ['WGS84', 'CLARKE80']) for (const z of [35, 36]) {
  const a = G.toUTM(lat, lon, z, ell); const b = G.fromUTM(a.E, a.N, z, true, ell);
  maxErr = Math.max(maxErr, Math.hypot((b.lat - lat) * 110574, (b.lon - lon) * 111320));
}
ok(maxErr < 1e-4, `UTM round-trip max error ${maxErr.toExponential(2)} m`);

// 3. Datum round trip & magnitude of Arc1960 shift
const w = G.convertDatum(-2.0, 30.0, 'ARC1960', 'WGS84');
const back = G.convertDatum(w.lat, w.lon, 'WGS84', 'ARC1960');
const shift = Math.hypot((w.lat + 2) * 110574, (w.lon - 30) * 111320);
ok(Math.hypot((back.lat + 2) * 110574, (back.lon - 30) * 111320) < 0.01, `datum round trip; Arc1960→WGS84 shift ${shift.toFixed(1)} m`);

// 4. Simulate a real UTM map sheet: corner at 2°15'S 30°00'E, zone 35, WGS84
const cLat = -2.25, cLon = 30.0;
const cu = G.toUTM(cLat, cLon, 35);
const trueGrid = G.formatGridRef(cu.E % 100000, cu.N % 100000, 6, false);
console.log('   corner true UTM', cu.E.toFixed(1), cu.N.toFixed(1), 'grid', trueGrid);
// Officer reads corner grid to 100 m (error up to 50 m) — exact UTM mode removes this error
const prof = { datum: 'WGS84', zone: 35, mode: 'utm', originGrid: trueGrid, originLat: cLat, originLon: cLon };
const cal = G.calibrate(prof);
ok(cal.misfit < 71, `misfit of read corner ${cal.misfit.toFixed(1)} m`);
const det = G.detectGrid(trueGrid, cLat, cLon);
ok(det[0].zone === 35 && det[1].misfit > 10000, `detect → z${det[0].zone} (${det[0].misfit.toFixed(0)} m), next z${det[1].zone} ${(det[1].misfit/1000).toFixed(0)} km`);

// point 18 km NE of corner
const pLat = -2.1, pLon = 30.16;
const pu = G.toUTM(pLat, pLon, 35);
const g10 = G.formatGridRef(pu.E % 1e5, pu.N % 1e5, 10, false);
const r = G.gridToGeo(g10, prof, cal);
ok(Math.hypot((r.lat - pLat) * 110574, (r.lon - pLon) * 111320) < 1.0, `10-digit grid→geo error ${Math.hypot((r.lat - pLat) * 110574, (r.lon - pLon) * 111320).toFixed(3)} m`);
const gg = G.geoToGrid(pLat, pLon, prof, null, cal);
ok(gg.grid10.replace(' ', '') === g10, `geo→grid 10-digit ${gg.grid10} vs ${g10}`);
ok(gg.grid6.replace(' ', '') === G.formatGridRef(pu.E % 1e5, pu.N % 1e5, 6, false), `geo→grid 6-digit ${gg.grid6}`);

// 5. 100 km roll-over: origin near 99 km easting, point east of it
const prof2 = { datum: 'WGS84', zone: 35, mode: 'origin', originGrid: '985 400', originLat: -2.3, originLon: 29.9 };
const c2 = G.calibrate(prof2);
const a2 = G.gridToGeo('995400', prof2, c2), b2 = G.gridToGeo('005400', prof2, c2);
ok(b2.E - a2.E > 999 && b2.E - a2.E < 1001, `roll-over 995→005 is +1 km (${(b2.E - a2.E).toFixed(1)} m)`);

// 6. Old paper-ruler engine vs exact, 15 km from origin (show why we replaced it)
const arc = (0.2 / 18.5) * 5 * 60; // arcsec per 100 m
const oldLat = cLat + (150 * arc) / 3600, oldLon = cLon + (150 * arc) / 3600; // 15 km E, 15 km N
const exact = G.gridToGeo(G.formatGridRef((cu.E + 15000) % 1e5, (cu.N + 15000) % 1e5, 10, false), prof, cal);
console.log('   old engine error at 15 km/15 km:', Math.hypot((oldLat - exact.lat) * 110574, (oldLon - exact.lon) * 111320).toFixed(1), 'm');

// 7. Ground distance vs Vincenty
function vincenty(l1, o1, l2, o2) { const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f); const L = (o2 - o1) * Math.PI / 180; const U1 = Math.atan((1 - f) * Math.tan(l1 * Math.PI / 180)), U2 = Math.atan((1 - f) * Math.tan(l2 * Math.PI / 180)); let lam = L, it = 0, sS, cS, s, cA, c2m; do { const sl = Math.sin(lam), cl = Math.cos(lam); sS = Math.sqrt((Math.cos(U2) * sl) ** 2 + (Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * cl) ** 2); cS = Math.sin(U1) * Math.sin(U2) + Math.cos(U1) * Math.cos(U2) * cl; s = Math.atan2(sS, cS); const sA = Math.cos(U1) * Math.cos(U2) * sl / sS; cA = 1 - sA * sA; c2m = cS - 2 * Math.sin(U1) * Math.sin(U2) / cA; const C = f / 16 * cA * (4 + f * (4 - 3 * cA)); const lp = lam; lam = L + (1 - C) * f * sA * (s + C * sS * (c2m + C * cS * (-1 + 2 * c2m * c2m))); if (Math.abs(lam - lp) < 1e-12) break; } while (++it < 200); const u2 = cA * (a * a - b * b) / (b * b); const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))); const B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2))); const dS = B * sS * (c2m + B / 4 * (cS * (-1 + 2 * c2m * c2m) - B / 6 * c2m * (-3 + 4 * sS * sS) * (-3 + 4 * c2m * c2m))); return b * A * (s - dS); }
const A = G.toUTM(-2.2, 29.95, 35), B = G.toUTM(-2.05, 30.12, 35);
const li = G.legInfo(A, B, cal); const v = vincenty(-2.2, 29.95, -2.05, 30.12);
ok(Math.abs(li.ground - v) < 0.5, `ground dist ${li.ground.toFixed(2)} vs Vincenty ${v.toFixed(2)} (grid ${li.grid.toFixed(1)})`);

// 8. Parsing
const P = (s, h) => G.parseAny(s, h);
ok(P('214 534').kind === 'grid', 'parse grid with space');
let q = P(`2°19'4.8"S 30°0'16.2"E`); ok(Math.abs(q.lat + 2.318) < 1e-6 && Math.abs(q.lon - 30.0045) < 1e-6, `parse DMS ${q.lat} ${q.lon}`);
q = P('-2.3194, 30.1785'); ok(q.lat === -2.3194 && q.lon === 30.1785, 'parse decimal');
q = P('2.3194, 30.1785', -2.2); ok(q.lat === -2.3194 && q.assumedSouth, 'assume south');
q = P('S 2 19.08 E 30 0.27'); ok(Math.abs(q.lat + 2.318) < 1e-6 && Math.abs(q.lon - 30.0045) < 1e-6, `parse DDM hemisphere-first ${q.lat} ${q.lon}`);
q = P('2 19 4.8 S, 30 0 16.2 E'); ok(Math.abs(q.lat + 2.318) < 1e-6, 'parse spaced DMS');
q = P('30.1785 E 2.3194 S'); ok(q.lat === -2.3194 && q.lon === 30.1785, 'parse lon-first with letters');
try { P('12345'); ok(false, 'odd grid rejected'); } catch (e) { ok(true, 'odd grid rejected: ' + e.message); }
console.log(G.toDMS(-2.318, true), G.toDDM(30.0045, false));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');

// 9. Rwanda national grid (TM Rwanda) — values read from the KANAZI 1:50 000 sheet margin
{
  const m = { grid: 'TMRW', mode: 'known', originLat: -2.2, originLon: 30.15 };
  const c = G.calibrate(m);
  const gc = G.graticuleCheck(c, -2.2, 30.15);
  ok(Math.abs(gc.meridians[1].e - 18.5) < 0.1 && Math.abs(gc.parallels[0].n - 51.2) < 0.1, `TM Rwanda: 30°10'E → ${gc.meridians[1].e.toFixed(2)}, 2°15'S → ${gc.parallels[0].n.toFixed(2)} (map shows ≈18.5 / 51.2)`);
  const r = G.gridToGeo('203525', m, c);
  ok(G.geoToGrid(r.lat, r.lon, m, null, c).grid6 === '203 525', `TM Rwanda round trip Ten Classrooms ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`);
  ok(G.detectGrid('203525', r.lat, r.lon)[0].grid === 'TMRW', 'corner detection recognises TM Rwanda');
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED (incl. TM Rwanda)');
