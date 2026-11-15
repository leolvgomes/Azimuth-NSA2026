/**
 * Planning: 3 profiles (safest, balanced, fastest) with A* on the cost map (one A* per leg when there
 * are via stops), smoothing (Douglas-Peucker that never cuts a blocked cell), sampling and alerts.
 */
import { DEFAULT_LANG, type Lang } from '@/config/i18n';
import { suitConfig } from '@/config/suit';
import { evaluateRoute } from './alerts';
import { returnNeed } from './oxygen';
import { astar } from './astar';
import { buildCostField, getFeatures, type CostFeatures, type ProfileWeights } from './costMap';
import { cellCenter, cellOf, distanceM, distPointSegXY, makeProj, toXY } from './geo';
import { assembleRoute, samplePoints } from './sampling';
import type {
  LatLng, MapData, PlanOptions, Route, RouteProfile, RoutePoint, SuitState, TimeOfDay,
} from './types';

export const PROFILE_WEIGHTS: Record<'safest' | 'balanced' | 'fastest', ProfileWeights> = {
  /** Evita perigo e frio, gosta de terreno plano e da trilha do Perseverance. */
  safest: { wSlope: 2.0, wHazard: 12, wClear: 6, wCold: 3, wHeat: 2, wTrack: 0.4, nodataPenalty: 0.5 },
  balanced: { wSlope: 0.8, wHazard: 3, wClear: 1.5, wCold: 0.8, wHeat: 0.5, wTrack: 0.15, nodataPenalty: 0.2 },
  /** Quase só distância; inclinação > limite e perigos 'avoid' continuam bloqueados. */
  fastest: { wSlope: 0.1, wHazard: 0.2, wClear: 0, wCold: 0, wHeat: 0, wTrack: 0, nodataPenalty: 0 },
};

export const PROFILE_LABEL: Record<Lang, Record<RouteProfile, string>> = {
  en: { safest: 'Safest', balanced: 'Balanced', fastest: 'Fastest', manual: 'Drawn', return: 'Back to shelter' },
  pt: {
    safest: 'Mais segura', balanced: 'Equilibrada', fastest: 'Mais rápida', manual: 'Desenhada',
    return: 'Volta ao abrigo',
  },
};

/** Resolve A* entre dois pontos para um perfil. Retorna as células do caminho. */
export function solveCells(
  f: CostFeatures, w: ProfileWeights, tod: TimeOfDay, from: LatLng, to: LatLng, penalty?: Float32Array,
): number[] {
  const field = buildCostField(f, w, tod, penalty);
  const a = cellOf(f, from.lat, from.lng);
  const b = cellOf(f, to.lat, to.lng);
  const res = astar({
    width: f.width, height: f.height, cellWM: f.cellWM, cellHM: f.cellHM,
    cost: field.cost, minFactor: field.minFactor, start: a.row * f.width + a.col, goal: b.row * f.width + b.col,
  });
  return res.path;
}

/** Células → polilinha suavizada (lat/lng), com os pontos exatos de início e fim. */
export function cellsToPolyline(f: CostFeatures, cells: number[], from: LatLng, to: LatLng): LatLng[] {
  if (cells.length <= 1) return [from, to];
  const xy = cells.map((i) => {
    const c = cellCenter(f, Math.floor(i / f.width), i % f.width);
    return toXY(f.proj, c.lat, c.lng);
  });
  xy[0] = toXY(f.proj, from.lat, from.lng);
  xy[xy.length - 1] = toXY(f.proj, to.lat, to.lng);
  const pathBlocked = cells.map((i) => f.blocked[i]);
  const eps = 0.6 * Math.min(f.cellWM, f.cellHM);
  const keep = new Uint8Array(cells.length);
  keep[0] = 1;
  keep[cells.length - 1] = 1;

  const crossesBlocked = (i: number, j: number) => {
    // a polilinha original de i..j passa por bloqueio? então tudo bem atravessar
    for (let k = i; k <= j; k++) if (pathBlocked[k]) return false;
    const [ax, ay] = xy[i];
    const [bx, by] = xy[j];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(len / (0.4 * Math.min(f.cellWM, f.cellHM)));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const lng = f.proj.lng0 + (ax + (bx - ax) * t) / f.proj.kx;
      const lat = f.proj.lat0 + (ay + (by - ay) * t) / f.proj.ky;
      const c = cellOf(f, lat, lng);
      if (f.blocked[c.row * f.width + c.col]) return true;
    }
    return false;
  };

  const stack: [number, number][] = [[0, cells.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j <= i + 1) continue;
    const [ax, ay] = xy[i];
    const [bx, by] = xy[j];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let best = -1;
    let bestD = -1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((xy[k][0] - ax) * dy - (xy[k][1] - ay) * dx) / L;
      if (d > bestD) { bestD = d; best = k; }
    }
    if (bestD > eps || crossesBlocked(i, j)) {
      const m = bestD > eps ? best : (i + j) >> 1;
      keep[m] = 1;
      stack.push([i, m], [m, j]);
    }
  }
  const out: LatLng[] = [];
  for (let k = 0; k < cells.length; k++) {
    if (!keep[k]) continue;
    const [x, y] = xy[k];
    out.push({ lat: f.proj.lat0 + y / f.proj.ky, lng: f.proj.lng0 + x / f.proj.kx });
  }
  return out;
}

