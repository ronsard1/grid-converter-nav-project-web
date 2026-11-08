/* ==================================================================
   geo.js — coordinate engine
   ------------------------------------------------------------------
   Everything about turning a grid reference into latitude/longitude
   (and back) lives here. No UI code. Works in the browser (window.Geo)
   and in Node (module.exports) so it can be tested.

   How it works, in plain words:
   1. The grid printed on a military map is a UTM grid: a flat sheet of
      metre squares laid over the curved earth with a mathematical
      "Transverse Mercator" projection.
   2. A grid reference (e.g. 214 534) only keeps the last digits of the
      full UTM easting/northing (inside one 100 km square).
   3. The map profile's ORIGIN (bottom-left corner: its grid reference
      and its lat/lon) tells us which 100 km square we are in, which
      datum the map uses, and which UTM zone.
   4. With that, we rebuild the full UTM coordinate and run the exact
      projection formulas (Krüger series, accurate to < 1 mm).
   ================================================================== */
(function (root) {
  'use strict';

  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  /* ---------------- Ellipsoids & datums ---------------- */
  const ELLIPSOIDS = {
    WGS84:    { a: 6378137.0,   f: 1 / 298.257223563 },
    CLARKE80: { a: 6378249.145, f: 1 / 293.465 },       // Clarke 1880 (RGS)
    CLARKE80ARC: { a: 6378249.145, f: 1 / 293.4663077 } // Clarke 1880 (Arc)
  };
  // toWGS84: 3-parameter shift (metres) from this datum to WGS 84.
  const DATUMS = {
    WGS84:   { label: 'WGS 84 (GPS / satellite)', ellipsoid: 'WGS84',    toWGS84: [0, 0, 0] },
    ARC1960: { label: 'Arc 1960 (older East-African maps)', ellipsoid: 'CLARKE80', toWGS84: [-160, -6, -302] },
    ARC1950: { label: 'Arc 1950 (older southern-African maps)', ellipsoid: 'CLARKE80ARC', toWGS84: [-143, -90, -294] }
  };

  /* ---------------- Transverse Mercator (Krüger / Karney) ---------------- */
  const tmCache = {};
  function tmConsts(ellKey) {
    if (tmCache[ellKey]) return tmCache[ellKey];
    const { a, f } = ELLIPSOIDS[ellKey];
    const e = Math.sqrt(f * (2 - f));
    const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
    const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
    const alpha = [null,
      n / 2 - 2 / 3 * n2 + 5 / 16 * n3 + 41 / 180 * n4 - 127 / 288 * n5 + 7891 / 37800 * n6,
      13 / 48 * n2 - 3 / 5 * n3 + 557 / 1440 * n4 + 281 / 630 * n5 - 1983433 / 1935360 * n6,
      61 / 240 * n3 - 103 / 140 * n4 + 15061 / 26880 * n5 + 167603 / 181440 * n6,
      49561 / 161280 * n4 - 179 / 168 * n5 + 6601661 / 7257600 * n6,
      34729 / 80640 * n5 - 3418889 / 1995840 * n6,
      212378941 / 319334400 * n6];
    const beta = [null,
      n / 2 - 2 / 3 * n2 + 37 / 96 * n3 - 1 / 360 * n4 - 81 / 512 * n5 + 96199 / 604800 * n6,
      1 / 48 * n2 + 1 / 15 * n3 - 437 / 1440 * n4 + 46 / 105 * n5 - 1118711 / 3870720 * n6,
      17 / 480 * n3 - 37 / 840 * n4 - 209 / 4480 * n5 + 5569 / 90720 * n6,
      4397 / 161280 * n4 - 11 / 504 * n5 - 830251 / 7257600 * n6,
      4583 / 161280 * n5 - 108847 / 3991680 * n6,
      20648693 / 638668800 * n6];
    return (tmCache[ellKey] = { a, e, A, alpha, beta });
  }
  const K0 = 0.9996, FE = 500000, FN_SOUTH = 10000000;

  function zoneFor(lon) { return Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1)); }
  function centralMeridian(zone) { return (zone - 1) * 6 - 180 + 3; }

  /* Grid systems. Every grid here is a Transverse Mercator; only its numbers differ.
     UTM: 6° zones, scale 0.9996, false easting 500 km, false northing 10 000 km in the south.
     TM Rwanda (national grid, used on current Rwandan 1:50 000 sheets): central meridian 30°E,
     scale 0.9999, false easting 500 km, false northing 5 000 km, WGS 84 / ITRF2005. */
  const GRIDS = {
    UTM:  { label: 'UTM' },
    TMRW: { label: 'Rwanda national grid (TM Rwanda)', cm: 30, k0: 0.9999, fe: 500000, fn: 5000000 }
  };
  function tmParams(grid, zone, south) {
    if (grid === 'TMRW') return GRIDS.TMRW;
    return { cm: centralMeridian(zone), k0: K0, fe: FE, fn: south ? FN_SOUTH : 0 };
  }

  /** lat/lon (degrees) → { E, N, k (scale), gamma (convergence, deg) } in given zone. South hemisphere false northing. */
  function toUTM(lat, lon, zone, ellKey = 'WGS84', south = lat < 0) {
    return Object.assign(toTM(lat, lon, tmParams('UTM', zone, south), ellKey), { zone, south });
  }
  /** Generic Transverse Mercator forward. P = { cm, k0, fe, fn }. */
  function toTM(lat, lon, P, ellKey = 'WGS84') {
    const { e, A, alpha } = tmConsts(ellKey);
    const K0 = P.k0;
    const phi = lat * D2R, lam = (lon - P.cm) * D2R;
    const cosL = Math.cos(lam), sinL = Math.sin(lam), tanL = Math.tan(lam);
    const tau = Math.tan(phi);
    const sigma = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau)));
    const taup = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const xip = Math.atan2(taup, cosL);
    const etap = Math.asinh(sinL / Math.sqrt(taup * taup + cosL * cosL));
    let xi = xip, eta = etap, pp = 1, qp = 0;
    for (let j = 1; j <= 6; j++) {
      xi  += alpha[j] * Math.sin(2 * j * xip) * Math.cosh(2 * j * etap);
      eta += alpha[j] * Math.cos(2 * j * xip) * Math.sinh(2 * j * etap);
      pp  += 2 * j * alpha[j] * Math.cos(2 * j * xip) * Math.cosh(2 * j * etap);
      qp  += 2 * j * alpha[j] * Math.sin(2 * j * xip) * Math.sinh(2 * j * etap);
    }
    const x = K0 * A * eta, y = K0 * A * xi;
    const gp = Math.atan(taup / Math.sqrt(1 + taup * taup) * tanL);
    const gpp = Math.atan2(qp, pp);
    const sinphi = Math.sin(phi);
    const kp = Math.sqrt(1 - e * e * sinphi * sinphi) * Math.sqrt(1 + tau * tau) / Math.sqrt(taup * taup + cosL * cosL);
    const kpp = A / tmConsts(ellKey).a * Math.sqrt(pp * pp + qp * qp);
    return { E: x + P.fe, N: y + P.fn, k: K0 * kp * kpp, gamma: (gp + gpp) * R2D };
  }

  /** UTM → lat/lon (degrees). */
  function fromUTM(E, N, zone, south, ellKey = 'WGS84') { return fromTM(E, N, tmParams('UTM', zone, south), ellKey); }
  function fromTM(E, N, P, ellKey = 'WGS84') {
    const { e, A, beta } = tmConsts(ellKey);
    const K0 = P.k0;
    const x = E - P.fe, y = N - P.fn;
    const eta = x / (K0 * A), xi = y / (K0 * A);
    let xip = xi, etap = eta;
    for (let j = 1; j <= 6; j++) {
      xip  -= beta[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      etap -= beta[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const sinhEtap = Math.sinh(etap), sinXip = Math.sin(xip), cosXip = Math.cos(xip);
    const taup = sinXip / Math.sqrt(sinhEtap * sinhEtap + cosXip * cosXip);
    let tau = taup, dTau;
    let guard = 0;
    do {
      const sigma = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau)));
      const taui = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
      dTau = (taup - taui) / Math.sqrt(1 + taui * taui) *
             (1 + (1 - e * e) * tau * tau) / ((1 - e * e) * Math.sqrt(1 + tau * tau));
      tau += dTau;
    } while (Math.abs(dTau) > 1e-13 && ++guard < 20);
    const lat = Math.atan(tau) * R2D;
    const lon = Math.atan2(sinhEtap, cosXip) * R2D + P.cm;
    return { lat, lon };
  }

  /* ---------------- Datum shift (geocentric 3-parameter) ---------------- */
  function toECEF(lat, lon, ellKey) {
    const { a, f } = ELLIPSOIDS[ellKey], e2 = f * (2 - f);
    const p = lat * D2R, l = lon * D2R, s = Math.sin(p);
    const N = a / Math.sqrt(1 - e2 * s * s);
    return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - e2) * s];
  }
  function fromECEF(X, Y, Z, ellKey) {
    const { a, f } = ELLIPSOIDS[ellKey], e2 = f * (2 - f);
    const lon = Math.atan2(Y, X), p = Math.hypot(X, Y);
    let lat = Math.atan2(Z, p * (1 - e2));
    for (let i = 0; i < 8; i++) {
      const s = Math.sin(lat), N = a / Math.sqrt(1 - e2 * s * s);
      lat = Math.atan2(Z + e2 * N * s, p);
    }
    return { lat: lat * R2D, lon: lon * R2D };
  }
  /** Convert a position between datums ('WGS84' | 'ARC1960'). */
  function convertDatum(lat, lon, from, to) {
    if (from === to) return { lat, lon };
    const F = DATUMS[from], T = DATUMS[to];
    let [X, Y, Z] = toECEF(lat, lon, F.ellipsoid);
    X += F.toWGS84[0] - T.toWGS84[0];
    Y += F.toWGS84[1] - T.toWGS84[1];
    Z += F.toWGS84[2] - T.toWGS84[2];
    return fromECEF(X, Y, Z, T.ellipsoid);
  }

  /* ---------------- Grid reference strings ---------------- */
  const SQ = 100000; // 100 km square
  const mod = (a, m) => ((a % m) + m) % m;
  const wrapHalf = d => mod(d + SQ / 2, SQ) - SQ / 2; // into [-50 km, +50 km)

  /** "214 534" | "214534" | "21405340" → { e, n, digits, square } (metres inside the 100 km square). */
  function parseGridRef(str) {
    const raw = String(str ?? '').replace(/[\s,./-]+/g, '');
    if (!/^\d+$/.test(raw)) throw new Error('A grid reference uses digits only, e.g. 214534.');
    if (raw.length % 2 || raw.length < 4 || raw.length > 10)
      throw new Error('Use 4, 6, 8 or 10 digits (half easting, half northing).');
    const half = raw.length / 2, unit = Math.pow(10, 5 - half);
    const e = parseInt(raw.slice(0, half), 10) * unit;
    const n = parseInt(raw.slice(half), 10) * unit;
    return { e, n, digits: raw.length, unit };
  }

  /** metres-in-square → grid reference string with the given digits (4/6/8/10). Rounded to nearest. */
  function formatGridRef(eM, nM, digits = 6, spaced = true) {
    const half = digits / 2, unit = Math.pow(10, 5 - half), m = Math.pow(10, half);
    const e = mod(Math.round(eM / unit), m), n = mod(Math.round(nM / unit), m);
    const es = String(e).padStart(half, '0'), ns = String(n).padStart(half, '0');
    return spaced ? es + ' ' + ns : es + ns;
  }

  /* ---------------- Map profile (calibration) ----------------
     profile = {
       grid: 'TMRW' | 'UTM',            // which grid is printed on the map
       datum: 'WGS84' | 'ARC1960',
       zone: 35,                        // UTM only
       mode: 'known' | 'utm' | 'origin',
         known  = standard grid, we only need roughly where the sheet is (originLat/Lon, no originGrid)
         utm    = standard grid, located by a typed corner (corner reading errors are ignored)
         origin = trust the typed corner exactly (local / unknown grids)
       originGrid: '007438',            // corner grid (not needed in 'known' mode)
       originLat: -2.25, originLon: 30, // corner, or any place on/near the sheet in 'known' mode
       gma: 0                           // grid-magnetic angle, degrees (+ = magnetic east of grid north)
     }
  ---------------------------------------------------------------- */
  function calibrate(profile) {
    const grid = profile.grid === 'TMRW' ? 'TMRW' : 'UTM';
    const datum = grid === 'TMRW' ? 'WGS84' : (profile.datum || 'WGS84');
    const ell = DATUMS[datum].ellipsoid;
    const south = profile.originLat < 0;
    const zone = grid === 'TMRW' ? null : (Number(profile.zone) || zoneFor(profile.originLon));
    const P = tmParams(grid, zone, south);
    const o = toTM(profile.originLat, profile.originLon, P, ell);
    let g, baseE, baseN, misE = 0, misN = 0;
    const hasGrid = profile.mode !== 'known' && String(profile.originGrid || '').replace(/\D/g, '').length >= 4;
    if (!hasGrid) {                       // standard grid + approximate location: pick the 100 km square around it
      g = { e: mod(o.E, SQ), n: mod(o.N, SQ), digits: 10, unit: 1 };
      baseE = o.E - g.e; baseN = o.N - g.n;
    } else {
      g = parseGridRef(profile.originGrid);
      misE = wrapHalf(o.E - g.e); misN = wrapHalf(o.N - g.n);   // typed corner vs. true grid (metres)
      if (profile.mode === 'origin') { baseE = o.E - g.e; baseN = o.N - g.n; }
      else { baseE = Math.round((o.E - g.e) / SQ) * SQ; baseN = Math.round((o.N - g.n) / SQ) * SQ; }
    }
    return { grid, datum, ell, zone, south, P, baseE, baseN, originE: o.E, originN: o.N,
      og: g, misE, misN, misfit: Math.hypot(misE, misN), gma: Number(profile.gma) || 0,
      label: grid === 'TMRW' ? 'TM Rwanda' : `UTM ${zone}${south ? 'S' : 'N'}` };
  }
  const project = (cal, lat, lon) => toTM(lat, lon, cal.P, cal.ell);
  const unproject = (cal, E, N) => fromTM(E, N, cal.P, cal.ell);

  /** Which standard grid fits a typed corner best? Tries TM Rwanda and nearby UTM zones. */
  function detectGrid(originGrid, originLat, originLon, datum = 'WGS84') {
    const z0 = zoneFor(originLon), out = [];
    const tr = calibrate({ grid: 'TMRW', mode: 'utm', originGrid, originLat, originLon });
    out.push({ grid: 'TMRW', datum: 'WGS84', zone: null, misfit: tr.misfit, label: 'Rwanda national grid (TM Rwanda)' });
    for (const zone of [z0 - 1, z0, z0 + 1]) {
      if (zone < 1 || zone > 60) continue;
      const c = calibrate({ grid: 'UTM', datum, zone, mode: 'utm', originGrid, originLat, originLon });
      out.push({ grid: 'UTM', datum, zone, misfit: c.misfit, label: `UTM zone ${zone}${originLat < 0 ? 'S' : 'N'}` });
    }
    out.sort((a, b) => a.misfit - b.misfit);
    return out;
  }

  /** Where the lat/lon lines (every `stepMin` minutes) cross the grid near a place — to compare with the red margin labels. */
  function graticuleCheck(cal, lat, lon, stepMin = 5) {
    const st = stepMin / 60;
    const lat0 = Math.round(lat / st) * st, lon0 = Math.round(lon / st) * st;
    const at = (la, lo) => { const u = project(cal, la, lo); return { e: mod(u.E - cal.baseE, SQ) / 1000, n: mod(u.N - cal.baseN, SQ) / 1000 }; };
    return {
      meridians: [lon0 - st, lon0, lon0 + st].map(lo => ({ lon: lo, e: at(lat0, lo).e })),
      parallels: [lat0 - st, lat0, lat0 + st].map(la => ({ lat: la, n: at(la, lon0).n }))
    };
  }

  function fullFromGrid(cal, e, n) {
    // Choose the copy of (e, n) nearest the origin, so grids roll over 99→00 correctly.
    const E = cal.baseE + cal.og.e + wrapHalf(e - cal.og.e);
    const N = cal.baseN + cal.og.n + wrapHalf(n - cal.og.n);
    return { E, N };
  }

  /** Grid reference → position. lat/lon returned in map datum AND WGS 84. */
  function gridToGeo(gridStr, profile, cal = calibrate(profile)) {
    const g = parseGridRef(gridStr);
    let { e, n } = g;
    if (g.digits === 4) { e += 500; n += 500; } // a 4-figure GR names a 1 km square → use its centre
    const { E, N } = fullFromGrid(cal, e, n);
    const p = unproject(cal, E, N);
    const w = convertDatum(p.lat, p.lon, cal.datum, 'WGS84');
    return {
      lat: p.lat, lon: p.lon, wgsLat: w.lat, wgsLon: w.lon, E, N,
      precision: g.unit, digits: g.digits,
      grid: formatGridRef(e - (g.digits === 4 ? 500 : 0), n - (g.digits === 4 ? 500 : 0), g.digits)
    };
  }

  /** lat/lon (in `datumOfInput`, default the map datum) → grid references at every precision. */
  function geoToGrid(lat, lon, profile, datumOfInput, cal = calibrate(profile)) {
    const src = datumOfInput || cal.datum;
    const p = convertDatum(lat, lon, src, cal.datum);
    const u = project(cal, p.lat, p.lon);
    const e = u.E - cal.baseE, n = u.N - cal.baseN;
    const w = convertDatum(p.lat, p.lon, cal.datum, 'WGS84');
    const offSheetKm = Math.hypot(u.E - cal.originE, u.N - cal.originN) / 1000;
    return {
      lat: p.lat, lon: p.lon, wgsLat: w.lat, wgsLon: w.lon, E: u.E, N: u.N,
      grid4: formatGridRef(Math.floor(mod(e, SQ) / 1000) * 1000, Math.floor(mod(n, SQ) / 1000) * 1000, 4), // 4-fig = square containing point
      grid6: formatGridRef(e, n, 6), grid8: formatGridRef(e, n, 8), grid10: formatGridRef(e, n, 10),
      e: mod(e, SQ), n: mod(n, SQ), k: u.k, gamma: u.gamma, offSheetKm
    };
  }

  /* ---------------- Distances & bearings (on the grid, what cadets measure) ---------------- */
  /** a, b: { E, N } full UTM in the same profile. Ground distance corrects the grid scale factor. */
  function legInfo(a, b, cal) {
    const dE = b.E - a.E, dN = b.N - a.N;
    const gridDist = Math.hypot(dE, dN);
    let k = K0;
    if (cal) {
      const mid = unproject(cal, (a.E + b.E) / 2, (a.N + b.N) / 2);
      k = project(cal, mid.lat, mid.lon).k;
    }
    const gb = (Math.atan2(dE, dN) * R2D + 360) % 360;
    const gma = cal ? cal.gma : 0;
    return {
      ground: gridDist / k, grid: gridDist, gridBearing: gb,
      magBearing: (gb - gma + 360) % 360,
      mils: Math.round(gb / 360 * 6400) % 6400
    };
  }

  /* ---------------- Formatting ---------------- */
  function toDMS(v, isLat, dp = 2) {
    const hemi = v < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
    let a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60);
    let s = ((a - d) * 60 - m) * 60;
    if (Number(s.toFixed(dp)) >= 60) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(dp).padStart(3 + dp, '0')}″ ${hemi}`;
  }
  function toDDM(v, isLat, dp = 4) {
    const hemi = v < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
    const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
    return `${d}° ${m.toFixed(dp).padStart(3 + dp, '0')}′ ${hemi}`;
  }
  const fmtDD = (v) => v.toFixed(6);
  function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km'; }

  /* ---------------- Smart input parsing ----------------
     Accepts: "214534", "214 534", "-2.3194, 30.1785", "2.3194 S 30.1785 E",
              "2°19'4.8\"S 30°0'16.2\"E", "2 19 4.8 S 30 0 16.2 E", "S 2 19.08 E 30 0.27"
     Returns { kind: 'grid', grid } or { kind: 'geo', lat, lon, assumedSouth? } or throws.
  ---------------------------------------------------------------- */
  function parseAny(text, hintLat) {
    const s = String(text ?? '').trim();
    if (!s) throw new Error('Type a grid reference or a latitude/longitude.');
    const compact = s.replace(/[\s,]+/g, '');
    if (/^\d+$/.test(compact) && !/[.°'"′″NSEWnsew-]/.test(s)) {
      parseGridRef(compact);
      return { kind: 'grid', grid: compact };
    }
    return Object.assign({ kind: 'geo' }, parseLatLon(s, hintLat));
  }

  function partsToDeg(nums) {
    const [d = 0, m = 0, sec = 0] = nums;
    if (m < 0 || m >= 60 || sec < 0 || sec >= 60) throw new Error('Minutes and seconds must be between 0 and 59.');
    return Math.abs(d) + m / 60 + sec / 3600;
  }

  function parseLatLon(text, hintLat) {
    let t = String(text).toUpperCase()
      .replace(/[°º˚]/g, ' ').replace(/[′'’]/g, ' ').replace(/[″"”]|''/g, ' ')
      .replace(/DEG|MIN|SEC/g, ' ');
    // Find hemisphere letters and split around them.
    const groups = [];
    const re = /([NSEW])?\s*(-?\d+(?:\.\d+)?(?:[\s,;]+-?\d+(?:\.\d+)?){0,2})\s*([NSEW])?/g;
    let m;
    const hasHemi = /[NSEW]/.test(t);
    if (hasHemi) {
      while ((m = re.exec(t)) !== null) {
        if (!m[2]) { re.lastIndex++; continue; }
        const hemi = m[1] || m[3] || null;
        const nums = m[2].split(/[\s,;]+/).map(Number);
        groups.push({ hemi, nums });
        if (groups.length > 2) break;
      }
      // If one letter attached both sides ("2 S 30 E"), regex may pair wrongly; normalise
    } else {
      const parts = t.split(/[,;]/).map(x => x.trim()).filter(Boolean);
      if (parts.length === 2) parts.forEach(p => groups.push({ hemi: null, nums: p.split(/\s+/).map(Number) }));
      else {
        const nums = t.trim().split(/\s+/).map(Number);
        if (![2, 4, 6].includes(nums.length)) throw new Error('Could not read that position. Try "-2.3194, 30.1785" or 2°19′04.8″S 30°00′16.2″E.');
        const h = nums.length / 2;
        groups.push({ hemi: null, nums: nums.slice(0, h) }, { hemi: null, nums: nums.slice(h) });
      }
    }
    if (groups.length !== 2 || groups.some(g => g.nums.some(isNaN)))
      throw new Error('Could not read that position. Give latitude then longitude.');
    let [g1, g2] = groups;
    if (g1.hemi === 'E' || g1.hemi === 'W' || g2.hemi === 'N' || g2.hemi === 'S') [g1, g2] = [g2, g1];
    const neg1 = g1.nums[0] < 0 || Object.is(g1.nums[0], -0), neg2 = g2.nums[0] < 0;
    let lat = partsToDeg(g1.nums), lon = partsToDeg(g2.nums);
    if (neg1 || g1.hemi === 'S') lat = -lat;
    if (neg2 || g2.hemi === 'W') lon = -lon;
    let assumedSouth = false;
    // Typed "2.31, 30.17" without minus or letter while working on a southern map → south.
    if (!g1.hemi && !neg1 && hintLat !== undefined && hintLat < 0 && Math.abs(lat - hintLat) > Math.abs(-lat - hintLat)) {
      lat = -lat; assumedSouth = true;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Latitude must be within ±90° and longitude within ±180°.');
    return { lat, lon, assumedSouth };
  }

  const Geo = {
    DATUMS, zoneFor, centralMeridian, toUTM, fromUTM, convertDatum,
    GRIDS, toTM, fromTM, project, unproject, graticuleCheck,
    parseGridRef, formatGridRef, calibrate, detectGrid, gridToGeo, geoToGrid, legInfo,
    toDMS, toDDM, fmtDD, fmtDist, parseAny, parseLatLon
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Geo;
  else root.Geo = Geo;
})(typeof window !== 'undefined' ? window : globalThis);
