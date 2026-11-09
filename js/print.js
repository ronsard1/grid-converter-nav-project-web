/* ==================================================================
   print.js — printed papers for the exercise
   1. Leader summary         (unit "check points summary" layout + register)
   2. Syndicate slips        (one page per syndicate: start + every CP, cut and place)
   2b. Slips by checkpoint   (same slips grouped per place: one envelope per CP)
   3. Syndicate cards        (each syndicate carries one; logs arrival times)
   4. Control board snapshot (who is where, who is next)
   5. Operations: leader summary + one order per platoon
   Every function returns { html, landscape }.
   ================================================================== */
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const km = m => (m / 1000).toFixed(1);

  const BASE = `
  <style>
    .pp, .pp * { box-sizing:border-box; margin:0; }
    .pp { font: 10.5pt/1.35 Arial, Helvetica, sans-serif; color:#000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pp .page { page-break-after: always; break-after: page; }
    .pp .page:last-child { page-break-after: auto; break-after: auto; }
    .pp .sec { text-align:center; font-weight:700; letter-spacing:1pt; font-size:10pt; }
    .pp .hdr { display:flex; justify-content:space-between; align-items:flex-start; margin:4pt 0 8pt; }
    .pp .hdr .r { text-align:right; font-size:9.5pt; }
    .pp h1 { font-size:14pt; text-align:center; margin:4pt 0 2pt; text-transform:uppercase; }
    .pp .sub { text-align:center; font-size:10pt; margin-bottom:8pt; }
    .pp table { width:100%; border-collapse:collapse; }
    .pp th, .pp td { border:0.75pt solid #000; padding:3pt 4pt; vertical-align:top; }
    .pp th { background:#e6e6e6; font-size:8.5pt; text-transform:uppercase; }
    .pp .g { font-family:'Courier New', monospace; font-weight:700; letter-spacing:.5pt; white-space:nowrap; }
    .pp .c { text-align:center; }
    .pp .r { text-align:right; }
    .pp .pc .n { font-weight:700; }
    .pp .pc .nm { display:block; font-size:7.5pt; }
    .pp .pc .code { float:right; font-size:7.5pt; border:0.75pt solid #000; padding:0 2pt; }
    .pp .sign { display:flex; justify-content:space-between; margin-top:16pt; font-size:10pt; }
    .pp h2 { font-size:11pt; margin:12pt 0 4pt; text-transform:uppercase; }
    .pp .small { font-size:8.5pt; }
    /* slips */
    .pp .slips { display:grid; grid-template-columns:1fr 1fr; gap:0; }
    .pp .slips.s4 { grid-auto-rows: 136mm; }
    .pp .slips.s6 { grid-auto-rows: 90mm; }
    .pp .slip { border:1pt dashed #000; padding:8pt 10pt; display:flex; flex-direction:column; overflow:hidden; }
    .pp .slip .top { display:flex; justify-content:space-between; font-size:9pt; font-weight:700; border-bottom:1pt solid #000; padding-bottom:3pt; text-transform:uppercase; }
    .pp .slip .mid { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; gap:6pt; }
    .pp .slip .syn { font-size:22pt; font-weight:700; }
    .pp .slip .msg { font-size:11pt; max-width:90%; }
    .pp .slip .big { font-family:'Courier New', monospace; font-weight:700; font-size:30pt; letter-spacing:3pt; border-top:2pt solid #000; border-bottom:2pt solid #000; padding:4pt 10pt; }
    .pp .slips.s6 .big { font-size:24pt; } .pp .slips.s6 .syn { font-size:18pt; }
    .pp .slip .codebox { font-size:10pt; } .pp .slip .codebox b { font-family:'Courier New', monospace; font-size:16pt; border:1.5pt solid #000; padding:0 6pt; }
    .pp .slip .bot { font-size:8pt; text-align:center; border-top:0.75pt solid #000; padding-top:3pt; }
    .pp .slip.cover { border:2pt solid #000; background:#f0f0f0; }
    .pp .slip.cover .syn { font-size:16pt; }
    .pp .slip.end { border-style:solid; }
    /* leader summary (unit format) */
    .pp .sum { font-family:'Times New Roman', Times, serif; font-size:10.5pt; }
    .pp .secm { text-align:center; font-family:'Times New Roman', Times, serif; font-size:11pt; letter-spacing:.5pt; }
    .pp .rblock { margin:10pt 0 6pt auto; width:max-content; font-family:'Times New Roman', Times, serif; font-weight:700; font-size:10.5pt; line-height:1.9; }
    .pp .rblock div { text-decoration:underline; }
    .pp h1.sumt { font-family:'Times New Roman', Times, serif; font-size:11.5pt; text-transform:none; margin:4pt 0 8pt; }
    .pp .sumtab th { background:none; font-family:'Times New Roman', Times, serif; font-size:10pt; font-weight:400; text-transform:none; }
    .pp .sumtab td { font-family:'Times New Roman', Times, serif; font-size:10pt; line-height:1.15; padding:2pt 4pt; }
    .pp .sumtab tr { page-break-inside:avoid; }
    .pp .nw { white-space:nowrap; }
    /* per-syndicate slips: 8 per page */
    .pp .slhead { height:9mm; overflow:hidden; display:flex; justify-content:space-between; align-items:baseline; gap:10pt; border-bottom:1.5pt solid #000; padding-bottom:3pt; margin-bottom:3mm; font-size:9pt; }
    .pp .slhead b { font-size:14pt; white-space:nowrap; }
    .pp .slips.s8 { grid-auto-rows: 62mm; }
    .pp .slips.s8 .big { font-size:22pt; letter-spacing:1.5pt; padding:2pt 8pt; }
    .pp .slips.s8 .msg { font-size:10.5pt; }
    .pp .slips.s8 .codebox b { font-size:12pt; }
    .pp .slips.s10 .big { font-size:18pt; padding:1pt 6pt; } .pp .slips.s10 .msg { font-size:9pt; } .pp .slips.s10 .slip { padding:5pt 8pt; }
    .pp .slips.s14 .big { font-size:14pt; padding:0 4pt; border-width:1pt; } .pp .slips.s14 .msg { font-size:7.5pt; } .pp .slips.s14 .slip { padding:3pt 6pt; }
    .pp .slips.s14 .top, .pp .slips.s14 .bot, .pp .slips.s14 .lbl { font-size:6.5pt; } .pp .slips.s14 .codebox b { font-size:9pt; } .pp .slips.s14 .mid { gap:2pt; }
    .pp .slip .lbl { font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:.5pt; }
    /* syndicate strips: one column */
    .pp .strips { display:grid; grid-template-columns:1fr; }
    .pp .strip { display:grid; grid-template-columns: 30mm 1fr 62mm; align-items:center; gap:4mm; border-bottom:1pt dashed #000; padding:0 3mm; overflow:hidden; }
    .pp .strips .strip:first-child { border-top:1pt dashed #000; }
    .pp .s-syn { font-weight:700; font-size:12pt; line-height:1.15; }
    .pp .s-cp { display:block; font-size:10.5pt; font-weight:700; border:1.2pt solid #000; padding:0 4pt; margin-top:2pt; width:max-content; }
    .pp .st-s .s-cp { font-size:8.5pt; }
    .pp .s-syn small { display:block; font-weight:400; font-size:7.5pt; margin-top:2pt; }
    .pp .s-msg { font-size:10.5pt; line-height:1.25; }
    .pp .s-gr { text-align:center; border-left:1.5pt solid #000; padding-left:3mm; }
    .pp .s-gr span { display:block; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:.6pt; }
    .pp .s-gr b { font-family:'Courier New', monospace; font-size:20pt; letter-spacing:1pt; white-space:nowrap; }
    .pp .strip.end .s-gr b { text-decoration: underline; }
    .pp .st-m .s-gr b { font-size:16pt; } .pp .st-m .s-msg { font-size:9.5pt; } .pp .st-m .s-syn { font-size:11pt; }
    .pp .st-s .s-gr b { font-size:13pt; } .pp .st-s .s-msg { font-size:8pt; } .pp .st-s .s-syn { font-size:9.5pt; } .pp .st-s .s-gr span, .pp .st-s .s-syn small { font-size:6.5pt; }
    /* route sketches — fixed colours so they print the same inside Android's print service */
    .pp .rmap { font-family: Arial, sans-serif; }
    .pp .rmap .gl { stroke:#1E56A0; stroke-opacity:.3; stroke-width:1; }
    .pp .rmap .gt { fill:#1E56A0; font-size:15px; font-weight:700; }
    .pp .rmap .rt { fill:none; stroke-linejoin:round; stroke-linecap:round; }
    .pp .rmap .cpm { fill:#4B5320; stroke:#fff; stroke-width:3; }
    .pp .rmap .ixm { fill:#D9681C; stroke:#fff; stroke-width:3; }
    .pp .rmap .pn { fill:#fff; font-size:16px; font-weight:700; }
    .pp .rmap .nm { fill:#333; font-size:14px; paint-order:stroke; stroke:#fff; stroke-width:4px; }
    .pp .rmap .lk { fill:#000; font-size:16px; font-weight:700; paint-order:stroke; stroke:#fff; stroke-width:5px; }
    .pp .skall svg { width:100%; height:auto; max-height:235mm; }
    .pp .skgrid { display:grid; grid-template-columns:1fr 1fr; gap:4mm; }
    .pp .skcell { border:1pt solid #000; padding:4pt; height:133mm; overflow:hidden; display:flex; flex-direction:column; }
    .pp .skcell svg { width:100%; height:auto; max-height:100mm; flex:none; }
    .pp .skhd { display:flex; justify-content:space-between; font-size:12pt; border-bottom:1pt solid #000; margin-bottom:3pt; }
    .pp .sklegs { font-size:7.5pt; line-height:1.35; margin-top:3pt; }
    /* cards */
    .pp .pcard { height:128mm; border:1.5pt solid #000; padding:8pt 10pt; margin-bottom:6mm; overflow:hidden; }
    .pp .pcard td { height:20pt; }
    .pp .pcard:last-child { margin-bottom:0; }
    /* board */
    .pp td.now { background:#000; color:#fff; font-weight:700; outline:2.5pt solid #000; outline-offset:-2.5pt; } .pp td.now .g { color:#fff; }
    .pp .done { background:#e6e6e6; }
  </style>`;

  function header(ex) {
    return `<div class="sec">${esc(ex.security || '')}</div>
      <div class="hdr"><div></div><div class="r">${ex.annex ? esc(ex.annex) + '<br>' : ''}${esc(ex.title || '')}${ex.date ? '<br>Dated ' + esc(ex.date) : ''}</div></div>`;
  }
  const footer = ex => `<div class="sec" style="margin-top:10pt">${esc(ex.security || '')}</div>`;

  /* Fill {syn} {cp} {total} {home} in slip messages. */
  function fill(msg, v) { return String(msg || '').replace(/\{(syn|cp|total|home)\}/g, (_, k) => v[k] ?? ''); }
  const kmShort = m => { const v = (m / 1000).toFixed(1); return v.endsWith('.0') ? v.slice(0, -2) : v; };

  /* Leader's paper — same layout as the unit's "Check points summary". */
  function master(ctx) {
    const { ex, routes, idx, pts, grid } = ctx;
    const M = Math.max(...routes.map(r => r.stops.length));
    const place = p => p ? `${esc(p.name)}<br><span class="nw">GR ${esc(grid(p))}</span>` : '';
    const annexLines = String(ex.annex || '').split(/\n|\s\/\s/).map(x => x.trim()).filter(Boolean);
    const rightBlock = [...annexLines, ex.title, ex.date ? 'DATED ' + ex.date : ''].filter(Boolean)
      .map(l => `<div>${esc(String(l).toUpperCase())}</div>`).join('');
    const rows = routes.map(r => `<tr>
        <td class="c">${r.synd}</td>
        <td>${place(idx)}</td>
        ${Array.from({ length: M }, (_, i) => `<td>${place(pts[r.stops[i]])}</td>`).join('')}
        <td>End Ex<br><span class="nw">GR ${esc(grid(idx))}</span></td>
        <td class="c">${kmShort(r.length)}</td></tr>`).join('');
    const coy = ex.coy ? ` FOR &ldquo;${esc(String(ex.coy).toUpperCase())}&rdquo; COY` : '';
    // second page: where every checkpoint is and who goes there (for placing slips)
    const visits = {};
    routes.forEach(r => r.stops.forEach((id, i) => (visits[id] = visits[id] || []).push(`${r.synd}<sub>${i + 1}</sub>`)));
    const reg = ctx.poolPoints.map(p => `<tr><td class="c">${p.no}</td><td>${esc(p.name)}</td><td>GR ${esc(grid(p))}</td>
      <td>${esc(ctx.latlon(p))}</td><td class="c">${(visits[p.id] || []).length}</td><td>${(visits[p.id] || []).join(', ') || '—'}</td></tr>`).join('');
    const html = `<div class="page sum">
      <div class="secm">${esc(ex.security || '')}</div>
      <div class="rblock">${rightBlock}</div>
      <h1 class="sumt">CHECK POINTS SUMMARY${coy}</h1>
      <table class="sumtab"><thead><tr><th style="width:24pt">S/N</th><th>SP</th>${Array.from({ length: M }, (_, i) => `<th>CP ${i + 1}</th>`).join('')}<th>CP ${M + 1}</th><th style="width:30pt">KM</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="secm" style="margin-top:14pt">${esc(ex.security || '')}</div></div>
      <div class="page sum">
      <div class="secm">${esc(ex.security || '')}</div>
      <div class="rblock">${rightBlock}</div>
      <h1 class="sumt">CHECK POINTS REGISTER${coy}</h1>
      <p class="small" style="text-align:center;margin-bottom:6pt">Where each checkpoint is and which syndicates pass there (small number = which CP it is for that syndicate).</p>
      <table class="sumtab"><thead><tr><th style="width:24pt">No</th><th>Place</th><th>Grid</th><th>Lat / Lon</th><th style="width:34pt">Synds</th><th>Syndicates</th></tr></thead><tbody>${reg}</tbody></table>
      <div class="sign"><span>Prepared by: ______________________</span><span>Checked by: ______________________</span></div>
      <div class="secm" style="margin-top:14pt">${esc(ex.security || '')}</div></div>`;
    return { html: BASE + `<div class="pp">${html}</div>`, landscape: true };
  }

  /* Each syndicate gets its own page of slips: start slip, one slip per checkpoint (cut and place). */
  /* Each syndicate: ONE page, ONE column of strips (start, every checkpoint, home). Cut across. */
  function syndSlips(ctx) {
    const { ex, routes, idx, pts, grid } = ctx;
    const pages = [];
    routes.forEach(r => {
      const n = r.stops.length;
      const v = { syn: r.synd, total: n, home: idx.name };
      const strip = (msg, label, gr, foot, cls = '', where = '') => `<div class="strip ${cls}">
          <div class="s-syn">Syndicate ${r.synd}${where ? `<span class="s-cp">${where}</span>` : ''}<small>${foot}</small></div>
          <div class="s-msg">${esc(msg)}</div>
          <div class="s-gr"><span>${label}</span><b>GR ${esc(gr)}</b></div></div>`;
      const items = [strip(fill(ex.startMsg, { ...v, cp: 0 }), 'Your mission', grid(pts[r.stops[0]]), esc(idx.name), '', 'Start')];
      r.stops.forEach((id, i) => {
        const last = i === n - 1, here = pts[id], next = last ? idx : pts[r.stops[i + 1]];
        items.push(strip(fill(last ? ex.endMsg : ex.slipMsg, { ...v, cp: i + 1 }), last ? 'Return home' : 'Next mission', grid(next),
          `Place at: ${esc(here.name)}`, last ? 'end' : '', `Checkpoint ${i + 1}`));
      });
      const rowH = Math.min(32, Math.floor(248 / items.length));
      const size = rowH >= 30 ? 'st-l' : rowH >= 22 ? 'st-m' : 'st-s';
      pages.push(`<div class="page"><div class="slhead"><b>${ex.coy ? esc(ex.coy) + ' Coy — ' : ''}Syndicate ${r.synd}</b>
          <span>${esc(ex.title || '')} · cut along the dashed lines</span></div>
          <div class="strips ${size}" style="grid-auto-rows:${rowH}mm">${items.join('')}</div></div>`);
    });
    return { html: BASE + `<div class="pp">${pages.join('')}</div>`, landscape: false };
  }

  function slips(ctx, perPage = 4) {
    const { ex, routes, idx, pts, grid } = ctx;
    const items = [];
    const slip = (top, inner, cls = '') => `<div class="slip ${cls}"><div class="top">${top}</div><div class="mid">${inner}</div><div class="bot">${esc(ex.title || '')} · Take only your syndicate's slip</div></div>`;
    // Index: start slips
    items.push(slip(`<span>Envelope</span><span>Start point</span>`,
      `<div class="syn">${esc(idx.name)}</div><div class="g">GR ${esc(grid(idx))}</div><div class="msg">Start slips for syndicates ${routes.map(r => r.synd).join(', ')}</div>`, 'cover'));
    routes.forEach(r => {
      const first = pts[r.stops[0]];
      items.push(slip(`<span>${ex.coy ? esc(ex.coy) + ' Coy · ' : ''}Synd ${r.synd}</span><span>Start</span>`,
        `<div class="syn">Syndicate ${r.synd}</div><div class="msg">${esc(fill(ex.startMsg, { syn: r.synd, cp: 0, total: r.stops.length, home: idx.name }))}</div><div class="lbl">Your mission</div><div class="big">${esc(grid(first))}</div>`));
    });
    // Each checkpoint
    ctx.poolPoints.forEach(p => {
      const here = [];
      routes.forEach(r => r.stops.forEach((id, i) => { if (id === p.id) here.push({ r, i, at: r.cum[i] }); }));
      if (!here.length) return;
      here.sort((a, b) => a.at - b.at);
      items.push(slip(`<span>Envelope</span><span>CP ${p.no}</span>`,
        `<div class="syn">CP ${p.no} · ${esc(p.name)}</div><div class="g">GR ${esc(grid(p))}</div>
         <div class="msg">${here.length} slip${here.length > 1 ? 's' : ''}, in expected arrival order:<br><b>Synd ${here.map(h => h.r.synd).join(', ')}</b></div>`, 'cover'));
      here.forEach(({ r, i }) => {
        const last = i === r.stops.length - 1;
        const next = last ? idx : pts[r.stops[i + 1]];
        items.push(slip(`<span>Synd ${r.synd}</span><span>${esc(p.name)}</span>`,
          `<div class="syn">Syndicate ${r.synd}</div>
           <div class="msg">${esc(fill(last ? ex.endMsg : ex.slipMsg, { syn: r.synd, cp: i + 1, total: r.stops.length, home: idx.name }))}</div>
           <div class="lbl">${last ? 'Return home — ' + esc(idx.name) : 'Next mission'}</div>
           <div class="big">${esc(grid(next))}</div>`, last ? 'end' : ''));
      });
    });
    const pages = [];
    for (let i = 0; i < items.length; i += perPage) pages.push(`<div class="page"><div class="slips s${perPage}">${items.slice(i, i + perPage).join('')}</div></div>`);
    return { html: BASE + `<div class="pp">${pages.join('')}</div>`, landscape: false, count: items.length };
  }

  /* Route maps: page 1 = all routes; then 4 syndicates per page, each with its own sketch and legs. */
  function sketches(ctx) {
    const { ex, routes, idx, pts, grid } = ctx;
    const pages = [`<div class="page sum"><div class="secm">${esc(ex.security || '')}</div>
      <h1 class="sumt">ROUTES OF ALL SYNDICATES${ex.coy ? ` — &ldquo;${esc(String(ex.coy).toUpperCase())}&rdquo; COY` : ''}</h1>
      <div class="skall">${ctx.svg(null, { names: true, width: 1400, font: 16 })}</div>
      <p class="small" style="text-align:center">IX = ${esc(idx.name)} (GR ${esc(grid(idx))}). Numbers = checkpoints. Each colour = one syndicate. Grid numbers = map grid (km).</p>
      <div class="secm">${esc(ex.security || '')}</div></div>`];
    for (let i = 0; i < routes.length; i += 4) {
      pages.push(`<div class="page"><div class="skgrid">${routes.slice(i, i + 4).map(r => {
        const seq = [idx, ...r.stops.map(id => pts[id]), idx];
        return `<div class="skcell"><div class="skhd"><b>Syndicate ${r.synd}</b><span>${kmShort(r.length)} km</span></div>
          ${ctx.svg(r.synd, { width: 700, font: 18, only: true, names: true })}
          <div class="sklegs">${seq.slice(1).map((p, k) => `${k + 1}. ${k === seq.length - 2 ? 'Home' : 'CP ' + p.no} <span class="g">${esc(grid(p))}</span> ${(ctx.legKm(seq[k], p)).toFixed(1)} km`).join(' · ')}</div></div>`;
      }).join('')}</div></div>`);
    }
    return { html: BASE + `<div class="pp">${pages.join('')}</div>`, landscape: false };
  }

  function cards(ctx, reveal = false) {
    const { ex, routes, idx, pts, grid } = ctx;
    const one = r => {
      const first = pts[r.stops[0]];
      const rows = r.stops.map((id, i) => `<tr><td class="c"><b>${i + 1}</b></td><td class="g c">${reveal || i === 0 ? esc(grid(pts[id])) : ''}</td><td></td><td></td></tr>`).join('');
      return `<div class="pcard">
        <div class="sec">${esc(ex.security || '')}</div>
        <h1>Syndicate ${r.synd} — route card</h1>
        <div class="sub">${esc(ex.title || '')}${ex.coy ? ' · ' + esc(ex.coy) + ' Coy' : ''}${ex.date ? ' · ' + esc(ex.date) : ''}</div>
        <table style="margin-bottom:6pt"><tr><td><b>Start:</b> ${esc(idx.name)} <span class="g">GR ${esc(grid(idx))}</span></td><td><b>First checkpoint:</b> <span class="g">GR ${esc(grid(first))}</span></td><td><b>Leader:</b></td></tr></table>
        <table><thead><tr><th style="width:34pt">Stage</th><th style="width:90pt">Grid ${reveal ? '' : 'received'}</th><th style="width:60pt">Time in</th><th>Remarks</th></tr></thead>
        <tbody>${rows}<tr><td class="c"><b>Finish</b></td><td class="g c">${esc(grid(idx))}</td><td></td><td></td></tr></tbody></table>
        <p class="small" style="margin-top:6pt">At each checkpoint take only the slip marked Syndicate ${r.synd}. Write the time you arrive. ${reveal ? '' : 'The slip gives your next mission.'}</p>
      </div>`;
    };
    const pages = [];
    for (let i = 0; i < routes.length; i += 2) pages.push(`<div class="page">${routes.slice(i, i + 2).map(one).join('')}</div>`);
    return { html: BASE + `<div class="pp">${pages.join('')}</div>`, landscape: false };
  }

  function board(ctx) {
    const { ex, routes, idx, pts, grid, progress } = ctx;
    const M = Math.max(...routes.map(r => r.stops.length));
    const t = ts => ts ? new Date(ts).toTimeString().slice(0, 5) : '';
    const rows = routes.map(r => {
      const log = progress[r.synd] || [];
      const cells = Array.from({ length: M }, (_, i) => {
        const p = pts[r.stops[i]]; const done = log[i]; const now = !done && log.length === i;
        return `<td class="c ${done ? 'done' : now ? 'now' : ''}">CP ${p?.no ?? ''}<br><span class="g">${esc(grid(p))}</span><br>${done ? '✓ ' + t(done) : now ? '▶ NEXT' : '&nbsp;'}</td>`;
      }).join('');
      const fin = log[r.stops.length]; const now = !fin && log.length === r.stops.length;
      return `<tr><td class="c"><b>${r.synd}</b></td>${cells}<td class="c ${fin ? 'done' : now ? 'now' : ''}">Index<br>${fin ? '✓ ' + t(fin) : now ? '▶ NEXT' : ''}</td></tr>`;
    }).join('');
    const html = `<div class="page">${header(ex)}<h1>Control board${ex.coy ? ' — ' + esc(ex.coy) + ' Coy' : ''}</h1>
      <div class="sub">Printed ${new Date().toLocaleString()} · black = next move · grey = reached (time)</div>
      <table><thead><tr><th style="width:26pt">Synd</th>${Array.from({ length: M }, (_, i) => `<th>Stage ${i + 1}</th>`).join('')}<th>Finish</th></tr></thead><tbody>${rows}</tbody></table>
      ${footer(ex)}</div>`;
    return { html: BASE + `<div class="pp">${html}</div>`, landscape: true };
  }


  /* ---------- operations exercise ---------- */
  const OPS_CSS = `<style>
    .pp .ord { font-family:'Times New Roman', Times, serif; font-size:12pt; display:flex; flex-direction:column; }
    .pp .ord.half { height:132mm; overflow:hidden; border-bottom:1pt dashed #000; padding-bottom:4mm; margin-bottom:4mm; }
    .pp .ord.half:last-child { border-bottom:none; }
    .pp .ord .who { text-align:center; margin:6pt 0 2pt; font-size:20pt; font-weight:700; letter-spacing:1pt; }
    .pp .ord .who small { display:block; font-size:12pt; font-weight:400; letter-spacing:.5pt; }
    .pp .ord .opn { text-align:center; font-size:15pt; font-weight:700; text-transform:uppercase; border:1.5pt solid #000; padding:3pt 10pt; width:max-content; margin:6pt auto 10pt; }
    .pp .ord h2 { font-family:'Times New Roman', Times, serif; font-size:12pt; text-decoration:underline; margin:4pt 0 3pt; }
    .pp .ord .msg { font-size:13pt; line-height:1.45; margin-bottom:10pt; }
    .pp .ord .otab th { width:34%; text-align:left; background:#eee; font-family:'Times New Roman', Times, serif; font-size:11pt; text-transform:none; }
    .pp .ord .otab td { font-size:12pt; }
    .pp .ord .gbig { font-family:'Courier New', monospace; font-weight:700; font-size:20pt; letter-spacing:2pt; }
    .pp .ord.half .who { font-size:16pt; } .pp .ord.half .msg { font-size:11.5pt; margin-bottom:6pt; } .pp .ord.half .gbig { font-size:16pt; }
    .pp .ord .fill { flex:1; }
  </style>`;
  function opHead(ex) {
    const lines = String(ex.annex || '').split(/\n|\s\/\s/).map(x => x.trim()).filter(Boolean);
    const right = [...lines, ex.title, ex.intake, ex.date ? 'DATED ' + ex.date : ''].filter(Boolean).map(l => `<div>${esc(String(l).toUpperCase())}</div>`).join('');
    return `<div class="secm">${esc(ex.security || '')}</div><div class="rblock">${right}</div>`;
  }
  function opSummary(ctx) {
    const { ex, rows } = ctx;
    const body = rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.pl.coy)}</td><td class="c">No ${r.pl.no}</td><td>${esc(r.op.name)}</td>
      <td>${esc(r.p.name)}</td><td class="nw">GR ${esc(r.grid)}</td><td class="nw">${esc(r.latlon)}<br><span class="small">${esc(r.dec)}</span></td><td class="c nw">${esc(ex.time || '')}</td></tr>`).join('');
    const html = `<div class="page sum">${opHead(ex)}
      <h1 class="sumt">OPERATIONS SUMMARY${ex.intake ? ' &mdash; ' + esc(String(ex.intake).toUpperCase()) : ''}</h1>
      <table class="sumtab"><thead><tr><th style="width:24pt">S/N</th><th>COY</th><th>PL</th><th>OPERATION</th><th>PLACE</th><th>GRID</th><th>COORDINATES (WGS84)</th><th>NLT</th></tr></thead><tbody>${body}</tbody></table>
      <p class="small" style="margin-top:6pt">All platoons: not later than ${esc(ex.time || '____')} hrs${ex.date ? ' on ' + esc(ex.date) : ''}.</p>
      <div class="sign"><span>Prepared by: ______________________</span><span>Approved: ______________________</span></div>
      <div class="secm" style="margin-top:14pt">${esc(ex.security || '')}</div></div>`;
    return { html: BASE + OPS_CSS + `<div class="pp">${html}</div>`, landscape: true };
  }
  function opOrders(ctx) {
    const { ex, rows, perPage } = ctx;
    const one = r => `<div class="ord ${perPage === 2 ? 'half' : ''}">${opHead(ex)}
        <div class="who">No ${r.pl.no} PLATOON<small>${esc(String(r.pl.coy).toUpperCase())} COMPANY${ex.intake ? ' &middot; ' + esc(ex.intake) : ''}</small></div>
        <div class="opn">${esc(r.op.name)}</div>
        <h2>MISSION</h2><p class="msg">${esc(r.order)}</p>
        <table class="otab"><tr><th>Place</th><td>${esc(r.p.name)}</td></tr>
          <tr><th>Grid</th><td class="gbig">${esc(r.grid)}</td></tr>
          <tr><th>Coordinates (GPS, WGS84)</th><td>${esc(r.latlon)}<br><span class="small">${esc(r.dec)}</span></td></tr>
          <tr><th>Not later than</th><td><b>${esc(ex.time || '____')} hrs</b>${ex.date ? ', ' + esc(ex.date) : ''}</td></tr></table>
        <div class="fill"></div>
        <div class="sign"><span>Received by: ____________________</span><span>Commander: ____________________</span></div>
        <div class="secm" style="margin-top:6pt">${esc(ex.security || '')}</div></div>`;
    const pages = [];
    for (let i = 0; i < rows.length; i += perPage) pages.push(`<div class="page">${rows.slice(i, i + perPage).map(one).join('')}</div>`);
    return { html: BASE + OPS_CSS + `<div class="pp">${pages.join('')}</div>`, landscape: false };
  }

  root.PrintDocs = { master, syndSlips, slips, sketches, cards, board, opSummary, opOrders };
})(window);