/** Máscara (dilatada por radius células) das células de um caminho. */
function corridorMask(f: CostFeatures, cells: number[], radius: number): Uint8Array {
  const m = new Uint8Array(f.width * f.height);
  for (const i of cells) {
    const r = Math.floor(i / f.width);
    const c = i % f.width;
    for (let dr = -radius; dr <= radius; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= f.height) continue;
      for (let dc = -radius; dc <= radius; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= f.width) continue;
        m[rr * f.width + cc] = 1;
      }
    }
  }
  return m;
}

/** Fração de B que cai no corredor de A (raio ~200 m). */
function overlap(f: CostFeatures, a: number[], b: number[], radCells?: number): number {
  if (!a.length || !b.length) return 1;
  const rad = radCells ?? Math.max(1, Math.round(200 / Math.min(f.cellWM, f.cellHM)));
  const m = corridorMask(f, a, rad);
  let n = 0;
  for (const i of b) if (m[i]) n++;
  return n / b.length;
}

export function similar(f: CostFeatures, a: number[], b: number[]): boolean {
  return Math.min(overlap(f, a, b), overlap(f, b, a)) > 0.85;
}

/** Corridor penalty around paths; never around the waypoints themselves (start, vias, end). */
function penaltyFor(f: CostFeatures, paths: number[][], mult: number, wps: LatLng[] = []): Float32Array {
  const rad = Math.max(2, Math.round(350 / Math.min(f.cellWM, f.cellHM)));
  const p = new Float32Array(f.width * f.height);
  for (const path of paths) {
    const m = corridorMask(f, path, rad);
    for (let i = 0; i < m.length; i++) if (m[i]) p[i] = mult;
  }
  const wr = Math.max(2, Math.round(300 / Math.min(f.cellWM, f.cellHM)));
  const keep = corridorMask(f, wps.map((w) => { const c = cellOf(f, w.lat, w.lng); return c.row * f.width + c.col; }), wr);
  for (let i = 0; i < keep.length; i++) if (keep[i]) p[i] = 0;
  return p;
}

const SAFEST_SCALES = [1, 0.6, 0.35, 0.2];

function scaleWeights(w: ProfileWeights, k: number): ProfileWeights {
  return { ...w, wSlope: w.wSlope * k, wHazard: w.wHazard * k, wClear: w.wClear * k, wCold: w.wCold * k, wHeat: w.wHeat * k };
}

function mixWeights(a: ProfileWeights, b: ProfileWeights, t: number): ProfileWeights {
  const m = (k: keyof ProfileWeights) => a[k] + (b[k] - a[k]) * t;
  return {
    wSlope: m('wSlope'), wHazard: m('wHazard'), wClear: m('wClear'), wCold: m('wCold'), wHeat: m('wHeat'),
    wTrack: m('wTrack'), nodataPenalty: m('nodataPenalty'),
  };
}

/** Comprimento aproximado (m) de um caminho de células. */
function pathLengthM(f: CostFeatures, cells: number[]): number {
  let L = 0;
  for (let k = 1; k < cells.length; k++) {
    const dr = Math.floor(cells[k] / f.width) - Math.floor(cells[k - 1] / f.width);
    const dc = (cells[k] % f.width) - (cells[k - 1] % f.width);
    L += Math.hypot(dr * f.cellHM, dc * f.cellWM);
  }
  return L;
}

/** A path made of legs (one A* per leg: from → via… → to). */
type Legs = number[][];

/** A* for each leg between consecutive waypoints. */
export function solveLegs(
  f: CostFeatures, w: ProfileWeights, tod: TimeOfDay, wps: LatLng[], penalty?: Float32Array,
): Legs {
  const legs: Legs = [];
  for (let i = 1; i < wps.length; i++) legs.push(solveCells(f, w, tod, wps[i - 1], wps[i], penalty));
  return legs;
}

