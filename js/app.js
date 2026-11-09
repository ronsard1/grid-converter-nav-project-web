/* ==================================================================
   app.js — screens and interaction
   Screens: Maps · Convert · Points · Exercise · Control (+ Map on phones)
   ================================================================== */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const COLORS = ['#1E56A0', '#E8590C', '#2F7D4A', '#8E44AD', '#B7791F', '#0E7C86', '#C2185B', '#5D4037', '#3949AB', '#7CB342', '#D84315', '#00897B', '#6D4C41', '#AD1457', '#283593', '#558B2F', '#EF6C00', '#00695C', '#4527A0', '#9E9D24'];
  const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const colorOf = i => COLORS[(i - 1) % COLORS.length];

  const S = {
    view: 'convert', mapId: null, exId: null, selRoute: null,
    pick: null,               // 'convert' | 'point' — what a map tap does
    convSrc: 'map',           // datum of typed lat/lon: 'map' | 'wgs'
    boardMode: 'syn', lastConv: null
  };
  const prefKey = k => `gridnav:${Store.user?.uid || 'x'}:${k}`;

  /* ---------------- toasts & sheets ---------------- */
  function toast(msg, bad) {
    $$('#toasts .toast').forEach(t => t.remove());
    const el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  addEventListener('store-error', e => toast('Not saved: ' + e.detail, true));
    function openSheet(html, onOpen) {
    $('#sheetBox').innerHTML = html; $('#sheet').hidden = false;
    const first = $('#sheetBox input, #sheetBox select, #sheetBox button'); if (first && innerWidth > 860) first.focus();
    onOpen && onOpen($('#sheetBox'));
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetBox').innerHTML = ''; }
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) closeSheet(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  function confirmSheet(title, msg, yesLabel, onYes) {
    openSheet(`<div class="sheet-head"><h3>${esc(title)}</h3></div><p class="muted">${esc(msg)}</p>
      <div class="sheet-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="yes">${esc(yesLabel)}</button></div>`,
      b => $('#yes', b).onclick = () => { closeSheet(); onYes(); });
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied ' + text); }
    catch (e) { toast('Copy not allowed here — select the text instead', true); }
  }
  document.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) copy(c.dataset.copy); });

  /* ---------------- map profile helpers ---------------- */
  const maps = () => Store.list('maps').slice().sort((a, b) => a.createdAt - b.createdAt);
  const activeMap = () => Store.get('maps', S.mapId);
  const calCache = new Map();
  function cal(map = activeMap()) {
    if (!map) return null;
    const key = map.id + ':' + map.updatedAt;
    if (!calCache.has(key)) { try { calCache.set(key, Geo.calibrate(map)); } catch (e) { calCache.set(key, null); } }
    return calCache.get(key);
  }
  const points = (mapId = S.mapId) => Store.list('points').filter(p => p.mapId === mapId).sort((a, b) => a.no - b.no);
  const ptById = id => Store.get('points', id);
  function geoOf(p, map = activeMap()) { return Geo.geoToGrid(p.lat, p.lon, map, map.datum, cal(map)); }
  function gridOf(p, digits = 6) { if (!p) return ''; try { return geoOf(p)['grid' + digits]; } catch (e) { return '—'; } }
  function wgsOf(p, map = activeMap()) { return Geo.convertDatum(p.lat, p.lon, map.datum, 'WGS84'); }
  function grHTML(g, size = 'md') {
    const [e, n] = String(g).split(' ');
    return `<span class="gr ${size}"><span class="e">${esc(e)}</span><span class="n">${esc(n || '')}</span></span>`;
  }
  function leg(a, b) { const m = activeMap(); return Geo.legInfo(geoOf(a, m), geoOf(b, m), cal(m)); }
  function bearingText(info) {
    const m = activeMap();
    const mag = m && m.gma ? ` · mag ${Math.round(info.magBearing)}°` : '';
    return `${Math.round(info.gridBearing).toString().padStart(3, '0')}° (${info.mils} mils)${mag}`;
  }

  /* ---------------- navigation ---------------- */
  function go(view) {
    if (view === 'map') { $('#app').classList.add('show-map'); markNav('map'); setTimeout(() => { MapUI.resize(); MapUI.redraw(true); }, 60); return; }
    $('#app').classList.remove('show-map');
    S.view = view; lsSet(prefKey('view'), view);
    $$('.view').forEach(v => v.classList.toggle('on', v.dataset.view === view));
    markNav(view);
    $('#app').classList.toggle('board-wide', view === 'control' && S.wide);
    render(view);
    MapUI.redraw(view === 'points');
    setTimeout(() => MapUI.resize(), 60);
    $('#panel').scrollTop = 0;
  }
  // Phone Back button: close an open window, leave the map, go back to Maps; only then leave the app.
  window.__gnBack = () => {
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if ($('#app').classList.contains('show-map')) { go(S.view); return true; }
    if (S.view !== 'maps') { go('maps'); return true; }
    return false;
  };
  function markNav(v) { $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === v)); }
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

  function render(view = S.view) {
    const m = activeMap();
    $('#mapChipName').textContent = m ? m.name : 'No map yet — tap to add';
    ({ maps: renderMaps, convert: renderConvert, points: renderPoints, exercise: renderExercise, control: renderControl })[view]();
  }
  const needMap = (what) => `<div class="empty"><p><b>Add your map sheet first.</b></p><p class="small muted">${what} uses the map's grid. For Rwandan 1:50 000 sheets you only choose the district.</p><button class="btn primary" data-act="newmap">Add a map</button></div>`;
  document.addEventListener('click', e => { if (e.target.closest('[data-act="newmap"]')) mapEditor(); });

  /* ================================================================
     MAPS
     ================================================================ */
  function renderMaps() {
    const el = $('[data-view="maps"]');
    const list = maps();
    el.innerHTML = `<div class="view-head"><div><h2>Maps</h2><p>Each map sheet has its own grid. Conversions and exercises use the map you choose here.</p></div>
      <button class="btn primary" id="newMap">New map</button></div>
      ${list.length ? list.map(m => {
        const c = cal(m); const n = points(m.id).length;
        return `<button class="mapcard ${m.id === S.mapId ? 'on' : ''}" data-id="${m.id}">
          <div class="t"><b>${esc(m.name)}</b>${m.id === S.mapId ? '<span class="badge">In use</span>' : ''}</div>
          <div class="small muted" style="margin-top:4px">${m.mode === 'known' ? `Sheet near ${esc(m.district || (Geo.toDMS(m.originLat, true, 0) + ' ' + Geo.toDMS(m.originLon, false, 0)))}` : `Corner ${esc(m.originGrid)} · ${esc(Geo.toDMS(m.originLat, true, 1))} ${esc(Geo.toDMS(m.originLon, false, 1))}`}</div>
          <div class="row" style="margin-top:8px">
            <span class="badge soft">${c ? esc(c.label) : '?'}</span>
            <span class="badge soft">${c && c.datum === 'ARC1960' ? 'Arc 1960' : c && c.datum === 'ARC1950' ? 'Arc 1950' : 'WGS 84'}</span>
            <span class="badge ${m.mode === 'origin' ? 'warn' : 'soft'}">${m.mode === 'origin' ? 'From corner' : 'Exact grid'}</span>
            <span class="badge soft">${n} point${n === 1 ? '' : 's'}</span>
            <span class="grow"></span>
            <span class="icon-btn sm" data-edit="${m.id}" role="button" aria-label="Edit map">${icon('edit')}</span>
          </div></button>`;
      }).join('') : `<div class="empty start"><p><b>Start in 4 steps</b></p>
        <ol class="steps"><li><b>Add your map</b>: tap <i>New map</i>, give it a name and choose its grid.</li>
        <li><b>Add points</b>: in <i>Points</i>, type each checkpoint's grid (and the Index / start).</li>
        <li><b>Plan</b>: in <i>Exercise</i>, choose syndicates, checkpoints per route and the km, then <i>Make routes</i>.</li>
        <li><b>Print</b>: leader summary and one paper per syndicate. Track them in <i>Control</i>.</li></ol>
        <p class="small">Everything stays on this phone and works with no internet. Use the save icon (top right) to keep a backup.</p></div>`}`;
    $('#newMap', el).onclick = () => mapEditor();
    $$('.mapcard', el).forEach(c => c.onclick = e => {
      const ed = e.target.closest('[data-edit]');
      if (ed) { e.stopPropagation(); mapEditor(Store.get('maps', ed.dataset.edit)); return; }
      setMap(c.dataset.id); toast('Using ' + activeMap().name); go('convert');
    });
  }
  function setMap(id) {
    S.mapId = id; lsSet(prefKey('map'), id);
    const ex = Store.list('exercises').filter(x => x.mapId === id);
    S.exId = ex.find(x => x.id === lsGet(prefKey('ex'), null))?.id || ex[0]?.id || null;
    S.selRoute = null;
    MapUI.fitPoints();
  }

  // Approximate district centres — only used to pick the right 100 km grid square (needs to be within ~50 km).
  const RW_DISTRICTS = [['Bugesera', -2.20, 30.15], ['Burera', -1.47, 29.83], ['Gakenke', -1.70, 29.78], ['Gasabo', -1.90, 30.12], ['Gatsibo', -1.60, 30.45],
    ['Gicumbi', -1.58, 30.07], ['Gisagara', -2.62, 29.83], ['Huye', -2.60, 29.74], ['Kamonyi', -2.00, 29.90], ['Karongi', -2.07, 29.38], ['Kayonza', -1.90, 30.50],
    ['Kicukiro', -1.99, 30.10], ['Kirehe', -2.25, 30.70], ['Muhanga', -2.08, 29.75], ['Musanze', -1.50, 29.60], ['Ngoma', -2.17, 30.47], ['Ngororero', -1.87, 29.62],
    ['Nyabihu', -1.65, 29.50], ['Nyagatare', -1.30, 30.32], ['Nyamagabe', -2.47, 29.47], ['Nyamasheke', -2.33, 29.10], ['Nyanza', -2.35, 29.75], ['Nyarugenge', -1.96, 30.04],
    ['Nyaruguru', -2.70, 29.53], ['Rubavu', -1.68, 29.33], ['Ruhango', -2.22, 29.78], ['Rulindo', -1.73, 29.99], ['Rusizi', -2.48, 28.90], ['Rutsiro', -1.93, 29.33], ['Rwamagana', -1.95, 30.43]];
  // Reference towns for UTM maps outside Rwanda (only used to pick the 100 km square and zone).
  const PLACES = [['Burundi — Bujumbura', -3.38, 29.36], ['Burundi — Cibitoke', -2.89, 29.12], ['Burundi — Gitega', -3.43, 29.93], ['Burundi — Ngozi', -2.91, 29.83],
    ['Burundi — Kirundo', -2.58, 30.10], ['Burundi — Muyinga', -2.85, 30.34], ['Burundi — Rutana', -3.93, 29.99], ['Burundi — Makamba', -4.14, 29.80],
    ['DR Congo — Goma', -1.68, 29.23], ['DR Congo — Bukavu', -2.51, 28.86], ['DR Congo — Uvira', -3.40, 29.14], ['DR Congo — Beni', 0.49, 29.47],
    ['DR Congo — Bunia', 1.56, 30.25], ['DR Congo — Kisangani', 0.52, 25.19], ['DR Congo — Kalemie', -5.95, 29.19], ['DR Congo — Lubumbashi', -11.66, 27.48],
    ['DR Congo — Kinshasa', -4.32, 15.31], ['Uganda — Kabale', -1.25, 29.99], ['Tanzania — Kigoma', -4.88, 29.63]];
  const nearestDistrict = (lat, lon) => RW_DISTRICTS.reduce((b, d) => Math.hypot(d[1] - lat, d[2] - lon) < Math.hypot(b[1] - lat, b[2] - lon) ? d : b);
  const minLabel = (v, isLat) => { const a = Math.abs(v), d = Math.floor(a + 1e-9), mm = Math.round((a - d) * 60); return `${d}°${String(mm).padStart(2, '0')}′${isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E')}`; };
  function graticuleHTML(cal, lat, lon) {
    const g = Geo.graticuleCheck(cal, lat, lon, 5);
    return `<div class="callout"><b>Check it against your sheet.</b> Find the red lat/long labels on the margin. With this grid they must sit here:
      <div class="grid2" style="margin-top:6px">
        <div>${g.meridians.map(x => `${minLabel(x.lon, false)} → easting <b>${x.e.toFixed(1)}</b>`).join('<br>')}</div>
        <div>${g.parallels.map(x => `${minLabel(x.lat, true)} → northing <b>${x.n.toFixed(1)}</b>`).join('<br>')}</div></div>
      <div class="tiny" style="margin-top:6px">Example: if 30°10′E is printed between grid lines 18 and 19, the grid is right.</div></div>`;
  }

  function mapEditor(m) {
    const isNew = !m;
    m = m || { name: '', grid: 'TMRW', mode: 'known', originGrid: '', originLat: null, originLon: null, datum: 'WGS84', zone: null, gma: 0 };
    let kind = m.mode === 'known' ? (m.grid === 'TMRW' ? 'rw' : 'utm') : 'other';
    let ref = kind === 'rw' && m.originLat != null ? { lat: m.originLat, lon: m.originLon, district: m.district } : null;
    let uref = kind === 'utm' && m.originLat != null ? { lat: m.originLat, lon: m.originLon, place: m.district } : null;
    const latlonText = m.mode !== 'known' && m.originLat != null ? `${Geo.toDMS(m.originLat, true, 2)} ${Geo.toDMS(m.originLon, false, 2)}` : '';
    openSheet(`<div class="sheet-head"><h3>${isNew ? 'New map' : 'Edit map'}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="stack">
        <label class="fld"><span>Map name</span><input id="mName" value="${esc(m.name)}" placeholder="e.g. Kanazi 1:50 000"></label>
        <div class="fld"><span>Grid printed on the map</span>
          <div class="choice" id="mKind">
            <button type="button" data-v="rw" class="${kind === 'rw' ? 'on' : ''}"><b>Rwanda national grid</b><small>Rwandan 1:50 000 sheets (margin says Datum WGS 84). No corner numbers needed.</small></button>
            <button type="button" data-v="utm" class="${kind === 'utm' ? 'on' : ''}"><b>UTM grid</b><small>Burundi, DR Congo and most military (NATO) maps. The margin says "Universal Transverse Mercator". No corner numbers needed.</small></button>
            <button type="button" data-v="other" class="${kind === 'other' ? 'on' : ''}"><b>I'm not sure / local grid</b><small>Enter the bottom-left corner and the app finds the grid for you.</small></button>
          </div></div>

        <div id="kRw" class="stack" ${kind === 'rw' ? '' : 'hidden'}>
          <label class="fld"><span>Where is the sheet?</span><select id="mDist"><option value="">Choose the district…</option>
            ${RW_DISTRICTS.map(d => `<option ${ref && ref.district === d[0] ? 'selected' : ''}>${d[0]}</option>`).join('')}</select>
            <div class="help">Roughly is enough — it only tells the app which 100 km grid square you are in.</div></label>
          <label class="fld"><span>…or type any lat/lon printed on the sheet</span><input id="mRefLL" placeholder="2°15'00&quot;S 30°10'00&quot;E" value="${ref && !ref.district ? esc(Geo.toDMS(ref.lat, true, 0) + ' ' + Geo.toDMS(ref.lon, false, 0)) : ''}"></label>
          <div class="row"><button type="button" class="btn sm" id="mHere">${icon('gps')} I'm on this sheet now</button><span class="tiny" id="mHereTxt"></span></div>
          <div id="mGrat"></div>
        </div>

        <div id="kUtm" class="stack" ${kind === 'utm' ? '' : 'hidden'}>
          <label class="fld"><span>Where is the sheet?</span><select id="uPlace"><option value="">Choose a nearby town…</option>
            ${PLACES.map(d => `<option ${uref && uref.place === d[0] ? 'selected' : ''}>${d[0]}</option>`).join('')}</select>
            <div class="help">Or type any latitude/longitude printed on the sheet:</div></label>
          <label class="fld"><input id="uLL" placeholder="3°20'00&quot;S 29°20'00&quot;E" value="${uref && !uref.place ? esc(Geo.toDMS(uref.lat, true, 0) + ' ' + Geo.toDMS(uref.lon, false, 0)) : ''}"></label>
          <div class="row"><button type="button" class="btn sm" id="uHere">${icon('gps')} I'm on this sheet now</button><span class="tiny" id="uHereTxt"></span></div>
          <div class="grid2">
            <label class="fld"><span>Datum (map margin)</span><select id="uDatum">
              <option value="WGS84" ${m.datum !== 'ARC1960' && m.datum !== 'ARC1950' ? 'selected' : ''}>WGS 84</option>
              <option value="ARC1960" ${m.datum === 'ARC1960' ? 'selected' : ''}>Arc 1960</option>
              <option value="ARC1950" ${m.datum === 'ARC1950' ? 'selected' : ''}>Arc 1950</option></select></label>
            <label class="fld"><span>UTM zone (map margin)</span><input id="uZone" type="number" min="1" max="60" value="${kind === 'utm' && m.zone ? m.zone : ''}" placeholder="auto"></label>
          </div>
          <div id="uGrat"></div>
        </div>

        <div id="kOther" class="stack" ${kind === 'other' ? '' : 'hidden'}>
          <div class="callout">Find the <b>bottom-left corner</b> of the sheet. Write the grid reference of that corner and the latitude/longitude printed there.</div>
          <label class="fld big"><span>Corner grid reference</span><input id="mGrid" inputmode="numeric" value="${esc(m.mode === 'known' ? '' : m.originGrid)}" placeholder="007 438"><div class="help">4, 6, 8 or 10 digits — easting first, then northing.</div></label>
          <label class="fld"><span>Corner latitude and longitude</span><input id="mLL" value="${esc(latlonText)}" placeholder="2°15'00&quot;S 30°00'00&quot;E"><div class="help" id="mLLread">Degrees-minutes-seconds or decimals both work.</div></label>
          <label class="fld"><span>Datum (printed in the map margin)</span><select id="mDatum">
            <option value="WGS84" ${m.datum !== 'ARC1960' ? 'selected' : ''}>WGS 84 — newer maps, same as GPS</option>
            <option value="ARC1960" ${m.datum === 'ARC1960' ? 'selected' : ''}>Arc 1960 — older East-African maps</option>
            <option value="ARC1950" ${m.datum === 'ARC1950' ? 'selected' : ''}>Arc 1950 — older southern-African maps</option></select></label>
          <div id="mCheck"></div>
          <div class="fld"><span>How to calculate</span><div class="seg" id="mMode">
            <button type="button" data-v="utm" class="${m.mode !== 'origin' ? 'on' : ''}">Exact standard grid</button>
            <button type="button" data-v="origin" class="${m.mode === 'origin' ? 'on' : ''}">From my corner</button></div>
            <div class="help">The exact grid ignores small mistakes in reading the corner. "From my corner" trusts your numbers — use it for maps with a local grid.</div></div>
          <label class="fld"><span>UTM zone (only for UTM maps)</span><input id="mZone" type="number" min="1" max="60" value="${m.zone || ''}" placeholder="auto"></label>
        </div>

        <details class="adv"><summary>Advanced</summary><div style="margin-top:6px">
          <label class="fld"><span>Grid-magnetic angle (°)</span><input id="mGma" type="number" step="0.1" value="${m.gma || 0}"><div class="help">From the map margin. East +, west −. Used for magnetic bearings.</div></label>
        </div></details>
      </div>
      <div class="sheet-actions">${isNew ? '' : '<button class="btn ghost danger" id="mDel">Delete</button><span class="grow" style="flex:1"></span>'}
        <button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="mSave">${isNew ? 'Add map' : 'Save map'}</button></div>`, box => {
      let mode = m.mode === 'origin' ? 'origin' : 'utm', userPickedMode = !isNew && m.mode !== 'known';
      $$('#mKind button', box).forEach(b => b.onclick = () => {
        kind = b.dataset.v; $$('#mKind button', box).forEach(x => x.classList.toggle('on', x === b));
        $('#kRw', box).hidden = kind !== 'rw'; $('#kUtm', box).hidden = kind !== 'utm'; $('#kOther', box).hidden = kind !== 'other';
        kind === 'rw' ? showRw() : kind === 'utm' ? showUtm() : check();
      });
      // ---- Rwanda national grid ----
      function showRw() {
        if (!$('#mGrat', box)) return;
        if (!ref) { $('#mGrat', box).innerHTML = ''; return; }
        const c = Geo.calibrate({ grid: 'TMRW', mode: 'known', originLat: ref.lat, originLon: ref.lon });
        $('#mGrat', box).innerHTML = graticuleHTML(c, ref.lat, ref.lon);
      }
      $('#mDist', box).onchange = () => { const d = RW_DISTRICTS.find(x => x[0] === $('#mDist', box).value); ref = d ? { lat: d[1], lon: d[2], district: d[0] } : null; $('#mHereTxt', box).textContent = ''; showRw(); };
      $('#mRefLL', box).addEventListener('input', debounce(() => { try { const p = Geo.parseLatLon($('#mRefLL', box).value, -2); ref = { lat: p.lat, lon: p.lon, district: '' }; $('#mDist', box).value = ''; showRw(); } catch (e) {} }, 300));
      $('#mHere', box).onclick = () => gps(pos => {
        const d = nearestDistrict(pos.lat, pos.lon); ref = { lat: pos.lat, lon: pos.lon, district: d[0] };
        $('#mDist', box).value = d[0]; $('#mHereTxt', box).textContent = `GPS fix — ${d[0]} district`; showRw();
      });
      showRw();
      // ---- UTM grid, located by town / lat-lon / GPS ----
      const utmProfile = () => uref ? { grid: 'UTM', mode: 'known', datum: $('#uDatum', box).value, zone: Number($('#uZone', box).value) || Geo.zoneFor(uref.lon), originLat: uref.lat, originLon: uref.lon } : null;
      function showUtm() {
        if (!$('#uGrat', box)) return;
        const pr = utmProfile(); if (!pr) { $('#uGrat', box).innerHTML = ''; return; }
        $('#uZone', box).placeholder = 'auto (' + Geo.zoneFor(uref.lon) + ')';
        const c = Geo.calibrate(pr);
        $('#uGrat', box).innerHTML = `<p class="small muted">Using <b>UTM zone ${c.zone}${c.south ? 'S' : 'N'}</b>. If the margin shows another zone, type it above.</p>` + graticuleHTML(c, uref.lat, uref.lon);
      }
      $('#uPlace', box).onchange = () => { const d = PLACES.find(x => x[0] === $('#uPlace', box).value); if (d) { uref = { lat: d[1], lon: d[2], place: d[0] }; $('#uLL', box).value = ''; } showUtm(); };
      $('#uLL', box).addEventListener('input', debounce(() => { try { const p = Geo.parseLatLon($('#uLL', box).value); uref = { lat: p.lat, lon: p.lon, place: '' }; $('#uPlace', box).value = ''; showUtm(); } catch (e) {} }, 300));
      $('#uHere', box).onclick = () => gps(pos => { uref = { lat: pos.lat, lon: pos.lon, place: '' }; $('#uPlace', box).value = ''; $('#uLL', box).value = `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`; $('#uHereTxt', box).textContent = 'GPS fix'; showUtm(); });
      ['#uDatum', '#uZone'].forEach(sel => $(sel, box).addEventListener('change', showUtm));
      showUtm();
      // ---- other grid (typed corner) ----
      $$('#mMode button', box).forEach(b => b.onclick = () => { mode = b.dataset.v; userPickedMode = true; $$('#mMode button', box).forEach(x => x.classList.toggle('on', x === b)); check(); });
      const read = () => {
        const grid = $('#mGrid', box).value, ll = $('#mLL', box).value;
        let g = null, p = null, err = '';
        try { if (grid.trim()) g = Geo.parseGridRef(grid); } catch (e) { err = e.message; }
        try { if (ll.trim()) p = Geo.parseLatLon(ll, -1); } catch (e) { err = err || e.message; }
        return { grid, g, p, err };
      };
      function check() {
        if (!$('#mGrid', box)) return null;
        const { grid, g, p, err } = read();
        $('#mLLread', box).textContent = p ? `Read as ${Geo.toDMS(p.lat, true)}  ${Geo.toDMS(p.lon, false)}${p.assumedSouth ? ' (assumed south)' : ''}` : 'Degrees-minutes-seconds or decimals both work.';
        const out = $('#mCheck', box);
        if (err) { out.innerHTML = `<p class="err">${esc(err)}</p>`; return null; }
        if (!g || !p) { out.innerHTML = ''; return null; }
        const det = Geo.detectGrid(grid, p.lat, p.lon, $('#mDatum', box).value);
        const best = det[0];
        if (!userPickedMode) { mode = best.misfit < 1000 ? 'utm' : 'origin'; $$('#mMode button', box).forEach(x => x.classList.toggle('on', x.dataset.v === mode)); }
        if (best.zone) $('#mZone', box).placeholder = 'auto (' + best.zone + ')';
        out.innerHTML = best.misfit < 1000
          ? `<div class="callout good"><b>Grid found: ${esc(best.label)}.</b> Your corner fits it within ${Math.round(best.misfit)} m — normal when a corner is read to 100 m. ${mode === 'utm' ? 'The exact grid will be used, accurate to under 1 m anywhere on the sheet.' : 'You chose to calculate from your corner.'}</div>`
          : `<div class="callout warn"><b>Check your numbers.</b> This corner doesn't fit a standard grid (closest: ${esc(best.label)}, ${(best.misfit / 1000).toFixed(1)} km off). If your map has its own local grid that's fine — positions will be calculated from your corner.</div>`;
        return { g, p, best };
      }
      ['#mGrid', '#mLL'].forEach(sel => $(sel, box).addEventListener('input', debounce(check, 250)));
      $('#mDatum', box).onchange = check;
      if (kind === 'other') check();

      $('#mSave', box).onclick = async () => {
        const name = $('#mName', box).value.trim();
        if (!name) return toast('Give the map a name', true);
        const gma = Number($('#mGma', box).value) || 0;
        let data;
        if (kind === 'rw') {
          if (!ref) return toast('Choose the district (or use your GPS)', true);
          data = { grid: 'TMRW', mode: 'known', datum: 'WGS84', zone: null, originGrid: '', originLat: ref.lat, originLon: ref.lon, district: ref.district || '' };
        } else if (kind === 'utm') {
          const pr = utmProfile(); if (!pr) return toast('Choose a nearby town, type a lat/lon, or use your GPS', true);
          data = { ...pr, originGrid: '', district: uref.place ? uref.place.replace(/^.*— /, '') : '' };
        } else {
          const r = check();
          if (!r) return toast('Enter the corner grid and latitude/longitude', true);
          const useStd = r.best.misfit < 1000 || mode === 'origin';
          const gridType = useStd ? r.best.grid : 'UTM';
          data = { grid: gridType, mode, datum: gridType === 'TMRW' ? 'WGS84' : $('#mDatum', box).value, zone: gridType === 'UTM' ? (Number($('#mZone', box).value) || r.best.zone || Geo.zoneFor(r.p.lon)) : null,
            originGrid: $('#mGrid', box).value.replace(/\s+/g, ''), originLat: r.p.lat, originLon: r.p.lon, district: '' };
        }
        const saved = await Store.save('maps', { ...m, name, gma, ...data });
        closeSheet(); setMap(saved.id); toast(isNew ? 'Map added' : 'Map saved'); render();
        if (isNew) go('convert');
      };
      const del = $('#mDel', box);
      if (del) del.onclick = () => confirmSheet('Delete map?', `This deletes "${m.name}", its ${points(m.id).length} points and its exercises.`, 'Delete map', async () => {
        for (const p of points(m.id)) await Store.remove('points', p.id);
        for (const x of Store.list('exercises').filter(x => x.mapId === m.id)) await Store.remove('exercises', x.id);
        await Store.remove('maps', m.id);
        if (S.mapId === m.id) setMap(maps()[0]?.id || null);
        toast('Map deleted'); render();
      });
    });
  }

  /* ================================================================
     CONVERT
     ================================================================ */
  function renderConvert() {
    const el = $('[data-view="convert"]'); const m = activeMap();
    if (!m) { el.innerHTML = `<div class="view-head"><div><h2>Convert</h2></div></div>` + needMap('Converting'); return; }
    S.dir = S.dir || lsGet(prefKey('dir'), 'g2l');
    const hist = lsGet(prefKey('hist'), []).filter(h => h.mapId === m.id).slice(0, 8);
    const dif = m.datum !== 'WGS84';
    const last = S.lastConv && S.lastConv.dir === S.dir ? S.lastConv : null;
    const [latV, lonV] = last && S.dir === 'l2g' ? (last.input.split('|').concat(['']).slice(0, 2)) : ['', ''];
    el.innerHTML = `<div class="view-head"><div><h2>Convert</h2><p>On map <b>${esc(m.name)}</b>. Choose which way to convert.</p></div></div>
      <div class="seg dir" id="convDir" role="tablist">
        <button type="button" data-v="g2l" class="${S.dir === 'g2l' ? 'on' : ''}">Grid → Geo</button>
        <button type="button" data-v="l2g" class="${S.dir === 'l2g' ? 'on' : ''}">Geo → Grid</button>
      </div>
      <form id="convForm" class="stack" autocomplete="off" style="margin-top:14px">
        ${S.dir === 'g2l' ? `
        <label class="fld big"><span>Grid reference</span><input id="gIn" inputmode="numeric" placeholder="214 534" value="${esc(last ? last.input : '')}">
          <div class="help">4, 6, 8 or 10 digits — easting first, then northing.</div></label>` : `
        <div class="grid2">
          <label class="fld"><span>Latitude</span><input id="latIn" placeholder="2°19'04&quot; S" value="${esc(latV)}"></label>
          <label class="fld"><span>Longitude</span><input id="lonIn" placeholder="30°10'42&quot; E" value="${esc(lonV)}"></label>
        </div>
        <div class="help tiny">Degrees-minutes-seconds (2 19 04 S) or decimals (-2.3178). You can also tap the map.</div>
        ${dif ? `<div class="fld"><span>These lat/lon come from</span><div class="seg" id="convSrc"><button type="button" data-v="map" class="${S.convSrc === 'map' ? 'on' : ''}">The map (${m.datum === 'ARC1950' ? 'Arc 1950' : 'Arc 1960'})</button><button type="button" data-v="wgs" class="${S.convSrc === 'wgs' ? 'on' : ''}">A GPS (WGS 84)</button></div></div>` : ''}`}
        <div class="row"><button class="btn primary grow">${S.dir === 'g2l' ? 'Convert to lat/lon' : 'Convert to grid'}</button>${S.dir === 'l2g' ? `<button type="button" class="btn" id="gpsBtn">${icon('gps')} My position</button>` : ''}</div>
      </form>
      <div id="convOut"></div>
      ${hist.length ? `<div class="section"><h3>Recent</h3><div class="list">${hist.map(h => `<div class="li tap" data-in="${esc(h.input)}" data-dir="${h.dir || 'g2l'}"><div class="main"><b>${esc(h.dir === 'l2g' ? h.input.replace('|', '  ') : 'GR ' + h.input)}</b><span class="tiny">${esc(h.out)}</span></div></div>`).join('')}</div></div>` : ''}`;
    const readIn = () => S.dir === 'g2l' ? $('#gIn', el).value : `${$('#latIn', el).value}|${$('#lonIn', el).value}`;
    $$('#convDir button', el).forEach(b => b.onclick = () => { S.dir = b.dataset.v; lsSet(prefKey('dir'), S.dir); renderConvert(); });
    $('#convForm', el).onsubmit = e => { e.preventDefault(); runConvert(readIn(), true); };
    $$('#convSrc button', el).forEach(b => b.onclick = () => { S.convSrc = b.dataset.v; $$('#convSrc button', el).forEach(x => x.classList.toggle('on', x === b)); runConvert(readIn()); });
    const gb = $('#gpsBtn', el); if (gb) gb.onclick = () => gps(pos => { S.convSrc = 'wgs'; $('#latIn', el).value = pos.lat.toFixed(7); $('#lonIn', el).value = pos.lon.toFixed(7); runConvert(readIn(), true, { src: 'WGS84', acc: pos.acc }); });
    $$('[data-in]', el).forEach(r => r.onclick = () => { S.dir = r.dataset.dir; S.lastConv = { dir: S.dir, input: r.dataset.in }; renderConvert(); runConvert(r.dataset.in, false); });
    $$('#gIn, #latIn, #lonIn', el).forEach(i => i.addEventListener('input', debounce(() => { const v = readIn(); if (v.replace('|', '').trim()) runConvert(v, false, { quiet: true }); }, 450)));
    S.pick = 'convert';
    if (last) runConvert(last.input, false, { quiet: true });
  }

  function runConvert(text, remember, opt = {}) {
    const m = activeMap(), c = cal(m), out = $('#convOut');
    if (!m || !out) return;
    let r;
    try {
      let parsed;
      if (S.dir === 'l2g') {
        const [la, lo] = String(text).split('|');
        if (!String(la || '').trim() || !String(lo || '').trim()) throw new Error('Type both the latitude and the longitude.');
        if (/^\s*\d{4,10}\s*$/.test(String(la).replace(/\s/g, '')) && !/[.°'"NSEWnsew-]/.test(la)) throw new Error('That looks like a grid reference. Switch to Grid → Geo.');
        parsed = { kind: 'geo', ...Geo.parseLatLon(`${la}, ${lo}`, m.originLat) };
      } else {
        const t = String(text).trim();
        if (/[.°'"NSEWnsew]/.test(t)) throw new Error('This box takes a grid reference (digits only). To convert a lat/lon, switch to Geo → Grid.');
        parsed = Geo.parseAny(t, m.originLat);
      }
      if (parsed.kind === 'grid') {
        const g = Geo.gridToGeo(parsed.grid, m, c);
        const gg = Geo.geoToGrid(g.lat, g.lon, m, m.datum, c);
        r = { kind: 'grid', dir: 'g2l', input: String(text).trim(), grid: g.grid, lat: g.lat, lon: g.lon, wgsLat: g.wgsLat, wgsLon: g.wgsLon, E: g.E, N: g.N, prec: g.precision, digits: g.digits, gg };
      } else {
        const src = opt.src || (m.datum !== 'WGS84' && S.convSrc === 'wgs' ? 'WGS84' : m.datum);
        const gg = Geo.geoToGrid(parsed.lat, parsed.lon, m, src, c);
        r = { kind: 'geo', dir: 'l2g', input: String(text).trim(), grid: gg.grid6, lat: gg.lat, lon: gg.lon, wgsLat: gg.wgsLat, wgsLon: gg.wgsLon, E: gg.E, N: gg.N, gg, assumedSouth: parsed.assumedSouth, acc: opt.acc, src };
      }
    } catch (e) { if (!opt.quiet) out.innerHTML = `<p class="err" style="margin-top:12px">${esc(e.message)}</p>`; return; }
    S.lastConv = r;
    const far = r.gg.offSheetKm > 60;
    const datumName = m.datum === 'ARC1960' ? 'Arc 1960' : m.datum === 'ARC1950' ? 'Arc 1950' : 'WGS 84';
    const precTxt = r.kind === 'grid' ? (r.digits === 4 ? 'centre of the 1 km square' : `to the nearest ${r.prec} m`) : (r.acc ? `GPS accuracy ±${Math.round(r.acc)} m` : 'exact');
    const row = (k, v, c2 = v) => `<dt>${k}</dt><dd>${esc(v).replace('  ', '<br>')}</dd><button class="copy" data-copy="${esc(c2)}" aria-label="Copy ${k}">${icon('copy')}</button>`;
    const dms = `${Geo.toDMS(r.lat, true)}  ${Geo.toDMS(r.lon, false)}`;
    out.innerHTML = `<div class="result">
      ${r.kind === 'grid'
        ? `<div class="small muted">GR ${esc(r.grid)} →</div><div class="llbig"><span>${esc(Geo.toDMS(r.lat, true, 1))}</span><span>${esc(Geo.toDMS(r.lon, false, 1))}</span></div>`
        : grHTML(r.gg.grid6, 'xl')}
      <div class="small muted">${r.kind === 'grid' ? 'Latitude / longitude' : '6-figure grid reference'} · ${precTxt}</div>
      ${r.assumedSouth ? '<div class="callout" style="margin-top:8px">No N/S given — read as <b>south</b>, like the map.</div>' : ''}
      ${far ? `<div class="callout warn" style="margin-top:8px">This is ${Math.round(r.gg.offSheetKm)} km from the map corner — probably not on this sheet. Check the input or the map you are using.</div>` : ''}
      <dl class="kv">
        ${r.kind === 'geo' ? row('8-figure', r.gg.grid8) + row('10-figure', r.gg.grid10) + row('Square', r.gg.grid4) : ''}
        ${row('Lat / Lon', dms)}
        ${row('Decimal', `${Geo.fmtDD(r.lat)}, ${Geo.fmtDD(r.lon)}`)}
        ${row('Deg-min', `${Geo.toDDM(r.lat, true)}  ${Geo.toDDM(r.lon, false)}`)}
        ${m.datum !== 'WGS84' ? row('GPS (WGS 84)', `${Geo.fmtDD(r.wgsLat)}, ${Geo.fmtDD(r.wgsLon)}`) : ''}
        ${row('Full grid', `${c.label} ${Math.round(r.E)} E ${Math.round(r.N)} N`)}
      </dl>
      <p class="tiny" style="margin-top:6px">Lat/lon on ${datumName}, the map's datum${m.datum !== 'WGS84' ? '. Use the GPS line for phones and Google Maps' : ''}.</p>
      <div class="row" style="margin-top:10px">
        <button class="btn sm" id="cShow">${icon('globe')} Show on map</button>
        <button class="btn sm" id="cSave">${icon('pin')} Save as point</button>
        <a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${r.wgsLat.toFixed(6)},${r.wgsLon.toFixed(6)}">Google Maps</a>
      </div></div>`;
    $('#cShow').onclick = () => { MapUI.flag(r); if (innerWidth <= 860) go('map'); };
    $('#cSave').onclick = () => pointEditor(null, { lat: r.lat, lon: r.lon });
    MapUI.flag(r, true);
    if (remember) {
      const hist = lsGet(prefKey('hist'), []).filter(h => !(h.input === r.input && h.mapId === m.id));
      hist.unshift({ mapId: m.id, dir: r.dir, input: r.input, out: r.kind === 'grid' ? dms : 'GR ' + r.gg.grid6 });
      lsSet(prefKey('hist'), hist.slice(0, 30));
    }
  }

  function gps(cb) {
    if (!navigator.geolocation) return toast('This device has no GPS access', true);
    toast('Getting your position…');
    navigator.geolocation.getCurrentPosition(
      p => cb({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      e => toast(e.code === 1 ? 'Location permission was refused. Allow it in the browser settings.' : 'Could not get a GPS fix. Try outside, away from buildings.', true),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  /* ================================================================
     POINTS
     ================================================================ */
  function renderPoints() {
    const el = $('[data-view="points"]'); const m = activeMap();
    if (!m) { el.innerHTML = `<div class="view-head"><div><h2>Points</h2></div></div>` + needMap('Saving points'); return; }
    const list = points();
    const ref = refPoint();
    const sortNo = lsGet(prefKey('psort'), 'dist') === 'no';
    const rows = ref ? (sortNo ? list.filter(p => p.id !== ref.id).map(p => ({ p, L: leg(ref, p) })) : byDistance(ref, list)) : [];
    const row = (p, L, isRef) => `
        <div class="li ${isRef ? 'ref' : ''}">
          <span class="no ${isRef ? 'index' : ''}">${isRef ? 'IX' : p.no}</span>
          <div class="main"><b>${esc(p.name)}</b>${grHTML(gridOf(p), 'sm')} <span class="tiny">${esc(Geo.toDMS(p.lat, true, 1))} ${esc(Geo.toDMS(p.lon, false, 1))}</span></div>
          ${isRef ? `<div class="dist ref-tag">Start</div>` : `<div class="dist"><b>${km(L.ground)}</b><span>${String(L.mils).padStart(4, '0')} mils</span></div>`}
          <div class="acts"><button class="icon-btn sm" data-show="${p.id}" aria-label="Show on map">${icon('globe')}</button><button class="icon-btn sm" data-ed="${p.id}" aria-label="Edit">${icon('edit')}</button><button class="icon-btn sm danger" data-delp="${p.id}" aria-label="Delete">${icon('trash')}</button></div>
        </div>`;
    const far = rows.length ? rows.reduce((a, b) => (b.L.ground > a.L.ground ? b : a)) : null;
    const near = rows.length ? rows.reduce((a, b) => (b.L.ground < a.L.ground ? b : a)) : null;
    el.innerHTML = `<div class="view-head"><div><h2>Points</h2><p>Your start point (Index) and the checkpoints. Enter each by grid or by lat/lon.</p></div>
      <button class="btn primary" id="addPt">Add point</button></div>
      ${list.length ? `
        <div class="ref-bar">
          <label class="fld"><span>Index (distances from)</span><select id="refSel">${list.map(p => `<option value="${p.id}" ${p.id === ref.id ? 'selected' : ''}>${p.no} · ${esc(p.name)}</option>`).join('')}</select></label>
          <div class="seg" role="group" aria-label="Order"><button data-ps="dist" class="${sortNo ? '' : 'on'}">Nearest first</button><button data-ps="no" class="${sortNo ? 'on' : ''}">By number</button></div>
        </div>
        ${near ? `<div class="stat-strip"><div><span>Points</span><b>${rows.length}</b></div><div><span>Nearest</span><b>CP ${near.p.no} · ${km(near.L.ground)}</b></div><div><span>Farthest</span><b>CP ${far.p.no} · ${km(far.L.ground)}</b></div></div>` : ''}
        <div class="list">${row(ref, null, true)}${rows.map(r => row(r.p, r.L, false)).join('')}</div>
        <p class="tiny" style="margin-top:8px">Distance and grid bearing (mils) are measured on the ground from the Index. The map shows a line from the Index to every point. Numbers are the checkpoint numbers used on routes and papers.</p>`
      : `<div class="empty"><p><b>No points yet.</b></p><p class="small">Add the Index (start point) first, then every place you may use as a checkpoint.</p></div>`}`;
    $('#addPt', el).onclick = () => pointEditor();
    const rs = $('#refSel', el); if (rs) rs.onchange = () => { setRefPoint(rs.value); renderPoints(); MapUI.redraw(); };
    $$('[data-ps]', el).forEach(b => b.onclick = () => { lsSet(prefKey('psort'), b.dataset.ps); renderPoints(); });
    $$('[data-ed]', el).forEach(b => b.onclick = () => pointEditor(ptById(b.dataset.ed)));
    $$('[data-delp]', el).forEach(b => b.onclick = () => deletePoint(ptById(b.dataset.delp)));
    $$('[data-show]', el).forEach(b => b.onclick = () => { MapUI.focus(ptById(b.dataset.show)); if (innerWidth <= 860) go('map'); });
    S.pick = 'point';
  }

  function pointEditor(p, preset) {
    const m = activeMap(); const isNew = !p;
    const nextNo = Math.max(0, ...points().map(x => x.no)) + 1;
    const posText = p ? gridOf(p, 6) : preset ? Geo.geoToGrid(preset.lat, preset.lon, m, m.datum, cal(m)).grid8 : '';
    openSheet(`<div class="sheet-head"><h3>${isNew ? 'Add point' : 'Edit point ' + p.no}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="stack">
        <div class="grid2" style="grid-template-columns:90px 1fr"><label class="fld"><span>Number</span><input id="pNo" type="number" min="1" value="${p ? p.no : nextNo}"></label>
        <label class="fld"><span>Name</span><input id="pName" value="${esc(p?.name || '')}" placeholder="e.g. Riziyeri bridge"></label></div>
        <label class="fld big"><span>Position — grid or lat/lon</span><input id="pPos" value="${esc(posText)}" placeholder="214 534"><div class="help" id="pRead">Example: 214534, or 2°19'04"S 30°10'42"E</div></label>
        <div class="row"><button class="btn sm" type="button" id="pGps">${icon('gps')} I'm standing here</button></div>
      </div>
      <div class="sheet-actions">${isNew ? '' : '<button class="btn ghost danger" id="pDel">Delete</button><span style="flex:1"></span>'}
        <button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="pSave">${isNew ? 'Add point' : 'Save point'}</button></div>`, box => {
      let gpsPos = null;
      const parse = () => {
        const v = $('#pPos', box).value;
        if (gpsPos && v === gpsPos.text) return { lat: gpsPos.lat, lon: gpsPos.lon, grid: gpsPos.grid };
        const a = Geo.parseAny(v, m.originLat);
        if (a.kind === 'grid') { const g = Geo.gridToGeo(a.grid, m, cal(m)); return { lat: g.lat, lon: g.lon, grid: g.grid }; }
        const g = Geo.geoToGrid(a.lat, a.lon, m, m.datum, cal(m)); return { lat: g.lat, lon: g.lon, grid: g.grid6 };
      };
      const show = () => { if (!$('#pRead', box)) return; try { const r = parse(); $('#pRead', box).textContent = `GR ${r.grid} · ${Geo.toDMS(r.lat, true, 1)} ${Geo.toDMS(r.lon, false, 1)}`; $('#pRead', box).classList.remove('err'); } catch (e) { $('#pRead', box).textContent = e.message; $('#pRead', box).classList.add('err'); } };
      $('#pPos', box).addEventListener('input', debounce(show, 250)); if (posText) show();
      $('#pGps', box).onclick = () => gps(pos => {
        const g = Geo.geoToGrid(pos.lat, pos.lon, m, 'WGS84', cal(m));
        gpsPos = { lat: g.lat, lon: g.lon, grid: g.grid6, text: g.grid8 };
        $('#pPos', box).value = g.grid8; $('#pRead', box).textContent = `GPS fix ±${Math.round(pos.acc)} m → GR ${g.grid6}`;
      });
      $('#pSave', box).onclick = async () => {
        const name = $('#pName', box).value.trim(); const no = Number($('#pNo', box).value);
        if (!name) return toast('Give the point a name', true);
        if (!no || no < 1) return toast('Number must be 1 or more', true);
        if (points().some(x => x.no === no && x.id !== p?.id)) return toast(`Number ${no} is already used`, true);
        let r; try { r = parse(); } catch (e) { return toast(e.message, true); }
        await Store.save('points', { ...(p || {}), mapId: m.id, no, name, lat: r.lat, lon: r.lon, grid: r.grid });
        closeSheet(); toast(isNew ? 'Point added' : 'Point saved'); render(); MapUI.redraw(isNew);
      };
      const del = $('#pDel', box);
      if (del) del.onclick = () => deletePoint(p);
    });
  }

  function deletePoint(p) {
    const used = Store.list('exercises').filter(x => x.indexId === p.id || (x.routes || []).some(r => r.stops.includes(p.id)));
    confirmSheet('Delete point?', used.length ? `"${p.name}" is used by ${used.length} exercise(s). Their routes will be cleared so you can make new ones.` : `Delete "${p.name}"?`, 'Delete point', async () => {
      for (const x of Store.list('exercises')) {
        const inRoutes = (x.routes || []).some(r => r.stops.includes(p.id));
        if (x.poolIds?.includes(p.id) || x.indexId === p.id || inRoutes)
          await Store.save('exercises', { ...x, poolIds: (x.poolIds || []).filter(i => i !== p.id), indexId: x.indexId === p.id ? null : x.indexId, ...(inRoutes || x.indexId === p.id ? { routes: [], progress: {} } : {}) });
      }
      await Store.remove('points', p.id); closeSheet(); toast('Point deleted'); render(); MapUI.redraw();
    });
  }

  /* ================================================================
     EXERCISE
     ================================================================ */
  const DEF = {
    title: 'Ex day navigation one', coy: '', date: '', security: 'EX-SECRET', annex: 'Annex B to\nSerial 1',
    count: 10, perRoute: 6, targetKm: 30, tolKm: 1,
    startMsg: 'Good luck, Syndicate {syn}! Stay together and trust your map and compass.',
    slipMsg: 'Well done, Syndicate {syn}! You have reached checkpoint {cp}. Keep up the good work.',
    endMsg: 'Excellent work, Syndicate {syn}! Mission accomplished.'
  };
  const exercises = () => Store.list('exercises').filter(x => x.mapId === S.mapId).sort((a, b) => a.createdAt - b.createdAt);
  const currentEx = () => { const x = Store.get('exercises', S.exId); return x && x.mapId === S.mapId ? x : null; };
  // The point distances are measured from: the one chosen on Points, else the exercise's Index, else the first point.
  function refPoint() {
    const pts = points(); if (!pts.length) return null;
    const ex = currentEx(); const saved = lsGet(prefKey('from:' + S.mapId), null);
    return pts.find(p => p.id === saved) || (ex && pts.find(p => p.id === ex.indexId)) || pts[0];
  }
  function setRefPoint(id) { lsSet(prefKey('from:' + S.mapId), id); }
  // Other points ordered nearest first from `from`, each with its distance and bearing.
  function byDistance(from, list) {
    return list.filter(p => p.id !== from.id).map(p => ({ p, L: leg(from, p) })).sort((a, b) => a.L.ground - b.L.ground || a.p.no - b.p.no);
  }
  const km = m => (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
  const saveEx = debounce(x => Store.save('exercises', x), 400);

  function routeInfo(ex, r) {
    const idx = ptById(ex.indexId); const seq = [idx, ...r.stops.map(ptById), idx];
    if (seq.some(x => !x)) return { legs: [], length: 0, cum: [], broken: true };
    const legs = []; let t = 0; const cum = [];
    for (let i = 1; i < seq.length; i++) { const L = leg(seq[i - 1], seq[i]); legs.push(L); t += L.ground; cum.push(t); }
    return { legs, length: t, cum };
  }
  function distMatrix(ids) {
    const pts = ids.map(ptById);
    return pts.map(a => pts.map(b => a === b ? 0 : leg(a, b).ground));
  }

  /* Route map drawn on the map's own grid (works offline, no background tiles).
     pts: [index, ...pool]; routes: [{synd, stops:[ids]}]; sel: syndicate number or null. */
  function routeSVG(ex, pts, routes, sel, o = {}) {
    const W = o.width || 1000, pad = 46;
    const P = pts.map(p => ({ p, g: geoOf(p) }));
    if (!P.length) return '';
    let minE = Math.min(...P.map(x => x.g.E)), maxE = Math.max(...P.map(x => x.g.E));
    let minN = Math.min(...P.map(x => x.g.N)), maxN = Math.max(...P.map(x => x.g.N));
    const span = Math.max(maxE - minE, maxN - minN, 2000);
    const cxE = (minE + maxE) / 2, cxN = (minN + maxN) / 2;
    const spanE = Math.max(maxE - minE, span * 0.6) + 1200, spanN = Math.max(maxN - minN, span * 0.6) + 1200;
    minE = cxE - spanE / 2; maxE = cxE + spanE / 2; minN = cxN - spanN / 2; maxN = cxN + spanN / 2;
    const sc = (W - pad * 2) / spanE, H = Math.round(spanN * sc + pad * 2);
    const X = E => pad + (E - minE) * sc, Y = N => pad + (maxN - N) * sc;
    const step = spanE > 30000 ? 5000 : spanE > 15000 ? 2000 : 1000;
    const fs = o.font || 15;
    let g = '';
    // grid lines with the map's 2-digit km numbers (local grid squares)
    const c = cal(), bE = c.baseE, bN = c.baseN;
    const km = (v, b) => String(Math.round((((v - b) % 100000) + 100000) % 100000 / 1000)).padStart(2, '0');
    for (let E = Math.ceil(minE / step) * step; E <= maxE; E += step) g += `<line x1="${X(E)}" y1="${pad}" x2="${X(E)}" y2="${H - pad}" class="gl"/><text x="${X(E)}" y="${pad - 8}" class="gt" text-anchor="middle">${km(E, bE)}</text><text x="${X(E)}" y="${H - pad + fs + 4}" class="gt" text-anchor="middle">${km(E, bE)}</text>`;
    for (let N = Math.ceil(minN / step) * step; N <= maxN; N += step) g += `<line x1="${pad}" y1="${Y(N)}" x2="${W - pad}" y2="${Y(N)}" class="gl"/><text x="${pad - 8}" y="${Y(N) + 5}" class="gt" text-anchor="end">${km(N, bN)}</text><text x="${W - pad + 8}" y="${Y(N) + 5}" class="gt">${km(N, bN)}</text>`;
    const at = id => P.find(x => x.p.id === id);
    const idx = P[0];
    let lines = '', top = '';
    const R = o.big ? 22 : 15;
    routes.forEach((r, ri) => {
      if (o.only && sel && r.synd !== sel) return;
      const seq = [idx, ...r.stops.map(at), idx].filter(Boolean);
      const isSel = sel === r.synd, dim = sel && !isSel;
      // small sideways offset per syndicate so shared legs stay visible as parallel lines
      const off = sel ? 0 : ((ri % 7) - 3) * 1.6;
      const pts2 = seq.map((q, i) => {
        const a = seq[Math.max(0, i - 1)], b = seq[Math.min(seq.length - 1, i + 1)];
        const dx = X(b.g.E) - X(a.g.E), dy = Y(b.g.N) - Y(a.g.N), L = Math.hypot(dx, dy) || 1;
        return [X(q.g.E) - dy / L * off, Y(q.g.N) + dx / L * off];
      });
      const d = pts2.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
      const el = `<path d="${d}" data-syn="${r.synd}" class="rt" stroke="${colorOf(r.synd)}" stroke-width="${isSel ? 5 : 2.2}" opacity="${dim ? 0.12 : isSel ? 1 : 0.75}"/>`;
      if (isSel) {
        top += el;
        for (let i = 1; i < seq.length; i++) { // arrow + leg distance at the middle of each leg
          const A = seq[i - 1], B = seq[i];
          const x1 = X(A.g.E), y1 = Y(A.g.N), x2 = X(B.g.E), y2 = Y(B.g.N);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
          const L = leg(A.p, B.p);
          top += `<g transform="translate(${mx} ${my}) rotate(${ang})"><path d="M-9 -8 L9 0 L-9 8 z" fill="${colorOf(r.synd)}"/></g>
            <text x="${mx}" y="${my - 12}" class="lk" text-anchor="middle">${i}: ${(L.ground / 1000).toFixed(1)} km</text>`;
        }
      } else lines += el;
    });
    let marks = '';
    // With one syndicate selected, its checkpoints are numbered in the order it visits them (CP1, CP2 …),
    // like the leader summary; points it does not visit become small dots.
    const selStops = sel ? (routes.find(r => r.synd === sel)?.stops || []) : null;
    P.forEach((x, i) => {
      const seqNo = selStops ? selStops.indexOf(x.p.id) + 1 : 0;
      const used = !sel || i === 0 || seqNo > 0;
      const xx = X(x.g.E), yy = Y(x.g.N);
      if (i === 0) marks += `<rect x="${xx - R}" y="${yy - R}" width="${2 * R}" height="${2 * R}" rx="5" class="ixm"/><text x="${xx}" y="${yy + R * 0.36}" class="pn" text-anchor="middle">IX</text>`;
      else if (!used) marks += `<circle cx="${xx}" cy="${yy}" r="${R * 0.35}" class="cpm" opacity="0.35"/>`;
      else marks += `<circle cx="${xx}" cy="${yy}" r="${R}" class="cpm" ${sel ? `style="fill:${colorOf(sel)}"` : ''}/><text x="${xx}" y="${yy + R * 0.36}" class="pn" text-anchor="middle">${sel ? seqNo : x.p.no}</text>`;
      if (o.names && used) marks += `<text x="${xx + R + 4}" y="${yy - R * 0.6}" class="nm">${sel && i ? 'CP' + seqNo + ' · ' : ''}${esc(x.p.name)}</text>`;
    });
     return `<svg viewBox="0 0 ${W} ${H}" class="rmap ${o.big ? 'big' : ''}" role="img" aria-label="Route map" style="--fs:${fs}px">${g}${lines}${top}${marks}</svg>`;
  }

  function distTableHTML(pts) {
    const D = distMatrix(pts.map(p => p.id));
    const lab = (p, i) => i === 0 ? 'IX' : p.no;
    return `<div class="dtab-wrap"><table class="dtab"><thead><tr><th>km</th>${pts.map((p, i) => `<th title="${esc(p.name)}">${lab(p, i)}</th>`).join('')}</tr></thead><tbody>
      ${pts.map((p, i) => `<tr><th title="${esc(p.name)}">${lab(p, i)}</th>${pts.map((q, j) => `<td class="${i === j ? 'z' : ''}">${i === j ? '' : (D[i][j] / 1000).toFixed(1)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }

  function renderExercise() {
    const el = $('[data-view="exercise"]'); const m = activeMap();
    if (!m) { el.innerHTML = `<div class="view-head"><div><h2>Exercise</h2></div></div>` + needMap('Planning'); return; }
    const pts = points();
    const xs = exercises();
    let ex = S.exOpen ? currentEx() : null;
    if (!ex) { S.exOpen = false; renderExHistory(el, xs, pts); return; }
    if (ex.kind === 'op') return renderOperation(el, ex, pts);
    const idx = ptById(ex.indexId);
    const pool = (ex.poolIds || []).filter(id => ptById(id) && id !== ex.indexId);
    const routes = ex.routes || [];
    const infos = routes.map(r => routeInfo(ex, r));
    const inTol = infos.filter(i => Math.abs(i.length - ex.targetKm * 1000) <= ex.tolKm * 1000).length;
    const hint = feasHint(ex, idx, pool);
    const loops = routes.length && idx ? routes.filter(r => { const q = [idx.id, ...r.stops]; if (q.some(id => !ptById(id))) return false; const xy = q.map(id => { const g = geoOf(ptById(id)); return [g.E, g.N]; }); return Routes.shapeOf(r.stops.map((_, k) => k + 1), xy).retrace <= 0.25; }).length : 0;
    const meet = routes.length && idx ? Routes.meetings(routes.map(r => ({ stops: r.stops.map(id => [idx.id, ...pool].indexOf(id)) })).filter(r => r.stops.every(i => i > 0)), distMatrix([idx.id, ...pool])) : [];
    el.innerHTML = `<button class="btn sm ghost back" id="exBack">‹ All exercises</button>
      <div class="view-head" style="margin-top:6px"><div><h2 id="exTitleH">${esc(ex.title || 'Untitled exercise')}</h2><p>${esc(exStatus(ex).label)} · created ${fmtDate(ex.createdAt)}</p></div></div>
      <div class="stack">
        <label class="fld"><span>Exercise name</span><input data-f="title" value="${esc(ex.title)}" placeholder="e.g. Ex day navigation two"></label>
        <div class="grid2"><label class="fld"><span>Company</span><input data-f="coy" value="${esc(ex.coy)}" placeholder="e.g. Echo"></label>
        <label class="fld"><span>Date</span><input data-f="date" value="${esc(ex.date)}" placeholder="e.g. 30 Sep 26"></label></div>
        <details class="adv"><summary>Paper header</summary><div class="grid2" style="margin-top:6px">
          <label class="fld"><span>Security marking</span><input data-f="security" value="${esc(ex.security)}"></label>
          <label class="fld"><span>Reference lines (top right)</span><textarea data-f="annex" rows="2" placeholder="Annex B to&#10;Serial 1">${esc(ex.annex)}</textarea></label></div>
          <p class="tiny" style="margin-top:6px">The title and date print under these lines, like your unit's papers.</p></details>
      </div>

      <div class="section"><h3>Start point (Index)</h3>
        <div class="chips" id="idxChips">${pts.map(p => `<button class="chip index ${p.id === ex.indexId ? 'on' : ''}" data-id="${p.id}">${p.no} · ${esc(p.name)}</button>`).join('')}</div>
        <p class="tiny" style="margin-top:6px">Every syndicate starts and finishes here.</p></div>

      <div class="section"><h3>Checkpoints in play <span class="count">${pool.length} of ${pts.length - (idx ? 1 : 0)}</span></h3>
        <div class="row" style="margin-bottom:8px"><button class="btn sm" id="poolAll">All</button><button class="btn sm" id="poolNone">None</button></div>
        <div class="chips" id="poolChips">${(idx ? byDistance(idx, pts) : pts.filter(p => p.id !== ex.indexId).map(p => ({ p }))).map(({ p, L }) => `<button class="chip ${pool.includes(p.id) ? 'on' : ''}" data-id="${p.id}">${p.no} · ${esc(p.name)}${L ? ` <small>${km(L.ground)}</small>` : ''}</button>`).join('')}</div>
        ${idx ? `<p class="tiny" style="margin-top:6px">Nearest to the Index first.</p>` : ''}</div>

      ${idx && pool.length ? `<div class="section"><h3>Map of points${routes.length ? ' and routes' : ''}</h3>
        ${routes.length ? `<div class="syn-bar"><label class="fld"><span>Show route of</span><select id="synSel"><option value="">All syndicates</option>${routes.map(r => `<option value="${r.synd}" ${S.selRoute === r.synd ? 'selected' : ''}>Syndicate ${r.synd} · ${(routeInfo(ex, r).length / 1000).toFixed(1)} km</option>`).join('')}</select></label>
          <button class="btn" id="synOnMap">${icon('globe')} On map</button></div>` : ''}
        ${routes.length ? `<div class="chips synchips" id="synChips"><button class="chip ${!S.selRoute ? 'on' : ''}" data-syn="">All</button>${routes.map(r => `<button class="chip ${S.selRoute === r.synd ? 'on' : ''}" data-syn="${r.synd}" style="${S.selRoute === r.synd ? `background:${colorOf(r.synd)};border-color:${colorOf(r.synd)}` : `border-color:${colorOf(r.synd)}`}">${r.synd}</button>`).join('')}</div>` : ''}
        <div class="rmap-wrap" id="rmap">${routeSVG(ex, [idx, ...pool.map(ptById)], routes, S.selRoute, { names: true, big: true, font: 22 })}</div>
        ${S.selRoute ? (() => { const r = routes.find(x => x.synd === S.selRoute); const inf = routeInfo(ex, r); const seq = [idx, ...r.stops.map(ptById), idx];
          const nm = i => i === 0 ? 'Index' : i === seq.length - 1 ? 'Index (home)' : 'CP' + i;
          return `<p class="tiny" style="margin-top:8px">Syndicate ${r.synd}'s checkpoints are numbered in the order it visits them, as on the leader summary.</p>
            <div class="list" style="margin-top:6px">${inf.legs.map((L, i) => `<div class="li"><span class="no" style="background:${colorOf(r.synd)};color:#fff">${i === inf.legs.length - 1 ? 'IX' : i + 1}</span><div class="main"><b>${nm(i)} → ${nm(i + 1)}${i + 1 < seq.length - 1 ? ' · ' + esc(seq[i + 1].name) : ''}</b>${grHTML(gridOf(seq[i + 1]), 'sm')} <span class="tiny">${bearingText(L)}</span></div><b>${(L.ground / 1000).toFixed(2)} km</b></div>`).join('')}
            <div class="li"><div class="main"><b>Syndicate ${r.synd} total</b></div><b>${(inf.length / 1000).toFixed(2)} km</b></div></div>`; })()
          : `<p class="tiny" style="margin-top:6px">${routes.length ? 'Tap a syndicate number (or its line) to see its route alone, with arrows and the km of each leg.' : 'Your Index (IX) and checkpoints on the map grid. Make routes to see each syndicate\'s line.'}</p>`}
        <details class="adv" style="margin-top:8px"><summary>Distances between points (km)</summary>${distTableHTML([idx, ...pool.map(ptById)])}</details>
      </div>` : ''}

      <div class="section"><h3>Routes</h3>
        <div class="grid2">
          <label class="fld"><span>Syndicates</span><input type="number" min="1" max="80" data-f="count" data-num value="${ex.count}"></label>
          <label class="fld"><span>Checkpoints per route</span><input type="number" min="1" max="30" data-f="perRoute" data-num value="${ex.perRoute}"></label>
          <label class="fld"><span>Distance (km)</span><input type="number" min="1" step="0.5" data-f="targetKm" data-num value="${ex.targetKm}"></label>
          <label class="fld"><span>Allowed ± (km)</span><input type="number" min="0.1" step="0.1" data-f="tolKm" data-num value="${ex.tolKm}"></label>
        </div>
        <p class="small muted" style="margin-top:8px" id="exHint">${hint}</p>
        <p class="tiny" style="margin-top:4px">Distances are straight lines on the map, from point to point.</p></div>

      <div class="section"><h3>Slip messages</h3>
        <p class="tiny" style="margin-bottom:8px">The app adds the grid under each message. You can use {syn} = syndicate number, {cp} = checkpoint number and {home} = start point name.</p><div class="stack">
        <label class="fld"><span>On the start slip</span><input data-f="startMsg" value="${esc(ex.startMsg)}"></label>
        <label class="fld"><span>At each checkpoint</span><textarea data-f="slipMsg" rows="2">${esc(ex.slipMsg)}</textarea></label>
        <label class="fld"><span>At the last checkpoint</span><textarea data-f="endMsg" rows="2">${esc(ex.endMsg)}</textarea></label></div></div>

      <div class="section"><button class="btn signal block" id="genBtn" style="min-height:52px;font-size:16px">${routes.length ? 'Make new routes' : 'Make routes'}</button></div>

      ${routes.length ? `
      <div class="section"><h3>Plan <span class="count">${routes.length} syndicates</span></h3>
        <div class="stats">
          <div class="stat"><b>${inTol}/${routes.length}</b><span>within ${ex.targetKm} ± ${ex.tolKm} km</span></div>
          <div class="stat"><b>${(infos.reduce((s, i) => s + i.length, 0) / infos.length / 1000).toFixed(1)}</b><span>average km</span></div>
          <div class="stat"><b>${loops}/${routes.length}</b><span>clean loops (no walking back)</span></div>
        </div>
        ${(ex.warnings || []).map(w => `<div class="callout warn" style="margin-top:8px">${esc(w)}</div>`).join('')}
        <div style="margin-top:10px">${routes.map((r, i) => {
          const inf = infos[i]; const off = Math.abs(inf.length - ex.targetKm * 1000) > ex.tolKm * 1000;
          return `<div class="route ${S.selRoute === r.synd ? 'sel' : ''}" data-syn="${r.synd}">
            <div class="hd"><span class="sw swc" style="background:${colorOf(r.synd)}"></span><b>Syndicate ${r.synd}</b>
              <span class="km ${off ? 'off' : ''}">${inf.broken ? '—' : (inf.length / 1000).toFixed(1) + ' km'}</span>
              <button class="icon-btn sm" data-rt="${r.synd}" aria-label="Edit route">${icon('edit')}</button></div>
            <div class="seq"><span class="s home">IX</span>${r.stops.map(id => `<span class="ar">›</span><span class="s">${ptById(id)?.no ?? '?'}</span>`).join('')}<span class="ar">›</span><span class="s home">IX</span></div>
          </div>`;
        }).join('')}</div></div>
      <div class="section"><h3>Print</h3>
        <div class="printgrid">
          <button class="btn" data-print="master">${icon('print')} Leader summary<small>Check points summary + register</small></button>
          <button class="btn" data-print="synd">${icon('print')} Syndicate slips<small>One page per syndicate, one column — cut and place</small></button>
          <button class="btn" data-print="sketch">${icon('print')} Route maps<small>All routes + one map per syndicate</small></button>
          <button class="btn" data-print="slips4">${icon('print')} Slips by checkpoint<small>Same messages, one envelope per place</small></button>
          <button class="btn" data-print="cards">${icon('print')} Syndicate cards<small>First grid only; log arrival times</small></button>
          <button class="btn" data-print="cardsfull">${icon('print')} Cards with full route<small>All grids revealed</small></button>
          <button class="btn" data-go="control">${icon('radar')} Open control board<small>Track syndicates live</small></button>
        </div></div>
      <div class="section"><button class="btn ghost danger sm" id="delEx">${icon('trash')} Delete exercise</button></div>` : ''}`;

    // bindings
    $('#exBack', el).onclick = () => { S.exOpen = false; S.selRoute = null; render(); MapUI.redraw(); };
    $$('[data-f]', el).forEach(inp => inp.addEventListener('input', () => {
      const v = inp.hasAttribute('data-num') ? Number(inp.value) : inp.value;
      if (inp.hasAttribute('data-num') && !(v > 0)) return;
      ex[inp.dataset.f] = v; saveEx(ex);
      if (inp.dataset.f === 'title') $('#exTitleH', el).textContent = v || 'Untitled exercise';
    }));
    $$('[data-f][data-num]', el).forEach(inp => inp.addEventListener('input', () => { const h = $('#exHint', el); if (h) h.innerHTML = feasHint(ex, idx, pool); }));
    $$('#idxChips .chip', el).forEach(c => c.onclick = () => {
      ex.indexId = c.dataset.id; setRefPoint(ex.indexId); ex.poolIds = (ex.poolIds || []).filter(i => i !== ex.indexId);
      Store.save('exercises', ex); render(); MapUI.redraw();
    });
    $$('#poolChips .chip', el).forEach(c => c.onclick = () => {
      const s = new Set(ex.poolIds || []); s.has(c.dataset.id) ? s.delete(c.dataset.id) : s.add(c.dataset.id);
      ex.poolIds = [...s]; Store.save('exercises', ex); render(); MapUI.redraw();
    });
    $('#poolAll', el).onclick = () => { ex.poolIds = pts.filter(p => p.id !== ex.indexId).map(p => p.id); Store.save('exercises', ex); render(); MapUI.redraw(); };
    $('#poolNone', el).onclick = () => { ex.poolIds = []; Store.save('exercises', ex); render(); MapUI.redraw(); };
    $('#genBtn', el).onclick = () => {
      if (ex.progress && Object.keys(ex.progress).length) confirmSheet('Make new routes?', 'The control board has arrivals logged for the current routes. New routes will clear them.', 'Make new routes', () => generate(ex));
      else generate(ex);
    };
    const pickSyn = v => selectSyndicate(v ? Number(v) : null);
    $$('#synChips .chip', el).forEach(c => c.onclick = () => pickSyn(c.dataset.syn));
    const ss = $('#synSel', el); if (ss) ss.onchange = () => pickSyn(ss.value);
    const om = $('#synOnMap', el); if (om) om.onclick = () => { if (matchMedia('(max-width: 860px)').matches) go('map'); else MapUI.redraw(true); };
    $$('#rmap .rt', el).forEach(pth => pth.addEventListener('click', () => pickSyn(S.selRoute === Number(pth.dataset.syn) ? '' : pth.dataset.syn)));
    $$('.route', el).forEach(r => r.onclick = e => {
      const syn = Number(r.dataset.syn);
      if (e.target.closest('[data-rt]')) return routeEditor(ex, syn);
      S.selRoute = S.selRoute === syn ? null : syn; render(); MapUI.redraw(true);
      if (S.selRoute && innerWidth <= 860) toast('Syndicate ' + syn + ' shown on the Map tab');
    });
    $$('[data-print]', el).forEach(b => b.onclick = () => printDoc(ex, b.dataset.print));
    const d = $('#delEx', el); if (d) d.onclick = () => confirmSheet('Delete exercise?', `Delete "${ex.title}" and its routes?`, 'Delete exercise', async () => {
      await Store.remove('exercises', ex.id); S.exId = exercises()[0]?.id || null; S.exOpen = false; toast('Exercise deleted'); render(); MapUI.redraw();
    });
    S.pick = null;
  }

  // Show one syndicate's route (side drawing + real map), or all when syn is null.
  function selectSyndicate(syn) {
    S.selRoute = syn || null;
    const sc = $('#panel').scrollTop; if (S.view === 'exercise') { render(); $('#panel').scrollTop = sc; }
    MapUI.redraw(true);
  }

  function exStatus(x) {
    const routes = x.routes || [], prog = x.progress || {};
    if (x.kind === 'op') return (x.assign || []).length ? { label: 'Platoons assigned', cls: '' } : { label: 'Draft — not assigned yet', cls: 'soft' };
    if (!routes.length) return { label: 'Draft — no routes yet', cls: 'soft' };
    const fin = routes.filter(r => (prog[r.synd] || []).length > r.stops.length).length;
    const out = routes.filter(r => (prog[r.synd] || []).length > 0).length;
    if (fin === routes.length) return { label: 'Finished', cls: 'soft' };
    if (out) return { label: `In progress — ${fin}/${routes.length} finished`, cls: 'warn' };
    return { label: 'Planned', cls: '' };
  }

  /* Exercise history: every exercise on this map, newest first. */
  function renderExHistory(el, xs, pts) {
    const list = xs.slice().sort((a, b) => b.createdAt - a.createdAt);
    el.innerHTML = `<div class="view-head"><div><h2>Exercises</h2><p>Your exercises on <b>${esc(activeMap().name)}</b>. Open one to plan, print or follow it.</p></div>
        ${pts.length >= 3 ? '<button class="btn primary" id="newEx">New exercise</button>' : ''}</div>
      ${pts.length < 3 ? `<div class="empty"><p><b>Add points first.</b></p><p class="small">You need an Index (start point) and at least 2 checkpoints.</p><button class="btn primary" data-go="points">Go to points</button></div>` : ''}
      ${list.length ? `<div class="list">${list.map(x => { const st = exStatus(x); const n = (x.routes || []).length; return `
        <div class="li tap exrow" data-open="${x.id}">
          <div class="main"><b>${esc(x.title || 'Untitled exercise')}</b>
            <span class="tiny">${x.kind === 'op' ? `<span class="badge op">Operation</span> ${x.date ? esc(x.date) + ' · ' : ''}${x.intake ? esc(x.intake) + ' · ' : ''}${x.coys} coy × ${x.perCoy} platoons · ${(x.places || []).length} places`
              : `${x.date ? esc(x.date) + ' · ' : ''}${x.coy ? esc(x.coy) + ' Coy · ' : ''}${n ? `${n} syndicates · ${x.perRoute} CPs · ${x.targetKm} km` : 'no routes yet'}`}</span>
            <div class="row" style="margin-top:4px"><span class="badge ${st.cls}">${esc(st.label)}</span><span class="tiny">created ${fmtDate(x.createdAt)}</span></div></div>
          <div class="acts"><button class="icon-btn sm" data-dup="${x.id}" aria-label="Copy exercise" title="Make a copy">${icon('copy')}</button><button class="icon-btn sm danger" data-delx="${x.id}" aria-label="Delete exercise" title="Delete">${icon('trash')}</button></div>
        </div>`; }).join('')}</div>
        <p class="tiny" style="margin-top:8px">${list.length} exercise${list.length > 1 ? 's' : ''}. Copy an old exercise to reuse its settings with new routes.</p>`
      : pts.length >= 3 ? `<div class="empty"><p><b>No exercises yet.</b></p><p class="small">Make your first one — name it, choose checkpoints and distance, then make routes.</p></div>` : ''}`;
    const n = $('#newEx', el); if (n) n.onclick = newExercise;
    $$('[data-open]', el).forEach(r => r.onclick = e => {
      if (e.target.closest('[data-delx],[data-dup]')) return;
      S.exId = r.dataset.open; S.exOpen = true; lsSet(prefKey('ex'), S.exId); S.selRoute = null; render(); MapUI.redraw(true);
    });
    $$('[data-delx]', el).forEach(b => b.onclick = () => { const x = Store.get('exercises', b.dataset.delx);
      confirmSheet('Delete exercise?', `Delete "${x.title}" with its routes and control-board times? This can't be undone.`, 'Delete exercise', async () => {
        await Store.remove('exercises', x.id); if (S.exId === x.id) S.exId = null; toast('Exercise deleted'); render(); MapUI.redraw(); }); });
    $$('[data-dup]', el).forEach(b => b.onclick = async () => { const x = Store.get('exercises', b.dataset.dup);
      const { id, createdAt, updatedAt, routes, progress, startedAt, warnings, seed, assign, ...rest } = x;
      const c = await Store.save('exercises', { ...rest, title: (x.title || 'Exercise') + ' (copy)', routes: [], progress: {}, assign: [] });
      S.exId = c.id; S.exOpen = true; toast(x.kind === 'op' ? 'Copy made — press Assign platoons' : 'Copy made — press Make routes'); render(); });
    S.pick = null;
  }

  function feasHint(ex, idx, pool) {
    if (!idx || pool.length < 2) return '';
    // typical leg = average distance from each point to its 3 nearest neighbours (routes link nearby points)
    const D = distMatrix([idx.id, ...pool]); let s = 0;
    D.forEach((row, i) => { const near = row.filter((_, j) => j !== i).sort((a, b) => a - b).slice(0, 3); s += near.reduce((a, b) => a + b, 0) / near.length; });
    const avg = s / D.length / 1000; const fit = Math.max(1, Math.round(ex.targetKm / avg) - 1);
    return `Nearby points are about ${avg.toFixed(1)} km apart, so roughly <b>${fit} checkpoint${fit > 1 ? 's' : ''}</b> per route fit ${ex.targetKm} km. Make routes to see the exact result.` +
      (ex.perRoute > pool.length ? ` <span class="err">You asked for ${ex.perRoute} per route but only ${pool.length} are in play.</span>` : '');
  }

  function newExercise() {
    openSheet(`<div class="sheet-head"><h3>New exercise</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="small muted">What kind of exercise?</p>
      <div class="stack" style="margin-top:12px">
        <button class="btn kind-btn" data-kind="nav">${icon('route')}<span><b>Navigation</b><small>Syndicates walk routes through checkpoints, about the same km each</small></span></button>
        <button class="btn kind-btn" data-kind="op">${icon('flag')}<span><b>Operation</b><small>Each platoon is given a place and an operation: fighting patrol, ambush, raid …</small></span></button>
      </div>`, box => {
      $$('[data-kind]', box).forEach(b => b.onclick = async () => { closeSheet(); b.dataset.kind === 'op' ? newOperation() : newNavigation(); });
    });
  }
  async function newOperation() {
    const x = await Store.save('exercises', { ...OP_DEF(), mapId: S.mapId });
    S.exId = x.id; S.exOpen = true; S.selPl = null; lsSet(prefKey('ex'), x.id); render(); MapUI.redraw();
  }
  async function newNavigation() {
    const pts = points();
    const x = await Store.save('exercises', { ...DEF, mapId: S.mapId, title: '',
      indexId: pts[0]?.id || null, poolIds: pts.slice(1).map(p => p.id), routes: [], progress: {} });
    S.exId = x.id; S.exOpen = true; lsSet(prefKey('ex'), x.id); S.selRoute = null; render(); MapUI.redraw();
  }

  function generate(ex) {
    const idx = ptById(ex.indexId);
    if (!idx) return toast('Choose the start point (Index) first', true);
    const pool = (ex.poolIds || []).filter(id => ptById(id) && id !== ex.indexId);
    if (pool.length < ex.perRoute) return toast(`Each route needs ${ex.perRoute} checkpoints but only ${pool.length} are in play`, true);
    const btn = $('#genBtn'); btn.disabled = true; btn.textContent = 'Working…';
    setTimeout(() => {
      const ids = [idx.id, ...pool];
      const seed = (Date.now() % 2147483647) | 1;
      const xy = ids.map(id => { const g = geoOf(ptById(id)); return [g.E, g.N]; });
      // Memory: avoid the routes of this exercise's last plan and of earlier exercises on this map
      const pos = new Map(ids.map((id, k) => [id, k]));
      const past = [ex, ...exercises().filter(x => x.id !== ex.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)]
        .flatMap(x => x.routes || []).map(r => r.stops.map(id => pos.get(id))).filter(st => st.every(k => k > 0));
      const res = Routes.plan({ dist: distMatrix(ids), xy, count: ex.count, perRoute: ex.perRoute, targetM: ex.targetKm * 1000, tolM: ex.tolKm * 1000, seed, avoid: past });
      ex.routes = res.routes.map((r, i) => ({ synd: i + 1, stops: r.stops.map(k => ids[k]) }));
      ex.warnings = res.warnings; ex.seed = seed; ex.progress = {}; ex.startedAt = null;
      Store.save('exercises', ex);
      S.selRoute = null; render(); MapUI.redraw(true);
      toast(res.routes.length ? `${res.routes.length} routes ready` : 'No routes could be made — see the notes', !res.routes.length);
      if (res.routes.length) backupReminder();
    }, 30);
  }

  function routeEditor(ex, syn) {
    const r = ex.routes.find(x => x.synd === syn); const pool = (ex.poolIds || []).filter(ptById);
    const opts = cur => pool.map(id => `<option value="${id}" ${id === cur ? 'selected' : ''}>${ptById(id).no} · ${esc(ptById(id).name)}</option>`).join('');
    openSheet(`<div class="sheet-head"><h3>Syndicate ${syn} route</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="small muted">Change any stage. Distance and bearings update as you go.</p>
      <div class="stack" id="rStages" style="margin-top:12px">${r.stops.map((id, i) => `<label class="fld"><span>Stage ${i + 1}</span><select data-i="${i}">${opts(id)}</select></label>`).join('')}</div>
      <div id="rInfo" style="margin-top:12px"></div>
      <div class="sheet-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="rSave">Save route</button></div>`, box => {
      const read = () => $$('select', box).map(s => s.value);
      const info = () => {
        const stops = read(); const dup = stops.length !== new Set(stops).size;
        const inf = routeInfo(ex, { stops }); const idx = ptById(ex.indexId);
        const names = [idx, ...stops.map(ptById), idx];
        const same = ex.routes.find(o => o.synd !== syn && o.stops.join() === stops.join());
        $('#rInfo', box).innerHTML = `${dup ? '<p class="err">A checkpoint appears twice.</p>' : ''}${same ? `<p class="err">Same as syndicate ${same.synd}.</p>` : ''}
          <div class="list">${inf.legs.map((L, i) => `<div class="li"><div class="main"><b>${i === inf.legs.length - 1 ? 'To Index' : 'To CP ' + names[i + 1].no}</b><span class="tiny">${bearingText(L)}</span></div><b>${Geo.fmtDist(L.ground)}</b></div>`).join('')}
          <div class="li"><div class="main"><b>Total</b></div><b>${(inf.length / 1000).toFixed(2)} km</b></div></div>`;
        return !dup;
      };
      $$('select', box).forEach(s => s.onchange = info); info();
      $('#rSave', box).onclick = () => { if (!info()) return toast('Fix the route first', true); r.stops = read(); Store.save('exercises', ex); closeSheet(); render(); MapUI.redraw(); toast('Route saved'); };
    });
  }

  /* ================================================================
     OPERATIONS EXERCISE
     The commander chooses places (points on the map) and the operation at
     each place (fighting patrol, ambush, raid …). Companies × platoons must
     equal the number of places. The app gives every platoon one place, and
     prints one order per platoon plus a leader summary.
     ================================================================ */
  const PHONETIC = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike',
    'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
  const opId = () => 'o' + Math.random().toString(36).slice(2, 9);
  // Starting values only: every one of these can be changed in the exercise.
  const OP_DEF = () => ({
    kind: 'op', title: '', intake: '', date: '', time: '0600', security: 'EX-SECRET', annex: 'Annex C to\nSerial 1',
    coys: 1, perCoy: 3, coyNames: [], plNumbering: 'run', gridDigits: 6,
    opTypes: [
      ['Fighting patrol', 'defeat the enemy by conducting a fighting patrol'],
      ['Ambush', 'destroy the enemy by conducting an ambush'],
      ['Raid', 'destroy the enemy by conducting a raid'],
      ['Dawn attack', 'defeat the enemy by conducting a dawn attack'],
      ['Recce patrol', 'gain information on the enemy by conducting a recce patrol'],
      ['Patrol base', 'establish and secure a patrol base'],
      ['Alternative patrol base', 'establish and secure an alternative patrol base']].map(([name, task]) => ({ id: opId(), name, task })),
    orderMsg: 'No {pl} Platoon is to {task} at grid {grid} ({latlon}) not later than {time} hrs on {date}.',
    places: [], assign: []
  });
  const coyName = (ex, c) => (ex.coyNames || [])[c] || PHONETIC[c] || 'Coy ' + (c + 1);
  // Every platoon of the exercise: key stays the same when names change.
  function platoons(ex) {
    const out = [];
    for (let c = 0; c < ex.coys; c++) for (let k = 0; k < ex.perCoy; k++)
      out.push({ key: c + '-' + k, c, coy: coyName(ex, c), no: ex.plNumbering === 'coy' ? k + 1 : c * ex.perCoy + k + 1 });
    return out;
  }
  const opPlaces = ex => (ex.places || []).filter(pl => ptById(pl.id));
  const opOfPlace = (ex, pointId) => { const pl = (ex.places || []).find(x => x.id === pointId); return pl && (ex.opTypes.find(o => o.id === pl.op) || ex.opTypes[0]); };
  // pointId -> platoon, only for a complete and still valid assignment
  function opAssignMap(ex) {
    const pls = platoons(ex), places = new Set(opPlaces(ex).map(p => p.id)), out = new Map();
    for (const a of ex.assign || []) { const pl = pls.find(x => x.key === a.key); if (pl && places.has(a.id)) out.set(a.id, pl); }
    return out;
  }
  const wgsText = p => { const w = wgsOf(p); return `${Geo.toDMS(w.lat, true, 1)} ${Geo.toDMS(w.lon, false, 1)}`; };
  const wgsDec = p => { const w = wgsOf(p); return `${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`; };
  function fillOrder(ex, pl, p) {
    const op = opOfPlace(ex, p.id) || { name: '', task: '' };
    const v = { pl: pl.no, coy: pl.coy, task: op.task, op: op.name, place: p.name, grid: gridOf(p, ex.gridDigits), latlon: wgsText(p),
      time: ex.time || '____', date: ex.date || '________', intake: ex.intake || '' };
    return String(ex.orderMsg || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  }

  /* The assignment: many random tries, keep the one with the fewest problems.
     - a platoon should not get the same place it had last time (here or in earlier operations on this map)
     - platoons of one company should get different kinds of operation when possible
     Each press gives a new result. */
  function assignPlatoons(ex) {
    const pls = platoons(ex), places = opPlaces(ex);
    if (places.length !== pls.length) return toast(`Choose exactly ${pls.length} places (you have ${places.length})`, true);
    const before = new Map((ex.assign || []).map(a => [a.key, a.id]));
    const label = pl => pl.coy + '|' + pl.no;
    const past = new Map();
    exercises().filter(x => x.kind === 'op' && x.id !== ex.id).forEach(x => { const pp = platoons(x); (x.assign || []).forEach(a => { const pl = pp.find(q => q.key === a.key); if (pl) past.set(label(pl) + '>' + a.id, 1); }); });
    const R = Routes.rng((Date.now() % 2147483647) | 1);
    let best = null, bestCost = Infinity;
    for (let t = 0; t < 600; t++) {
      const order = places.map(p => p.id);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      let cost = R() * 0.5;
      pls.forEach((pl, i) => {
        if (places.length > 1 && before.get(pl.key) === order[i]) cost += 5;
        if (past.has(label(pl) + '>' + order[i])) cost += 1.5;
      });
      for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++)
        if (pls[i].c === pls[j].c && opOfPlace(ex, order[i])?.id === opOfPlace(ex, order[j])?.id) cost += 2;
      if (cost < bestCost) { bestCost = cost; best = order; }
    }
    ex.assign = pls.map((pl, i) => ({ key: pl.key, id: best[i] }));
    Store.save('exercises', ex); S.selPl = null; render(); MapUI.redraw(true);
    toast(`${pls.length} platoons assigned`); backupReminder();
  }

  function renderOperation(el, ex, pts) {
    ex.coyNames = ex.coyNames || [];
    const pls = platoons(ex), need = pls.length;
    const chosen = opPlaces(ex);
    // a place just added with "Add a new place" is ticked straight away
    if (S.opPending && S.opPending.exId === ex.id) {
      const fresh = pts.filter(p => !S.opPending.before.has(p.id));
      if (fresh.length) { fresh.forEach(p => ex.places.push({ id: p.id, op: ex.opTypes[0]?.id })); Store.save('exercises', ex); }
      S.opPending = null; return renderOperation(el, ex, pts);
    }
    const asg = opAssignMap(ex);
    const done = need > 0 && asg.size === need;
    const byPl = new Map([...asg].map(([pid, pl]) => [pl.key, pid]));
    const opOpts = cur => ex.opTypes.map(o => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    const count = chosen.length === need ? `<span class="count ok">${chosen.length} of ${need} ✓</span>` : `<span class="count bad">${chosen.length} of ${need}</span>`;
    const sample = pls[0] && chosen[0] ? fillOrder(ex, pls[0], ptById(chosen[0].id)) : '';
    el.innerHTML = `<button class="btn sm ghost back" id="exBack">‹ All exercises</button>
      <div class="view-head" style="margin-top:6px"><div><span class="badge op">Operation</span><h2 id="exTitleH">${esc(ex.title || 'Untitled operation')}</h2>
        <p>${done ? `${need} platoons assigned` : 'Draft — platoons not assigned yet'} · created ${fmtDate(ex.createdAt)}</p></div></div>
      <div class="stack">
        <label class="fld"><span>Exercise name</span><input data-f="title" value="${esc(ex.title)}" placeholder="e.g. Ex Final Strike"></label>
        <div class="grid2"><label class="fld"><span>Intake</span><input data-f="intake" value="${esc(ex.intake)}" placeholder="e.g. Intake 18"></label>
        <label class="fld"><span>Date</span><input data-f="date" value="${esc(ex.date)}" placeholder="e.g. 14 Nov 26"></label></div>
        <label class="fld"><span>Not later than (time, same for all)</span><input data-f="time" value="${esc(ex.time)}" placeholder="e.g. 0600" inputmode="numeric"></label>
        <details class="adv"><summary>Paper header</summary><div class="grid2" style="margin-top:6px">
          <label class="fld"><span>Security marking</span><input data-f="security" value="${esc(ex.security)}"></label>
          <label class="fld"><span>Reference lines (top right)</span><textarea data-f="annex" rows="2">${esc(ex.annex)}</textarea></label></div></details>
      </div>

      <div class="section"><h3>Companies and platoons <span class="count">${need} platoons</span></h3>
        <div class="grid2">
          <label class="fld"><span>Companies</span><input type="number" min="1" max="26" data-n="coys" value="${ex.coys}"></label>
          <label class="fld"><span>Platoons per company</span><input type="number" min="1" max="9" data-n="perCoy" value="${ex.perCoy}"></label></div>
        <div class="coy-names">${Array.from({ length: ex.coys }, (_, c) => `<label class="fld"><span>Company ${c + 1}</span><input data-coy="${c}" value="${esc(ex.coyNames[c] || '')}" placeholder="${esc(PHONETIC[c] || 'Coy ' + (c + 1))}"></label>`).join('')}</div>
        <div class="seg" role="group" aria-label="Platoon numbers" style="margin-top:8px"><button data-pn="run" class="${ex.plNumbering !== 'coy' ? 'on' : ''}">Run on: No 1–${need}</button><button data-pn="coy" class="${ex.plNumbering === 'coy' ? 'on' : ''}">No 1–${ex.perCoy} per company</button></div>
        <p class="tiny" style="margin-top:6px">${esc(pls.slice(0, 6).map(p => `No ${p.no} (${p.coy})`).join(', '))}${need > 6 ? ' …' : ''}</p></div>

      <div class="section"><h3>Places of operation ${count}</h3>
        <p class="tiny" style="margin-bottom:8px">Tick ${need} places and choose the operation at each. Each place is a point on this map, entered by grid or by latitude/longitude.</p>
        <div class="list">${pts.map(p => { const on = chosen.find(c => c.id === p.id); return `
          <div class="li op-place ${on ? 'on' : ''}">
            <button class="tick" data-pt="${p.id}" aria-label="${on ? 'Remove' : 'Use'} ${esc(p.name)}">${on ? '✓' : ''}</button>
            <div class="main"><b>${p.no} · ${esc(p.name)}</b>${grHTML(gridOf(p), 'sm')} <span class="tiny">${esc(wgsText(p))}</span></div>
            ${on ? `<select data-op="${p.id}" aria-label="Operation at ${esc(p.name)}">${opOpts(on.op)}</select>` : ''}
          </div>`; }).join('') || '<div class="empty"><p class="small">No points on this map yet.</p></div>'}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="opAddPt">${icon('plus')} Add a new place</button></div></div>

      <details class="section adv"><summary><b>Operation types and their mission words</b> <span class="tiny">(${ex.opTypes.length})</span></summary>
        <p class="tiny" style="margin:6px 0 8px">The mission words go into {task} in the order below. Change them to match your orders.</p>
        <div class="stack">${ex.opTypes.map(o => `<div class="optype"><input data-otn="${o.id}" value="${esc(o.name)}" aria-label="Operation name"><input data-ott="${o.id}" value="${esc(o.task)}" aria-label="Mission words"><button class="icon-btn sm danger" data-otd="${o.id}" aria-label="Remove ${esc(o.name)}">${icon('trash')}</button></div>`).join('')}</div>
        <button class="btn sm" id="otAdd" style="margin-top:8px">${icon('plus')} Add operation type</button></details>

      <div class="section"><h3>Order wording</h3>
        <label class="fld"><span>Sentence on each platoon's paper</span><textarea data-f="orderMsg" rows="3">${esc(ex.orderMsg)}</textarea></label>
        <p class="tiny" style="margin-top:6px">Blanks the app fills in: {pl} platoon number · {coy} company · {op} operation · {task} mission words · {place} place name · {grid} grid · {latlon} coordinates · {time} · {date} · {intake}</p>
        <div class="grid2" style="margin-top:8px"><label class="fld"><span>Grid on papers</span><select data-gd><option value="6" ${ex.gridDigits == 6 ? 'selected' : ''}>6 figures (100 m)</option><option value="8" ${ex.gridDigits == 8 ? 'selected' : ''}>8 figures (10 m)</option></select></label></div>
        ${sample ? `<div class="callout" style="margin-top:8px" id="opSample"><span class="tiny">Example:</span><br>${esc(sample)}</div>` : ''}</div>

      <div class="section"><button class="btn signal block" id="asgBtn" style="min-height:52px;font-size:16px" ${chosen.length === need ? '' : 'disabled'}>${done ? 'Assign again (new draw)' : 'Assign platoons to places'}</button>
        ${chosen.length !== need ? `<p class="small err" style="margin-top:6px">${chosen.length < need ? `Tick ${need - chosen.length} more place${need - chosen.length > 1 ? 's' : ''}` : `Untick ${chosen.length - need} place${chosen.length - need > 1 ? 's' : ''}`}: ${need} platoons need ${need} places.</p>` : ''}
        <p class="tiny" style="margin-top:6px">Each press gives a new draw. The app avoids giving a platoon the place it had last time, and gives the platoons of one company different kinds of operation when it can.</p></div>

      ${done ? `<div class="section"><h3>Assignment</h3>
        <div class="list">${pls.map(pl => { const p = ptById(byPl.get(pl.key)); const op = opOfPlace(ex, p.id); return `
          <div class="li tap op-row ${S.selPl === pl.key ? 'sel' : ''}" data-pl="${pl.key}">
            <span class="no" style="background:${colorOf(pl.c + 1)};color:#fff">${pl.no}</span>
            <div class="main"><b>No ${pl.no} Pl · ${esc(pl.coy)} Coy</b><span class="op-name">${esc(op.name)}</span><span class="tiny">${esc(p.name)} · GR ${esc(gridOf(p, ex.gridDigits))}<br>${esc(wgsText(p))}</span></div>
            <select data-swap="${pl.key}" aria-label="Change place">${chosen.map(c => { const q = ptById(c.id); return `<option value="${q.id}" ${q.id === p.id ? 'selected' : ''}>${q.no} · ${esc(q.name)}</option>`; }).join('')}</select>
          </div>`; }).join('')}</div>
        <p class="tiny" style="margin-top:6px">Tap a platoon to see its place on the map. Change a place with its list: the two platoons swap.</p></div>
      <div class="section"><h3>Print</h3>
        <div class="printgrid">
          <button class="btn" data-oprint="sum">${icon('print')} Leader summary<small>All platoons, places, grids and coordinates</small></button>
          <button class="btn" data-oprint="orders">${icon('print')} Platoon orders<small>One page per platoon</small></button>
          <button class="btn" data-oprint="orders2">${icon('print')} Platoon orders (2 per page)<small>Saves paper — cut in half</small></button>
        </div></div>` : ''}
      <div class="section"><button class="btn ghost danger sm" id="delEx">${icon('trash')} Delete exercise</button></div>`;

    const re = () => { const sc = $('#panel').scrollTop; render(); $('#panel').scrollTop = sc; MapUI.redraw(); };
    $('#exBack', el).onclick = () => { S.exOpen = false; S.selPl = null; render(); MapUI.redraw(); };
    $$('[data-f]', el).forEach(inp => inp.addEventListener('input', () => {
      ex[inp.dataset.f] = inp.value; saveEx(ex);
      if (inp.dataset.f === 'title') $('#exTitleH', el).textContent = inp.value || 'Untitled operation';
      const s = $('#opSample', el); if (s && pls[0] && chosen[0]) s.innerHTML = '<span class="tiny">Example:</span><br>' + esc(fillOrder(ex, pls[0], ptById(chosen[0].id)));
    }));
    $$('[data-n]', el).forEach(inp => inp.addEventListener('change', () => {
      const v = Math.round(Number(inp.value)); if (!(v >= 1)) return;
      ex[inp.dataset.n] = Math.min(Number(inp.max), v); ex.assign = []; Store.save('exercises', ex); re();
    }));
    $$('[data-coy]', el).forEach(inp => inp.addEventListener('input', () => { ex.coyNames[Number(inp.dataset.coy)] = inp.value.trim(); saveEx(ex); }));
    $$('[data-coy]', el).forEach(inp => inp.addEventListener('change', re));
    $$('[data-pn]', el).forEach(b => b.onclick = () => { ex.plNumbering = b.dataset.pn; Store.save('exercises', ex); re(); });
    $$('[data-pt]', el).forEach(b => b.onclick = () => {
      const i = ex.places.findIndex(x => x.id === b.dataset.pt);
      if (i >= 0) ex.places.splice(i, 1); else ex.places.push({ id: b.dataset.pt, op: ex.opTypes[0]?.id });
      ex.assign = []; Store.save('exercises', ex); re();
    });
    $$('[data-op]', el).forEach(s => s.onchange = () => { ex.places.find(x => x.id === s.dataset.op).op = s.value; Store.save('exercises', ex); re(); });
    $('#opAddPt', el).onclick = () => { S.opPending = { exId: ex.id, before: new Set(pts.map(p => p.id)) }; pointEditor(); };
    $$('[data-otn]', el).forEach(i => i.addEventListener('input', () => { ex.opTypes.find(o => o.id === i.dataset.otn).name = i.value; saveEx(ex); }));
    $$('[data-otn]', el).forEach(i => i.addEventListener('change', re));
    $$('[data-ott]', el).forEach(i => i.addEventListener('input', () => { ex.opTypes.find(o => o.id === i.dataset.ott).task = i.value; saveEx(ex); }));
    $$('[data-otd]', el).forEach(b => b.onclick = () => {
      if (ex.opTypes.length < 2) return toast('Keep at least one operation type', true);
      const id = b.dataset.otd; ex.opTypes = ex.opTypes.filter(o => o.id !== id);
      ex.places.forEach(pl => { if (pl.op === id) pl.op = ex.opTypes[0].id; }); Store.save('exercises', ex); re();
    });
    $('#otAdd', el).onclick = () => { ex.opTypes.push({ id: opId(), name: 'New operation', task: 'conduct the operation' }); Store.save('exercises', ex); re(); };
    const gd = $('[data-gd]', el); gd.onchange = () => { ex.gridDigits = Number(gd.value); Store.save('exercises', ex); re(); };
    $('#asgBtn', el).onclick = () => assignPlatoons(ex);
    $$('.op-row', el).forEach(r => r.onclick = e => {
      if (e.target.closest('select')) return;
      S.selPl = S.selPl === r.dataset.pl ? null : r.dataset.pl; re(); MapUI.redraw(true);
      if (S.selPl && innerWidth <= 860) go('map');
    });
    $$('[data-swap]', el).forEach(s => s.onchange = () => {
      const me = ex.assign.find(a => a.key === s.dataset.swap), other = ex.assign.find(a => a.id === s.value);
      if (other && me) { other.id = me.id; me.id = s.value; Store.save('exercises', ex); re(); toast('Places swapped'); }
    });
    $$('[data-oprint]', el).forEach(b => b.onclick = () => printOps(ex, b.dataset.oprint));
    $('#delEx', el).onclick = () => confirmSheet('Delete exercise?', `Delete "${ex.title || 'this operation'}"?`, 'Delete exercise', async () => {
      await Store.remove('exercises', ex.id); S.exId = null; S.exOpen = false; toast('Exercise deleted'); render(); MapUI.redraw();
    });
    S.pick = null;
  }

  function printOps(ex, kind) {
    const asg = opAssignMap(ex), pls = platoons(ex);
    if (asg.size !== pls.length) return toast('Assign the platoons first', true);
    const byPl = new Map([...asg].map(([pid, pl]) => [pl.key, pid]));
    const rows = pls.map(pl => { const p = ptById(byPl.get(pl.key)); const op = opOfPlace(ex, p.id);
      return { pl, op, p, grid: gridOf(p, ex.gridDigits), latlon: wgsText(p), dec: wgsDec(p), order: fillOrder(ex, pl, p) }; });
    const doc = kind === 'sum' ? PrintDocs.opSummary({ ex, rows }) : PrintDocs.opOrders({ ex, rows, perPage: kind === 'orders2' ? 2 : 1 });
    const page = `<style>@page { size: A4 ${doc.landscape ? 'landscape' : 'portrait'}; margin: 12mm; }</style>`;
    const title = `${ex.title || 'Operation'} - ${kind === 'sum' ? 'Leader summary' : 'Platoon orders'}`;
    if (Native.isApp()) {
      const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${page}<style>body{margin:0;background:#fff}</style></head><body>${doc.html}</body></html>`;
      toast('Opening Android printing — choose a printer or "Save as PDF"');
      Native.print(full, title, doc.landscape).catch(e => toast('Printing failed: ' + e.message, true));
      return;
    }
    $('#printArea').innerHTML = page + doc.html;
    setTimeout(() => window.print(), 150);
  }

  function printCtx(ex) {
    const idx = ptById(ex.indexId);
    const pool = (ex.poolIds || []).map(ptById).filter(Boolean).sort((a, b) => a.no - b.no);
    const pts = {}; [idx, ...pool].forEach(p => pts[p.id] = p);
    const ids = [idx.id, ...pool.map(p => p.id)];
    const D = distMatrix(ids);
    const routes = ex.routes.filter(r => r.stops.every(id => pts[id])).map(r => { const inf = routeInfo(ex, r); return { ...r, length: inf.length, cum: inf.cum }; });
    const mt = Routes.meetings(routes.map(r => ({ stops: r.stops.map(id => ids.indexOf(id)) })), D).map(x => ({ cp: ids[x.cp], a: routes[x.a.ri].synd, b: routes[x.b.ri].synd }));
    return { ex, map: activeMap(), idx, pts, poolPoints: pool, routes, meetings: mt, meetWindow: 1500, grid: p => gridOf(p),
      svg: (sel, o) => routeSVG(ex, [idx, ...pool], routes, sel, o), legKm: (a, b) => leg(a, b).ground / 1000,
      latlon: p => `${Geo.toDMS(p.lat, true, 1)} ${Geo.toDMS(p.lon, false, 1)}`, progress: ex.progress || {} };
  }
  function printDoc(ex, kind) {
    if (!ptById(ex.indexId) || !ex.routes?.length) return toast('Make routes first', true);
    const ctx = printCtx(ex);
    const doc = kind === 'master' ? PrintDocs.master(ctx) : kind === 'synd' ? PrintDocs.syndSlips(ctx) : kind === 'sketch' ? PrintDocs.sketches(ctx) : kind === 'slips4' ? PrintDocs.slips(ctx, 4) : kind === 'slips6' ? PrintDocs.slips(ctx, 6)
      : kind === 'cards' ? PrintDocs.cards(ctx, false) : kind === 'cardsfull' ? PrintDocs.cards(ctx, true) : PrintDocs.board(ctx);
    const page = `<style>@page { size: A4 ${doc.landscape ? 'landscape' : 'portrait'}; margin: ${kind.startsWith('slips') || kind === 'synd' ? '8mm' : '12mm'}; }</style>`;
    const names = { master: 'Leader summary', synd: 'Syndicate slips', sketch: 'Route maps', slips4: 'Slips by checkpoint', cards: 'Syndicate cards', cardsfull: 'Syndicate cards', board: 'Control board' };
    const title = `${ex.title || 'Exercise'} - ${names[kind] || 'Print'}`;
    if (Native.isApp()) {
      const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${page}<style>body{margin:0;background:#fff}</style></head><body>${doc.html}</body></html>`;
      toast('Opening Android printing — choose a printer or "Save as PDF"');
      Native.print(full, title, doc.landscape).catch(e => toast('Printing failed: ' + e.message, true));
      return;
    }
    $('#printArea').innerHTML = page + doc.html;
    setTimeout(() => window.print(), 150);
  }

  /* ================================================================
     CONTROL BOARD (light-up)
     ================================================================ */
  function renderControl() {
    const el = $('[data-view="control"]'); const m = activeMap();
    if (!m) { el.innerHTML = `<div class="view-head"><div><h2>Control</h2></div></div>` + needMap('The control board'); return; }
    const ex = currentEx();
    if (!ex || ex.kind === 'op' || !ex.routes?.length || !ptById(ex.indexId)) {
      el.innerHTML = `<div class="view-head"><div><h2>Control board</h2><p>Follow every syndicate during the exercise. Each one's next checkpoint lights up.</p></div></div>
        <div class="empty"><p><b>No routes to follow yet.</b></p><button class="btn primary" data-go="exercise">Plan an exercise</button></div>`;
      return;
    }
    const prog = ex.progress || (ex.progress = {});
    const routes = ex.routes;
    const M = Math.max(...routes.map(r => r.stops.length));
    const fin = routes.filter(r => (prog[r.synd] || []).length > r.stops.length).length;
    const started = routes.filter(r => (prog[r.synd] || []).length > 0).length;
    const tm = ts => new Date(ts).toTimeString().slice(0, 5);
    const elapsed = ex.startedAt ? Math.floor((Date.now() - ex.startedAt) / 60000) : null;
    const xs = exercises();
    let body;
    if (S.boardMode === 'syn') {
      body = `<div class="board-wrap"><table class="board"><thead><tr><th>Synd</th>${Array.from({ length: M }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>Fin</th></tr></thead><tbody>
      ${routes.map(r => {
        const log = prog[r.synd] || []; const n = r.stops.length; const done = log.length > n;
        const nextId = log.length < n ? r.stops[log.length] : ex.indexId;
        const from = log.length === 0 ? ptById(ex.indexId) : ptById(r.stops[log.length - 1]);
        const L = !done ? leg(from, ptById(nextId)) : null;
        const cells = Array.from({ length: M }, (_, i) => {
          if (i >= n) return '<td></td>';
          const p = ptById(r.stops[i]); const st = log[i] ? 'done' : i === log.length ? 'next' : '';
          return `<td><div class="cell ${st}" data-cell="${r.synd}:${i}" title="${esc(p?.name)} · GR ${esc(gridOf(p))}"><b>${p?.no ?? '?'}</b><small>${log[i] ? tm(log[i]) : st === 'next' ? 'next' : ''}</small></div></td>`;
        }).join('');
        const fst = log[n] ? 'done' : log.length === n ? 'next' : '';
        return `<tr class="${done ? 'finished' : ''}"><td class="syn"><div class="synrow"><span><span class="swc" style="color:${colorOf(r.synd)}">■</span> ${r.synd}</span>
            <span class="synbtns">${log.length ? `<button class="icon-btn sm" data-undo="${r.synd}" aria-label="Undo last arrival for syndicate ${r.synd}">${icon('undo')}</button>` : ''}${done ? '' : `<button class="arr" data-arr="${r.synd}" aria-label="Syndicate ${r.synd} arrived">${icon('check')}</button>`}</span></div>
            <div class="tiny">${done ? 'finished' : `→ ${nextId === ex.indexId ? 'Index' : 'CP ' + ptById(nextId)?.no} · ${Geo.fmtDist(L.ground)}`}</div></td>${cells}
          <td><div class="cell ${fst}" data-cell="${r.synd}:${n}"><b>IX</b><small>${log[n] ? tm(log[n]) : fst ? 'next' : ''}</small></div></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="tiny" style="margin-top:6px">Orange = next move. Green = reached, with time. Press ✓ when a syndicate reports arrival. Tap a cell for details.</p>`;
    } else {
      const pool = [...new Set(routes.flatMap(r => r.stops))].map(ptById).filter(Boolean).sort((a, b) => a.no - b.no);
      body = `<div class="cpview">${pool.map(p => {
        const next = [], past = [];
        routes.forEach(r => { const log = prog[r.synd] || []; const i = r.stops.indexOf(p.id); if (i < 0) return; if (log[i]) past.push(r.synd); else if (i === log.length) next.push(r.synd); });
        return `<div class="cpbox"><h4><span class="no" style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--blue-soft);color:var(--blue);font-size:14px">${p.no}</span>${esc(p.name)}</h4>
          <div class="tiny">GR ${esc(gridOf(p))}</div>
          <div class="exp">${next.map(s => `<span>${s} next</span>`).join('')}${past.map(s => `<span class="past">${s} ✓</span>`).join('')}${!next.length && !past.length ? '<span class="tiny">no one yet</span>' : ''}</div></div>`;
      }).join('')}</div>`;
    }
    el.innerHTML = `<div class="view-head"><div><h2>Control board</h2><p>${esc(ex.title)} · ${started}/${routes.length} out · ${fin} finished${elapsed !== null ? ` · ${Math.floor(elapsed / 60)}h ${String(elapsed % 60).padStart(2, '0')}m since start` : ''}</p></div>
        <div class="row"><button class="btn sm" id="bPrint">${icon('print')} Print</button><button class="btn sm only-desktop" id="bWide">${S.wide ? 'Show map' : 'Wide board'}</button></div></div>
      ${xs.length > 1 ? `<label class="fld" style="margin-bottom:10px"><span>Exercise</span><select id="bEx">${xs.map(x => `<option value="${x.id}" ${x.id === ex.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>` : ''}
      <div class="row" style="margin-bottom:12px"><div class="seg grow" id="bMode"><button data-v="syn" class="${S.boardMode === 'syn' ? 'on' : ''}">By syndicate</button><button data-v="cp" class="${S.boardMode === 'cp' ? 'on' : ''}">By checkpoint</button></div>
        ${ex.startedAt ? `<button class="btn sm ghost danger" id="bReset">Reset</button>` : `<button class="btn sm signal" id="bStart">Start exercise</button>`}</div>
      ${body}`;
    $$('#bMode button', el).forEach(b => b.onclick = () => { S.boardMode = b.dataset.v; renderControl(); });
    const bx = $('#bEx', el); if (bx) bx.onchange = () => { S.exId = bx.value; lsSet(prefKey('ex'), bx.value); renderControl(); MapUI.redraw(); };
    $('#bPrint', el).onclick = () => printDoc(ex, 'board');
    const w = $('#bWide', el); if (w) w.onclick = () => { S.wide = !S.wide; $('#app').classList.toggle('board-wide', S.wide); renderControl(); setTimeout(() => MapUI.resize(), 60); };
    const st = $('#bStart', el); if (st) st.onclick = () => { ex.startedAt = Date.now(); Store.save('exercises', ex); renderControl(); toast('Exercise started ' + tm(ex.startedAt)); };
    const rs = $('#bReset', el); if (rs) rs.onclick = () => confirmSheet('Reset the board?', 'All arrival times will be cleared.', 'Reset board', () => { ex.progress = {}; ex.startedAt = null; Store.save('exercises', ex); renderControl(); MapUI.redraw(); });
    $$('[data-arr]', el).forEach(b => b.onclick = () => arrive(ex, Number(b.dataset.arr)));
    $$('[data-undo]', el).forEach(b => b.onclick = () => { const l = prog[b.dataset.undo]; if (l?.length) { l.pop(); Store.save('exercises', ex); renderControl(); MapUI.redraw(); } });
    $$('[data-cell]', el).forEach(c => c.onclick = () => { const [s, i] = c.dataset.cell.split(':').map(Number); cellSheet(ex, s, i); });
    S.pick = null;
    clearInterval(S.tick); S.tick = setInterval(() => { if (S.view === 'control' && $('#sheet').hidden) { const sc = $('#panel').scrollTop; renderControl(); $('#panel').scrollTop = sc; } }, 60000);
  }
  function arrive(ex, syn, when = Date.now()) {
    const l = ex.progress[syn] || (ex.progress[syn] = []);
    if (!ex.startedAt) ex.startedAt = when;
    l.push(when); Store.save('exercises', ex);
    const r = ex.routes.find(x => x.synd === syn);
    const nextId = l.length < r.stops.length ? r.stops[l.length] : l.length === r.stops.length ? ex.indexId : null;
    toast(nextId ? `Syndicate ${syn} → next ${nextId === ex.indexId ? 'Index' : 'CP ' + ptById(nextId).no}` : `Syndicate ${syn} finished`);
    const sc = $('#panel').scrollTop; renderControl(); $('#panel').scrollTop = sc; MapUI.redraw();
  }
  function cellSheet(ex, syn, i) {
    const r = ex.routes.find(x => x.synd === syn); const n = r.stops.length; const log = ex.progress[syn] || [];
    const p = i < n ? ptById(r.stops[i]) : ptById(ex.indexId);
    const from = i === 0 ? ptById(ex.indexId) : ptById(r.stops[i - 1]);
    const L = leg(from, p); const isNext = i === log.length;
    openSheet(`<div class="sheet-head"><h3>Syndicate ${syn} · ${i < n ? 'stage ' + (i + 1) : 'finish'}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="result" style="margin-top:0">${grHTML(gridOf(p), 'lg')}<p style="margin-top:6px"><b>${i < n ? 'CP ' + p.no + ' · ' : ''}${esc(p.name)}</b></p>
      <dl class="kv"><dt>Leg</dt><dd>${Geo.fmtDist(L.ground)} from ${i === 0 ? 'Index' : 'CP ' + from.no}</dd><span></span>
        <dt>Bearing</dt><dd>${bearingText(L)}</dd><span></span>
        <dt>Status</dt><dd>${log[i] ? 'Reached ' + new Date(log[i]).toTimeString().slice(0, 5) : isNext ? 'Next move' : 'Later'}</dd><span></span></dl></div>
      ${isNext ? `<label class="fld" style="margin-top:12px"><span>Arrival time</span><input type="time" id="arrT" value="${new Date().toTimeString().slice(0, 5)}"></label>` : ''}
      <div class="sheet-actions"><button class="btn ghost" data-close>Close</button>${isNext ? '<button class="btn primary" id="arrOk">Confirm arrival</button>' : ''}</div>`, box => {
      const ok = $('#arrOk', box); if (ok) ok.onclick = () => {
        const [hh, mm] = $('#arrT', box).value.split(':').map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0);
        closeSheet(); arrive(ex, syn, d.getTime());
      };
    });
  }

  /* ================================================================
     MAP (Leaflet)
     ================================================================ */
  const MapUI = (() => {
    let map, layer, gridLayer, flagLayer, ok = typeof L !== 'undefined';
    function init() {
      if (!ok) { $('#mapOff').hidden = false; return; }
      map = L.map('map', { zoomControl: true, attributionControl: true }).setView([-1.95, 30.06], 9);
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' });
      const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap, © OSM' });
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      const base = { 'Satellite': sat, 'Topographic': topo, 'Streets': osm };
      (base[lsGet('gridnav:base', 'Topographic')] || topo).addTo(map);
      L.control.layers(base, null, { position: 'topright' }).addTo(map);
      map.on('baselayerchange', e => lsSet('gridnav:base', e.name));
      layer = L.layerGroup().addTo(map); gridLayer = L.layerGroup().addTo(map); flagLayer = L.layerGroup().addTo(map);
      map.on('moveend', drawGrid);
      map.on('mousemove', e => readout(e.latlng));
      map.on('click', e => onClick(e.latlng));
    }
    function toMapDatum(ll) { const m = activeMap(); return Geo.convertDatum(ll.lat, ll.lng, 'WGS84', m.datum); }
    function readout(ll) {
      const m = activeMap(); if (!m) return;
      try { const p = toMapDatum(ll); const g = Geo.geoToGrid(p.lat, p.lon, m, m.datum, cal(m)); $('#readout').hidden = false;
        $('#readout').innerHTML = `GR <b>${g.grid6}</b> <span class="ro-ll">${esc(Geo.toDMS(p.lat, true, 1))} ${esc(Geo.toDMS(p.lon, false, 1))}</span>`; } catch (e) {}
    }
    function onClick(ll) {
      const m = activeMap(); if (!m) return;
      readout(ll);
      const p = toMapDatum(ll);
      if (S.view === 'convert') {
        S.convSrc = 'map';
        if (S.dir !== 'l2g') { S.dir = 'l2g'; lsSet(prefKey('dir'), 'l2g'); renderConvert(); }
        $('#latIn').value = p.lat.toFixed(7); $('#lonIn').value = p.lon.toFixed(7);
        runConvert(`${p.lat.toFixed(7)}|${p.lon.toFixed(7)}`, true, { src: m.datum });
        if (innerWidth <= 860) toast('GR ' + Geo.geoToGrid(p.lat, p.lon, m, m.datum, cal(m)).grid6 + ' — see Convert');
      } else if (S.view === 'points') {
        pointEditor(null, { lat: p.lat, lon: p.lon });
      }
    }
    const pin = (txt, cls = '') => L.divIcon({ className: '', html: `<div class="lbl-pin ${cls}" style="width:24px;height:24px">${esc(txt)}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    // What a point shows when you hover or tap it: its number, name, grid and real coordinates.
    function pointTip(p, label) {
      const m = activeMap(), g = geoOf(p, m);
      const w = m.datum !== 'WGS84' ? `<br><span class="tip-s">GPS ${Geo.fmtDD(g.wgsLat)}, ${Geo.fmtDD(g.wgsLon)}</span>` : '';
      return `<b>${esc(label)} · ${esc(p.name)}</b><br>GR <b>${esc(g.grid6)}</b> <span class="tip-s">(${esc(g.grid8)})</span><br>${esc(Geo.toDMS(g.lat, true, 1))} ${esc(Geo.toDMS(g.lon, false, 1))}${w}`;
    }
    // Arrow pointing along a leg, drawn at its middle (screen angle from the map's own projection)
    function legArrow(a, b, color) {
      const pa = map.latLngToLayerPoint(a), pb = map.latLngToLayerPoint(b);
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return L.marker(mid, { interactive: false, icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
        html: `<div class="leg-arrow" style="transform:rotate(${ang}deg);color:${color}">➤</div>` }) });
    }
    let picker = null;
    function routePicker(ex) {
      const show = ex && ex.routes && ex.routes.length && S.view !== 'control';
      if (!show) { if (picker) { picker.remove(); picker = null; } return; }
      if (!picker) {
        picker = L.control({ position: 'topleft' });
        picker.onAdd = () => { const d = L.DomUtil.create('div', 'map-picker'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; };
        picker.addTo(map);
      }
      const d = picker.getContainer();
      d.innerHTML = `<label>Route <select>${['<option value="">All syndicates</option>', ...ex.routes.map(r => `<option value="${r.synd}" ${S.selRoute === r.synd ? 'selected' : ''}>Syndicate ${r.synd}</option>`)].join('')}</select></label>`;
      d.querySelector('select').onchange = e => selectSyndicate(e.target.value ? Number(e.target.value) : null);
    }
    function redraw(fit) {
      if (!map) return; layer.clearLayers();
      const m = activeMap(); if (!m) { routePicker(null); return; }
      const ex = currentEx(); const pts = points();
      const pos = p => { const w = wgsOf(p, m); return [w.lat, w.lon]; };
      if (ex && ex.kind === 'op' && S.view !== 'points' && S.view !== 'convert') { drawOps(ex, pts, pos, fit); routePicker(null); drawGrid(); return; }
      const selR = ex && ex.routes && S.view !== 'control' && S.selRoute ? ex.routes.find(r => r.synd === S.selRoute) : null;
      pts.forEach(p => {
        const isIdx = S.view === 'points' ? refPoint()?.id === p.id : ex && ex.indexId === p.id;
        const inPool = !ex || isIdx || (ex.poolIds || []).includes(p.id);
        if (selR && !isIdx) {
          // Selected syndicate: its checkpoints numbered in visiting order (CP1, CP2 …); the rest are small dots.
          const k = selR.stops.indexOf(p.id) + 1;
          if (k) L.marker(pos(p), { icon: L.divIcon({ className: '', html: `<div class="lbl-pin" style="width:26px;height:26px;background:${colorOf(selR.synd)};border-color:#fff;color:#fff">${k}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 600 })
            .bindTooltip(pointTip(p, `Syndicate ${selR.synd} · CP${k} of ${selR.stops.length}`), { className: 'tip', direction: 'top', offset: [0, -12] }).addTo(layer);
          else L.marker(pos(p), { icon: L.divIcon({ className: '', html: '<div class="dot-pin"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), opacity: .5 })
            .bindTooltip(pointTip(p, 'Point ' + p.no + ' (not on this route)'), { className: 'tip', direction: 'top' }).addTo(layer);
          return;
        }
        L.marker(pos(p), { icon: pin(isIdx ? 'IX' : p.no, isIdx ? 'index' : ''), opacity: inPool ? 1 : .4, zIndexOffset: inPool ? 500 : 0 })
          .bindTooltip(pointTip(p, isIdx ? 'Index' : 'CP ' + p.no), { className: 'tip', direction: 'top', offset: [0, -12] }).addTo(layer);
      });
      // Spokes: a line from the Index to every point, with its distance (Points view, or before routes exist).
      const hasRoutes = ex && ex.routes && ex.routes.length && ptById(ex.indexId);
      const spokeFrom = S.view === 'points' ? refPoint() : (!hasRoutes && ex && S.view === 'exercise' ? ptById(ex.indexId) : null);
      if (spokeFrom) {
        const targets = S.view === 'points' ? pts : pts.filter(p => (ex.poolIds || []).includes(p.id));
        const col = getComputedStyle(document.documentElement).getPropertyValue('--spoke').trim() || '#4B5320';
        const ordered = byDistance(spokeFrom, targets);
        ordered.forEach(({ p, L: Lg }, i) => {
          const A = pos(spokeFrom), B = pos(p);
          L.polyline([A, B], { color: col, weight: 2, opacity: .8, dashArray: '2 6' })
            .bindTooltip(`Index → CP ${p.no} · ${esc(p.name)}<br><b>${km(Lg.ground)}</b> · ${String(Lg.mils).padStart(4, '0')} mils (${Lg.gridBearing.toFixed(0)}°)`, { className: 'tip', sticky: true }).addTo(layer);
          if (ordered.length <= 30) L.marker([A[0] + (B[0] - A[0]) * .55, A[1] + (B[1] - A[1]) * .55], { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0],
            html: `<div class="leg-lbl spoke">${km(Lg.ground)}</div>` }) }).addTo(layer);
        });
      }
      if (ex && ex.routes && ptById(ex.indexId)) {
        const idx = ptById(ex.indexId);
        if (S.view === 'control') {
          ex.routes.forEach(r => {
            const log = (ex.progress || {})[r.synd] || []; const n = r.stops.length;
            const at = log.length === 0 ? idx : log.length > n ? idx : ptById(r.stops[log.length - 1]);
            const next = log.length < n ? ptById(r.stops[log.length]) : log.length === n ? idx : null;
            if (next && at) L.polyline([pos(at), pos(next)], { color: colorOf(r.synd), weight: 3, dashArray: '4 6' }).addTo(layer);
            if (log.length && at) L.marker(pos(at), { icon: L.divIcon({ className: '', html: `<div class="lbl-pin syn" style="width:22px;height:22px;color:${colorOf(r.synd)};border-width:3px">${r.synd}</div>`, iconSize: [22, 22], iconAnchor: [4, 26] }) })
              .bindTooltip(`Syndicate ${r.synd} → ${next ? (next === idx ? 'Index (home)' : 'CP' + (log.length + 1) + ' · ' + esc(next.name)) : 'finished'}`, { className: 'tip' }).addTo(layer);
          });
        } else {
          ex.routes.forEach(r => {
            if (selR && r !== selR) return;
            const seq = [idx, ...r.stops.map(ptById), idx].filter(Boolean);
            const line = seq.map(pos);
            const isSel = selR === r;
            const pl = L.polyline(line, { color: colorOf(r.synd), weight: isSel ? 6 : 3, opacity: isSel ? .95 : .75, dashArray: isSel ? null : '6 6' }).addTo(layer);
            if (!isSel) pl.bindTooltip(`Syndicate ${r.synd} — tap to show its route`, { className: 'tip', sticky: true }).on('click', () => selectSyndicate(r.synd));
            if (isSel) {
              for (let i = 1; i < seq.length; i++) {
                const A = line[i - 1], B = line[i], Lg = leg(seq[i - 1], seq[i]);
                legArrow(A, B, colorOf(r.synd)).addTo(layer);
                L.marker([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0],
                  html: `<div class="leg-lbl">${i}: ${(Lg.ground / 1000).toFixed(1)} km</div>` }) }).addTo(layer);
              }
            }
          });
          if (selR && fit) map.fitBounds([idx, ...selR.stops.map(ptById)].filter(Boolean).map(pos), { padding: [60, 60], maxZoom: 15 });
        }
      }
      routePicker(ex);
      if (fit && !selR) fitPoints();
      drawGrid();
    }
    // Operation exercise: every place with its platoon and operation; other points are small dots.
    function drawOps(ex, pts, pos, fit) {
      const asg = opAssignMap(ex), placed = new Set(opPlaces(ex).map(p => p.id));
      let selP = null;
      pts.forEach(p => {
        if (!placed.has(p.id)) {
          L.marker(pos(p), { icon: L.divIcon({ className: '', html: '<div class="dot-pin"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), opacity: .5 })
            .bindTooltip(pointTip(p, 'Point ' + p.no + ' (not used)'), { className: 'tip', direction: 'top' }).addTo(layer);
          return;
        }
        const pl = asg.get(p.id), op = opOfPlace(ex, p.id);
        const sel = pl && S.selPl === pl.key; if (sel) selP = p;
        const col = pl ? colorOf(pl.c + 1) : 'var(--ink-2)';
        L.marker(pos(p), { opacity: S.selPl && !sel ? .45 : 1, zIndexOffset: sel ? 900 : 500,
          icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
            html: `<div class="op-pin ${sel ? 'sel' : ''}"><b style="background:${col}">${pl ? pl.no : '•'}</b><span>${esc(op ? op.name : '')}</span></div>` }) })
          .bindTooltip(pointTip(p, pl ? `No ${pl.no} Platoon · ${esc(pl.coy)} Coy · ${esc(op.name)}` : esc(op.name) + ' (not assigned yet)'), { className: 'tip', direction: 'top', offset: [0, -14] })
          .on('click', () => { if (pl) { S.selPl = S.selPl === pl.key ? null : pl.key; if (S.view === 'exercise') render(); redraw(); } })
          .addTo(layer);
      });
      if (fit) {
        if (selP) map.setView(pos(selP), Math.max(map.getZoom(), 14));
        else { const ll = pts.filter(p => placed.has(p.id)).map(pos); if (ll.length > 1) map.fitBounds(ll, { padding: [60, 60], maxZoom: 15 }); else if (ll.length) map.setView(ll[0], 14); else fitPoints(); }
      }
    }
    function fitPoints() {
      if (!map) return; const m = activeMap(); if (!m) return;
      const pts = points().map(p => { const w = wgsOf(p, m); return [w.lat, w.lon]; });
      if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
      else if (pts.length === 1) map.setView(pts[0], 14);
      else { const w = Geo.convertDatum(m.originLat, m.originLon, m.datum, 'WGS84'); map.setView([w.lat + 0.11, w.lon + 0.11], 11); }
    }
    // Draw the map's own 1 km grid on top so the screen matches the paper map.
    function drawGrid() {
      if (!map) return; gridLayer.clearLayers();
      const m = activeMap(), c = cal(m); if (!m || !c || map.getZoom() < 12) return;
      const b = map.getBounds();
      const corners = [b.getSouthWest(), b.getNorthEast(), b.getNorthWest(), b.getSouthEast()].map(ll => { const p = Geo.convertDatum(ll.lat, ll.lng, 'WGS84', m.datum); return Geo.project(c, p.lat, p.lon); });
      const Es = corners.map(u => u.E), Ns = corners.map(u => u.N);
      const e0 = Math.floor(Math.min(...Es) / 1000) * 1000, e1 = Math.ceil(Math.max(...Es) / 1000) * 1000;
      const n0 = Math.floor(Math.min(...Ns) / 1000) * 1000, n1 = Math.ceil(Math.max(...Ns) / 1000) * 1000;
      if ((e1 - e0) / 1000 > 40 || (n1 - n0) / 1000 > 40) return;
      const off = c.baseE % 1000, offN = c.baseN % 1000; // 'origin' mode grids may not sit on whole km
      const ll = (E, N) => { const p = Geo.unproject(c, E, N); const w = Geo.convertDatum(p.lat, p.lon, m.datum, 'WGS84'); return [w.lat, w.lon]; };
      const style = { color: getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#4B5320', weight: 1, opacity: .7, interactive: false };
      for (let E = e0 + off; E <= e1; E += 1000) {
        L.polyline([ll(E, n0), ll(E, (n0 + n1) / 2), ll(E, n1)], style).addTo(gridLayer);
        const lab = String(Math.round(((E - c.baseE) % 100000 + 100000) % 100000 / 1000)).padStart(2, '0');
        L.marker(ll(E, n0 + (n1 - n0) * 0.08), { interactive: false, icon: L.divIcon({ className: '', html: `<span style="font:700 12px var(--cond);color:${style.color};background:rgba(255,255,255,.75);padding:0 2px">${lab}</span>`, iconAnchor: [-2, 8] }) }).addTo(gridLayer);
      }
      for (let N = n0 + offN; N <= n1; N += 1000) {
        L.polyline([ll(e0, N), ll((e0 + e1) / 2, N), ll(e1, N)], style).addTo(gridLayer);
        const lab = String(Math.round(((N - c.baseN) % 100000 + 100000) % 100000 / 1000)).padStart(2, '0');
        L.marker(ll(e0 + (e1 - e0) * 0.04, N), { interactive: false, icon: L.divIcon({ className: '', html: `<span style="font:700 12px var(--cond);color:${style.color};background:rgba(255,255,255,.75);padding:0 2px">${lab}</span>`, iconAnchor: [0, 14] }) }).addTo(gridLayer);
      }
    }
    function flag(r, quiet) {
      if (!map) return; flagLayer.clearLayers();
      const mk = L.circleMarker([r.wgsLat, r.wgsLon], { radius: 9, color: '#D9681C', weight: 3, fillOpacity: .25 }).addTo(flagLayer);
      mk.bindTooltip(`GR ${esc(r.gg.grid6)}`, { permanent: true, className: 'tip', direction: 'right', offset: [10, 0] });
      if (!quiet || !map.getBounds().contains([r.wgsLat, r.wgsLon])) map.setView([r.wgsLat, r.wgsLon], Math.max(map.getZoom(), 14));
    }
    function focus(p) { if (!map) return; const w = wgsOf(p); map.setView([w.lat, w.lon], 15); }
    function resize() { if (map) map.invalidateSize(); }
    function me() {
      gps(pos => {
        if (!map) return;
        flagLayer.clearLayers();
        L.circle([pos.lat, pos.lon], { radius: pos.acc, color: '#4B5320', weight: 1, fillOpacity: .1 }).addTo(flagLayer);
        L.circleMarker([pos.lat, pos.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#4B5320', fillOpacity: 1 }).addTo(flagLayer);
        map.setView([pos.lat, pos.lon], 15);
        const m = activeMap(); if (m) { const g = Geo.geoToGrid(pos.lat, pos.lon, m, 'WGS84', cal(m)); toast(`You are at GR ${g.grid8} (±${Math.round(pos.acc)} m)`); }
      });
    }
    return { init, redraw, fitPoints, flag, focus, resize, me };
  })();
  $('#locBtn').onclick = () => MapUI.me();

  /* ================================================================
     ACCOUNT, THEME, STARTUP
     ================================================================ */
  $('#themeBtn').onclick = () => {
    const night = document.documentElement.dataset.theme !== 'night';
    document.documentElement.dataset.theme = night ? 'night' : '';
    lsSet('gridnav:theme', night ? 'night' : ''); try { localStorage.setItem('gridnav:theme', night ? 'night' : ''); } catch (e) {}
    toast(night ? 'Night mode' : 'Day mode'); MapUI.redraw();
  };
  const fmtWhen = t => t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never';
  function backupName() { const d = new Date(), z = n => String(n).padStart(2, '0'); return `GridNav-backup-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`; }
  $('#acctBtn').onclick = () => {
    const n = c => Store.list(c).length;
    openSheet(`<div class="sheet-head"><h3>Your data</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="small muted">Everything is saved <b>on this phone only</b> — no account, no internet needed.</p>
      <div class="stats" style="margin-top:12px"><div class="stat"><b>${n('maps')}</b><span>maps</span></div><div class="stat"><b>${n('points')}</b><span>points</span></div><div class="stat"><b>${n('exercises')}</b><span>exercises</span></div></div>
      <div class="callout ${Store.changesSinceBackup() > 0 ? 'warn' : 'good'}" style="margin-top:12px">Last backup: <b>${fmtWhen(Store.lastBackup())}</b>${Store.changesSinceBackup() > 0 ? ` · ${Store.changesSinceBackup()} change(s) since then` : ''}.<br>If the phone is lost or the app is uninstalled, only a backup file can bring your work back.</div>
      <div class="stack" style="margin-top:14px">
        <button class="btn primary block" id="bkShare">${icon('share')} Share backup (WhatsApp, email, Drive…)</button>
        <button class="btn block" id="bkSave">${icon('save')} Save backup on this phone</button>
        <label class="btn block">Restore from a backup file<input type="file" id="bkImp" accept=".json,application/json,text/plain" hidden></label>
      </div>
      <p class="tiny" style="margin-top:10px">Restoring adds the backup's maps, points and exercises to this phone. Items that already exist are replaced by the backup copy.</p>`, box => {
      const json = () => JSON.stringify(Store.exportData(), null, 1);
      $('#bkShare', box).onclick = async () => { try { const r = await Native.shareFile(backupName(), json(), 'application/json', 'GridNav backup'); if (r !== 'cancelled') { Store.markBackup(); closeSheet(); toast(r === 'downloaded' ? 'Backup saved to Downloads' : 'Backup shared'); } } catch (e) { toast('Could not share: ' + e.message, true); } };
      $('#bkSave', box).onclick = async () => { try { const where = await Native.saveFile(backupName(), json(), 'application/json'); Store.markBackup(); closeSheet(); toast('Backup saved: ' + where); } catch (e) { toast('Could not save: ' + e.message, true); } };
      $('#bkImp', box).onchange = async e => {
        try {
          const d = JSON.parse(await e.target.files[0].text());
          const r = await Store.importData(d);
          closeSheet(); toast(`Restored ${r.maps} maps, ${r.points} points, ${r.exercises} exercises`);
          if (!activeMap()) setMap(maps()[0]?.id); render(); MapUI.redraw(true);
        } catch (err) { toast('Restore failed: ' + err.message, true); }
      };
    });
  };
  function backupReminder() {
    const days = (Date.now() - Store.lastBackup()) / 864e5;
    if (Store.changesSinceBackup() >= 15 && days > 1) setTimeout(() => toast('Tip: save a backup of your work (button at the top right)'), 3500);
  }

  let mapInit = false;
  function start() {
    if (!mapInit) { MapUI.init(); mapInit = true; }
    const savedMap = lsGet(prefKey('map'), null);
    setMap(Store.get('maps', savedMap) ? savedMap : maps()[0]?.id || null);
    const v = lsGet(prefKey('view'), null);
    go(!S.mapId ? 'maps' : ['maps', 'convert', 'points', 'exercise', 'control'].includes(v) ? v : 'convert');
    MapUI.redraw(true);
  }

  (async function boot() { await Store.init(); start(); })();

  // Offline support for the web version. The APK already contains everything, so it needs no service worker.
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !Native.isApp()) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.GridNavDebug = { S, Store, MapUI };
})();
