/* ==================================================================
   routes.js — syndicate route planner
   ------------------------------------------------------------------
   The problem, in plain words:
   • All syndicates start at the same Index (start point) and return to it.
   • There is a pool of K checkpoints (e.g. 11). Each syndicate visits
     M of them (e.g. 7) in its own order.
   • Every route must be close to the target distance (e.g. 30 km ± 1 km).
   • No two syndicates get exactly the same route.
   • A route should be a LOOP: never walk back along your own track.
   • Syndicates may meet at a checkpoint by chance (speeds differ), but
     must not walk TOGETHER: no two syndicates share two legs in a row.
   • Each press gives a new plan, and routes of earlier exercises on the
     same map are avoided.

   How we solve it:
   1. BUILD many candidate routes: random pick + random order, then
      "repair" by small changes (swap two stops, replace a stop, reverse
      a part) until the length is within tolerance AND the route is a
      clean loop (no retracing, no U-turns).
   2. CHOOSE routes one by one. Each time, pick the candidate with the
      lowest "trouble score" against the routes already chosen.
   ================================================================== */
(function (root) {
  'use strict';

  function rng(seed) { // mulberry32 — small, fast, repeatable
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- route shape (needs map coordinates) ----------
     retrace: how much of the route runs back along an earlier leg of the
              same route in the opposite direction (0 = clean loop; 1 ≈ one
              whole leg walked back over).
     uturns:  number of sharp reversals (next checkpoint almost straight back). */
  const CORRIDOR = 400;        // metres: closer than this = "the same track"
  const UTURN_COS = Math.cos(150 * Math.PI / 180);
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function shapeOf(stops, xy) {
    if (!xy) return { retrace: 0, uturns: 0 };
    const seq = [0, ...stops, 0].map(i => xy[i]);
    const legs = [];
    for (let i = 1; i < seq.length; i++) {
      const [ax, ay] = seq[i - 1], [bx, by] = seq[i];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      legs.push({ ax, ay, bx, by, ux: (bx - ax) / L, uy: (by - ay) / L });
    }
    let retrace = 0, uturns = 0;
    for (let i = 0; i + 1 < legs.length; i++) {
      const a = legs[i], b = legs[i + 1];
      if (a.ux * b.ux + a.uy * b.uy < UTURN_COS) uturns++;
    }
    for (let j = 2; j < legs.length; j++) {
      const b = legs[j];
      for (let i = 0; i <= j - 2; i++) {
        const a = legs[i];
        if (a.ux * b.ux + a.uy * b.uy > -0.5) continue; // not walking back the other way
        let close = 0;
        for (const f of [0.2, 0.4, 0.6, 0.8]) {
          const px = b.ax + (b.bx - b.ax) * f, py = b.ay + (b.by - b.ay) * f;
          if (segDist(px, py, a.ax, a.ay, a.bx, a.by) < CORRIDOR) close++;
        }
        retrace += close / 4;
      }
    }
    return { retrace, uturns };
  }

  /**
   * @param {object} o
   *  dist:      (K+1)x(K+1) matrix in metres; index 0 = Index/start, 1..K = pool checkpoints
   *  xy:        optional [[E,N], …] same order as dist — enables the loop rules
   *  count:     number of syndicates
   *  perRoute:  checkpoints per route (M)
   *  targetM:   target route length in metres
   *  tolM:      accepted error (metres)
   *  seed:      number (same seed → same plan; a new seed → a new plan)
   *  avoid:     optional [[stop, …], …] routes used in earlier exercises (pool numbering)
   */
  function plan(o) {
    const D = o.dist, K = D.length - 1, M = o.perRoute, N = o.count, xy = o.xy || null;
    const T = o.targetM, tol = Math.max(50, o.tolM), meetW = o.meetWindowM || 1500;
    const R = rng(o.seed || 1);
    const warnings = [];
    const empty = msg => ({ routes: [], warnings: [msg], range: { min: 0, max: 0 }, candidates: 0, usage: [] });
    if (K < 1) return empty('Add checkpoints to the pool first.');
    if (M > K) return empty(`Each route needs ${M} checkpoints but the pool has only ${K}.`);

    const len = s => { let t = D[0][s[0]]; for (let i = 1; i < s.length; i++) t += D[s[i - 1]][s[i]]; return t + D[s[s.length - 1]][0]; };
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const all = Array.from({ length: K }, (_, i) => i + 1);
    // repair score: distance first; once the length is close, the loop shape counts too
    const score = s => {
      const e = Math.abs(len(s) - T) / tol;
      if (!xy || e > 2) return { v: e, e, sh: null };
      const sh = shapeOf(s, xy);
      return { v: e + 3 * sh.retrace + 1.5 * sh.uturns, e, sh };
    };

    // ---------- 1. candidates ----------
    const cands = new Map();
    let minL = Infinity, maxL = 0;
    const want = Math.min(4000, Math.max(400, N * 120));
    const maxTries = want * 6;
    const t0 = Date.now();
    for (let tries = 0; tries < maxTries && cands.size < want && Date.now() - t0 < 3000; tries++) {
      let cur = shuffle(all.slice()).slice(0, M), sc = score(cur);
      for (let it = 0; it < 300; it++) {
        if (sc.e <= 0.6 && (!xy || (sc.sh && sc.sh.retrace === 0 && sc.sh.uturns === 0))) break;
        const next = cur.slice(), r = R();
        if (r < 0.4) { // swap two stops
          const i = Math.floor(R() * M), j = Math.floor(R() * M); [next[i], next[j]] = [next[j], next[i]];
        } else if (r < 0.8 && K > M) { // replace a stop with an unused checkpoint
          const unused = all.filter(x => !next.includes(x));
          next[Math.floor(R() * M)] = unused[Math.floor(R() * unused.length)];
        } else { // reverse a segment
          let i = Math.floor(R() * M), j = Math.floor(R() * M); if (i > j) [i, j] = [j, i];
          const seg = next.slice(i, j + 1).reverse(); next.splice(i, seg.length, ...seg);
        }
        const ns = score(next);
        if (ns.v < sc.v || R() < 0.03) { cur = next; sc = ns; }
      }
      const L = len(cur); minL = Math.min(minL, L); maxL = Math.max(maxL, L);
      const key = cur.join('-');
      if (sc.e <= 1) { if (!cands.has(key)) cands.set(key, cur); }
      else if (tries > maxTries / 2 && cands.size < N) { if (!cands.has(key)) cands.set(key, cur); } // last resort
    }
    const pool = [...cands.values()].map(stops => {
      const cum = []; let t = 0, prev = 0;
      for (const s of stops) { t += D[prev][s]; cum.push(t); prev = s; }
      return { stops, length: t + D[prev][0], cum, shape: shapeOf(stops, xy) };
    });
    if (pool.length < N) warnings.push(`Only ${pool.length} different routes fit ${(T / 1000).toFixed(1)} km ± ${(tol / 1000).toFixed(1)} km. Add checkpoints, widen the tolerance, or change the distance.`);
    if (minL > T + tol) warnings.push(`Shortest route found is ${(minL / 1000).toFixed(1)} km — longer than the target. Use closer checkpoints or fewer per route.`);
    if (maxL < T - tol) warnings.push(`Longest route found is ${(maxL / 1000).toFixed(1)} km — shorter than the target. Use farther checkpoints or more per route.`);

    // ---------- 2. selection ----------
    // Trouble score weights (bigger = avoided more strongly)
    const W = {
      err: 3,        // distance away from the target
      retrace: 5,    // walking back along your own track
      uturn: 2,      // sharp reversal
      first: 4,      // same first checkpoint as syndicates already planned (they'd leave together)
      follow: 8,     // same two legs in a row as another syndicate (they'd walk together)
      split: 6,      // at the same checkpoint at about the same time AND going to the same next one
      meet: 0.6,     // meeting at a checkpoint by chance — allowed, small cost
      leg: 0.8,      // sharing one leg (at any time)
      use: 1.5,      // checkpoint used more than its fair share
      same: 0.6,     // exactly the same set of checkpoints as another route
      past: 8,       // identical to a route of an earlier exercise
      pastPart: 0.7  // shares a 3-stop stretch with an earlier exercise's route
    };
    const avoidKeys = new Set((o.avoid || []).map(s => s.join('-')));
    const avoidTriples = new Set();
    (o.avoid || []).forEach(s => { const q = [0, ...s, 0]; for (let i = 0; i + 2 < q.length; i++) avoidTriples.add(q[i] + '>' + q[i + 1] + '>' + q[i + 2]); });

    const firstUse = new Array(K + 1).fill(0);
    const visits = Array.from({ length: K + 1 }, () => []); // {t: walked distance on arrival, next}
    const legs = new Map(), triples = new Map();
    const chosen = [], used = new Set(), visitSets = [];
    const useCount = new Array(K + 1).fill(0);
    const tripleKeys = s => { const q = [0, ...s, 0], out = []; for (let i = 0; i + 2 < q.length; i++) out.push(q[i] + '>' + q[i + 1] + '>' + q[i + 2]); return out; };
    pool.forEach(c => { c.triples = tripleKeys(c.stops); });

    for (let n = 0; n < N && pool.length; n++) {
      let best = null, bestCost = Infinity;
      const avgUse = (n * M) / K + 1e-9;
      for (const c of pool) {
        const key = c.stops.join('-'); if (used.has(key)) continue;
        let cost = W.err * Math.pow(Math.abs(c.length - T) / tol, 2);
        cost += W.retrace * c.shape.retrace + W.uturn * c.shape.uturns;
        cost += W.first * firstUse[c.stops[0]];
        if (n) for (let i = 0; i < M; i++) cost += W.use * Math.max(0, useCount[c.stops[i]] - avgUse) / Math.max(1, avgUse) * 2;
        for (let i = 0; i < M; i++) {
          const here = c.stops[i], next = i + 1 < M ? c.stops[i + 1] : 0;
          for (const v of visits[here]) if (Math.abs(v.t - c.cum[i]) < meetW) cost += v.next === next ? W.split : W.meet;
          const a = i === 0 ? 0 : c.stops[i - 1];
          cost += W.leg * (legs.get(a + '>' + here) || 0);
        }
        for (const tk of c.triples) cost += W.follow * (triples.get(tk) || 0);
        for (const s of visitSets) { let common = 0; for (const x of c.stops) if (s.has(x)) common++; if (common === M) cost += W.same; }
        if (avoidKeys.size) {
          if (avoidKeys.has(key)) cost += W.past;
          for (const tk of c.triples) if (avoidTriples.has(tk)) cost += W.pastPart;
        }
        cost += R() * 0.3; // a little randomness: each press gives a different plan
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      if (!best) break;
      used.add(best.stops.join('-'));
      chosen.push(best);
      firstUse[best.stops[0]]++;
      best.stops.forEach((s, i) => {
        useCount[s]++;
        visits[s].push({ t: best.cum[i], next: i + 1 < M ? best.stops[i + 1] : 0 });
        const a = i === 0 ? 0 : best.stops[i - 1];
        legs.set(a + '>' + s, (legs.get(a + '>' + s) || 0) + 1);
      });
      best.triples.forEach(tk => triples.set(tk, (triples.get(tk) || 0) + 1));
      visitSets.push(new Set(best.stops));
    }
    if (chosen.length < N) warnings.push(`Planned ${chosen.length} of ${N} syndicates — not enough different routes.`);
    const unused = all.filter(x => useCount[x] === 0);
    if (chosen.length && unused.length) warnings.push(`${unused.length} checkpoint(s) are not used by any route — they are too far or too near for this distance.`);
    const notLoops = chosen.filter(c => c.shape.retrace > 0.25).length;
    if (xy && notLoops) warnings.push(`${notLoops} route(s) walk back along part of their own track — the checkpoints don't allow clean loops at this distance. Try ± a little wider or another distance.`);
    return {
      usage: useCount,
      routes: chosen.map(c => ({ stops: c.stops, length: c.length, ok: Math.abs(c.length - T) <= tol, retrace: c.shape.retrace, uturns: c.shape.uturns })),
      warnings, range: { min: minL, max: maxL }, candidates: pool.length
    };
  }

  /** Syndicates that reach the same checkpoint at about the same walked distance. */
  function meetings(routes, dist, meetWindowM = 1500) {
    const at = {};
    routes.forEach((r, ri) => {
      let t = 0, prev = 0;
      r.stops.forEach((s, i) => { t += dist[prev][s]; prev = s; (at[s] = at[s] || []).push({ ri, stage: i + 1, t, next: r.stops[i + 1] || 0 }); });
    });
    const out = [];
    for (const cp in at) {
      const v = at[cp].sort((a, b) => a.t - b.t);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length && v[j].t - v[i].t < meetWindowM; j++)
        out.push({ cp: Number(cp), a: v[i], b: v[j], together: v[i].next === v[j].next });
    }
    return out;
  }

  /** Pairs of syndicates that share two legs in a row (they would walk together). */
  function following(routes) {
    const seen = {}, out = [];
    routes.forEach((r, ri) => {
      const q = [0, ...r.stops, 0];
      for (let i = 0; i + 2 < q.length; i++) {
        const k = q[i] + '>' + q[i + 1] + '>' + q[i + 2];
        (seen[k] = seen[k] || []).forEach(rj => out.push({ a: rj, b: ri, stretch: [q[i], q[i + 1], q[i + 2]] }));
        seen[k].push(ri);
      }
    });
    return out;
  }

  function codes(seed, count, stages) {
    const R = rng((seed ^ 0x5bd1e995) >>> 0);
    const L = 'ACDEFHJKLMNPRTUVWXY', D = '2345679';
    return Array.from({ length: count }, () => Array.from({ length: stages }, () => L[Math.floor(R() * L.length)] + D[Math.floor(R() * D.length)]));
  }

  const Routes = { plan, meetings, following, shapeOf, codes, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = Routes;
  else root.Routes = Routes;
})(typeof window !== 'undefined' ? window : globalThis);