/** Concatenated cells of all legs (junction cells not repeated). */
function flat(legs: Legs): number[] {
  const out: number[] = [];
  for (const leg of legs) {
    for (let k = 0; k < leg.length; k++) {
      if (k === 0 && out.length && out[out.length - 1] === leg[0]) continue;
      out.push(leg[k]);
    }
  }
  return out;
}

/** Smoothed polyline over all legs, passing exactly through every waypoint. */
export function legsToPolyline(f: CostFeatures, legs: Legs, wps: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  legs.forEach((leg, i) => {
    const pl = cellsToPolyline(f, leg, wps[i], wps[i + 1]);
    out.push(...(out.length ? pl.slice(1) : pl));
  });
  return out.length ? out : [...wps];
}

export interface StopSpec {
  via: LatLng[];
  workMin: number[];
  targetIds?: (string | undefined)[];
}

function stopSpec(opts?: PlanOptions): StopSpec | undefined {
  const via = opts?.via ?? [];
  if (!via.length) return undefined;
  return {
    via,
    workMin: via.map((_, i) => Math.max(0, opts?.viaWorkMin?.[i] ?? 0)),
    targetIds: via.map((_, i) => opts?.viaTargetIds?.[i]),
  };
}

/** Index of each via on the sampled points (in order, nearest point after the previous stop). */
function locateStops(points: RoutePoint[], spec: StopSpec): NonNullable<Route['stops']> {
  const stops: NonNullable<Route['stops']> = [];
  let from = 0;
  spec.via.forEach((v, i) => {
    let best = from;
    let bestD = Infinity;
    for (let k = from; k < points.length; k++) {
      const d = distanceM(points[k], v);
      if (d < bestD) { bestD = d; best = k; }
    }
    const s: { index: number; workMin: number; targetId?: string } = { index: best, workMin: spec.workMin[i] ?? 0 };
    const tid = spec.targetIds?.[i];
    if (tid) s.targetId = tid;
    stops.push(s);
    from = best;
  });
  return stops;
}

/** Builds a complete Route (points every ≤ ~50 m, time incl. stops, O₂, alerts) in the given language. */
export function buildRoute(
  latlngs: LatLng[], profile: RouteProfile, data: MapData, suit: SuitState, tod: TimeOfDay,
  lang: Lang = DEFAULT_LANG, stops?: StopSpec,
): Route {
  const pts = samplePoints(latlngs, data, tod);
  const st = stops && pts.length ? locateStops(pts, stops) : undefined;
  const route = assembleRoute(pts, profile, PROFILE_LABEL[lang][profile], suit, st);
  route.alerts = evaluateRoute(route, data, suit, tod, { lang });
  return route;
}

export function planRoutes(
  from: LatLng, to: LatLng, data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions,
): Route[] {
  const lang: Lang = opts?.lang ?? DEFAULT_LANG;
  const spec = stopSpec(opts);
  const wps: LatLng[] = [from, ...(spec?.via ?? []), to];
  const workMin = (spec?.workMin ?? []).reduce((a, b) => a + b, 0);
  const f = getFeatures(data);
  const W = PROFILE_WEIGHTS;
  const fastestL = solveLegs(f, W.fastest, tod, wps);
  const fastest = flat(fastestL);
  const fastLen = pathLengthM(f, fastest);
  // The safest route must also make it back on O₂: if the detour is too long (O₂ does not close the
  // round trip, or > 1.6× the fastest), soften the hazard/slope/cold weights.
  let safeW = W.safest;
  let safestL: Legs = [];
  for (const k of SAFEST_SCALES) {
    safeW = scaleWeights(W.safest, k);
    safestL = solveLegs(f, safeW, tod, wps);
    const len = pathLengthM(f, flat(safestL));
    const hours = len / 1000 / (suitConfig.walkSpeedKmh * 0.9);
    const o2Walk = hours * suitConfig.o2PctPerHour;
    const o2Work = (workMin / 60) * suitConfig.o2PctPerHour;
    const o2ok = suit.o2Pct - o2Walk - o2Work - returnNeed(o2Walk) >= suitConfig.o2ReservePct;
    if (len <= 1.6 * fastLen && o2ok) break;
  }
  // The 3 options must look different in the demo.
  if (fastest.length > 2 && similar(f, flat(safestL), fastest)) {
    for (const mult of [1.6, 2.5, 4]) {
      const alt = solveLegs(f, safeW, tod, wps, penaltyFor(f, [fastest], mult, wps));
      if (flat(alt).length && pathLengthM(f, flat(alt)) <= 1.6 * fastLen) safestL = alt;
      if (!similar(f, flat(safestL), fastest)) break;
    }
  }
  const safest = flat(safestL);
  const mk = (legs: Legs, profile: RouteProfile) =>
    buildRoute(legsToPolyline(f, legs, wps), profile, data, suit, tod, lang, spec);
  const risk = (r: Route) => r.alerts.reduce((s, a) => s + (a.severity === 'critical' ? 100 : 1), 0);
  let rs = mk(safestL, 'safest');
  const rf = mk(fastestL, 'fastest');

  // Balanced: candidates (own weights, fastest↔safest mixes, penalised corridors). Among those not
  // identical to the other two: reasonable length, risk <= fastest, visually distinct, lower risk,
  // shorter.
  const distinct = (p: number[]) => p.length > 2 && !similar(f, p, safest) && !similar(f, p, fastest);
  const cands: Legs[] = [solveLegs(f, W.balanced, tod, wps)];
  for (const t of [0.5, 0.3, 0.7]) cands.push(solveLegs(f, mixWeights(W.fastest, safeW, t), tod, wps));
  // geometry variants without the cold term (at night cold is almost uniform and hides alternatives)
  const noCold = (w: ProfileWeights): ProfileWeights => ({ ...w, wCold: 0, wHeat: 0 });
  for (const w of [W.balanced, mixWeights(W.fastest, safeW, 0.5)]) cands.push(solveLegs(f, noCold(w), tod, wps));
  for (const mult of [1.4, 2, 3]) {
    for (const w of [W.balanced, safeW]) {
      for (const clash of [[safest, fastest], [safest]]) {
        cands.push(solveLegs(f, w, tod, wps, penaltyFor(f, clash, mult, wps)));
      }
    }
    if (cands.filter((c) => distinct(flat(c))).length >= 3) break;
  }
  const identical = (a: number[], b: number[]) => Math.min(overlap(f, a, b, 0), overlap(f, b, a, 0)) > 0.9;
  const maxLen = 1.15 * Math.max(rs.distanceM, rf.distanceM);
  let rb: Route | null = null;
  let bestKey = Infinity;
  const seen = new Set<string>();
  for (const legs of cands) {
    const c = flat(legs);
    if (c.length <= 2 || identical(c, safest) || identical(c, fastest)) continue;
    const sig = `${c.length}:${c[c.length >> 1]}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const r = mk(legs, 'balanced');
    const o2Bad = r.alerts.some((a) => a.kind === 'o2' && a.severity === 'critical');
    const key = (r.distanceM > maxLen || o2Bad ? 4e9 : 0) + (risk(r) > risk(rf) ? 2e9 : 0) + (distinct(c) ? 0 : 1e9) +
      risk(r) * 1e6 + r.distanceM;
    if (key < bestKey) { bestKey = key; rb = r; }
  }
  // nothing reasonable (too long / O₂ fails): fall back to the natural balanced path, even if it
  // overlaps another option, instead of an absurd detour
  if (!rb || bestKey >= 4e9) rb = mk(flat(cands[0]).length ? cands[0] : safestL, 'balanced');

  // Keep the intuitive order: "safest" is never riskier than balanced, and on equal risk the safest
  // is the longer one (bigger detour).
  if (risk(rb) < risk(rs) || (risk(rb) === risk(rs) && rb.distanceM > rs.distanceM)) {
    const sPts = rs.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const bPts = rb.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    rs = buildRoute(bPts, 'safest', data, suit, tod, lang, spec);
    rb = buildRoute(sPts, 'balanced', data, suit, tod, lang, spec);
  }
  return [rs, rb, rf];
}

/** Inserts each via (in order) into the drawn polyline at its nearest segment. */
function insertVias(points: LatLng[], via: LatLng[]): LatLng[] {
  const out = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  let fromSeg = 0;
  for (const v of via) {
    if (out.length < 2) { out.push({ ...v }); fromSeg = out.length - 1; continue; }
    const proj = makeProj(v.lat, v.lng);
    let best = fromSeg;
    let bestD = Infinity;
    for (let k = fromSeg; k < out.length - 1; k++) {
      const [ax, ay] = toXY(proj, out[k].lat, out[k].lng);
      const [bx, by] = toXY(proj, out[k + 1].lat, out[k + 1].lng);
      const d = distPointSegXY(0, 0, ax, ay, bx, by);
      if (d < bestD) { bestD = d; best = k; }
    }
    out.splice(best + 1, 0, { lat: v.lat, lng: v.lng });
    fromSeg = best + 1;
  }
  return out;
}

export function routeFromPolyline(
  points: LatLng[], data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions,
): Route {
  const spec = stopSpec(opts);
  let pts = points.length === 1 ? [points[0], points[0]] : points;
  if (spec) pts = insertVias(pts, spec.via);
  return buildRoute(pts, 'manual', data, suit, tod, opts?.lang ?? DEFAULT_LANG, spec);
}
