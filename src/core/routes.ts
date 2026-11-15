/**
 * Planejamento: 3 perfis (safest, balanced, fastest) com A* sobre o mapa de custo,
 * suavização (Douglas-Peucker que não atravessa célula bloqueada), amostragem e alertas.
 */
import { suitConfig } from '@/config/suit';
import { evaluateRoute } from './alerts';
import { returnNeed } from './oxygen';
import { astar } from './astar';
import { buildCostField, getFeatures, type CostFeatures, type ProfileWeights } from './costMap';
import { cellCenter, cellOf, toXY } from './geo';
import { assembleRoute, samplePoints } from './sampling';
import type { LatLng, MapData, Route, RouteProfile, SuitState, TimeOfDay } from './types';

export const PROFILE_WEIGHTS: Record<'safest' | 'balanced' | 'fastest', ProfileWeights> = {
  /** Evita perigo e frio, gosta de terreno plano e da trilha do Perseverance. */
  safest: { wSlope: 2.0, wHazard: 12, wClear: 6, wCold: 3, wHeat: 2, wTrack: 0.4, nodataPenalty: 0.5 },
  balanced: { wSlope: 0.8, wHazard: 3, wClear: 1.5, wCold: 0.8, wHeat: 0.5, wTrack: 0.15, nodataPenalty: 0.2 },
  /** Quase só distância; inclinação > limite e perigos 'avoid' continuam bloqueados. */
  fastest: { wSlope: 0.1, wHazard: 0.2, wClear: 0, wCold: 0, wHeat: 0, wTrack: 0, nodataPenalty: 0 },
};

export const PROFILE_LABEL: Record<RouteProfile, string> = {
  safest: 'Mais segura',
  balanced: 'Equilibrada',
  fastest: 'Mais rápida',
  manual: 'Desenhada',
  return: 'Volta ao abrigo',
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

function penaltyFor(f: CostFeatures, paths: number[][], mult: number): Float32Array {
  const rad = Math.max(2, Math.round(350 / Math.min(f.cellWM, f.cellHM)));
  const p = new Float32Array(f.width * f.height);
  for (const path of paths) {
    const m = corridorMask(f, path, rad);
    for (let i = 0; i < m.length; i++) if (m[i]) p[i] = mult;
  }
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

/** Constrói uma Route completa (pontos a cada ~50 m, tempo, O₂, alertas). */
export function buildRoute(
  latlngs: LatLng[], profile: RouteProfile, data: MapData, suit: SuitState, tod: TimeOfDay, label = PROFILE_LABEL[profile],
): Route {
  const pts = samplePoints(latlngs, data, tod);
  const route = assembleRoute(pts, profile, label, suit);
  route.alerts = evaluateRoute(route, data, suit, tod);
  return route;
}

export function planRoutes(from: LatLng, to: LatLng, data: MapData, suit: SuitState, tod: TimeOfDay): Route[] {
  const f = getFeatures(data);
  const W = PROFILE_WEIGHTS;
  const fastest = solveCells(f, W.fastest, tod, from, to);
  const fastLen = pathLengthM(f, fastest);
  // "Mais segura" também tem que voltar com O₂: se o desvio for longo demais (O₂ não fecha ida+volta
  // ou > 1,6× a mais rápida), suaviza os pesos de perigo/inclinação/frio.
  let safeW = W.safest;
  let safest: number[] = [];
  for (const k of SAFEST_SCALES) {
    safeW = scaleWeights(W.safest, k);
    safest = solveCells(f, safeW, tod, from, to);
    const len = pathLengthM(f, safest);
    const hours = len / 1000 / (suitConfig.walkSpeedKmh * 0.9);
    const o2 = hours * suitConfig.o2PctPerHour;
    const o2ok = suit.o2Pct - o2 - returnNeed(o2) >= suitConfig.o2ReservePct;
    if (len <= 1.6 * fastLen && o2ok) break;
  }
  // As rotas precisam ser visivelmente diferentes no demo.
  if (fastest.length > 2 && similar(f, safest, fastest)) {
    for (const mult of [1.6, 2.5, 4]) {
      const alt = solveCells(f, safeW, tod, from, to, penaltyFor(f, [fastest], mult));
      if (alt.length) safest = alt;
      if (!similar(f, safest, fastest)) break;
    }
  }
  const mk = (cells: number[], profile: RouteProfile) =>
    buildRoute(cellsToPolyline(f, cells, from, to), profile, data, suit, tod);
  const risk = (r: Route) => r.alerts.reduce((s, a) => s + (a.severity === 'critical' ? 100 : 1), 0);
  let rs = mk(safest, 'safest');
  const rf = mk(fastest, 'fastest');

  // Equilibrada: candidatos (pesos próprios, misturas fastest↔safest, corredores penalizados).
  // Escolhe, entre os distintos das outras duas, o de menor risco e depois menor distância,
  // preferindo risco <= o da mais rápida e distância <= a da mais segura (fica "no meio").
  const distinct = (p: number[]) => p.length > 2 && !similar(f, p, safest) && !similar(f, p, fastest);
  const cands: number[][] = [solveCells(f, W.balanced, tod, from, to)];
  for (const t of [0.5, 0.3, 0.7]) cands.push(solveCells(f, mixWeights(W.fastest, safeW, t), tod, from, to));
  // variantes geométricas sem o termo de frio (à noite o frio é quase uniforme e esconde alternativas)
  const noCold = (w: ProfileWeights): ProfileWeights => ({ ...w, wCold: 0, wHeat: 0 });
  for (const w of [W.balanced, mixWeights(W.fastest, safeW, 0.5)]) cands.push(solveCells(f, noCold(w), tod, from, to));
  for (const mult of [1.4, 2, 3]) {
    for (const w of [W.balanced, safeW]) {
      for (const clash of [[safest, fastest], [safest]]) {
        cands.push(solveCells(f, w, tod, from, to, penaltyFor(f, clash, mult)));
      }
    }
    if (cands.filter(distinct).length >= 3) break;
  }
  // Critério (em ordem): distância razoável (<= 1,15× a maior das outras duas), risco <= o da mais
  // rápida, visualmente distinta (corredor de 200 m), menor risco, menor distância.
  const identical = (a: number[], b: number[]) => Math.min(overlap(f, a, b, 0), overlap(f, b, a, 0)) > 0.9;
  const maxLen = 1.15 * Math.max(rs.distanceM, rf.distanceM);
  let rb: Route | null = null;
  let bestKey = Infinity;
  const seen = new Set<string>();
  for (const c of cands) {
    if (c.length <= 2 || identical(c, safest) || identical(c, fastest)) continue;
    const sig = `${c.length}:${c[c.length >> 1]}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const r = mk(c, 'balanced');
    const key = (r.distanceM > maxLen ? 4e9 : 0) + (risk(r) > risk(rf) ? 2e9 : 0) + (distinct(c) ? 0 : 1e9) +
      risk(r) * 1e6 + r.distanceM;
    if (key < bestKey) { bestKey = key; rb = r; }
  }
  if (!rb) rb = mk(cands[0].length ? cands[0] : safest, 'balanced');

  // Mantém a ordem intuitiva: a "segura" nunca é mais arriscada que a equilibrada, e se as duas
  // empatam em risco a segura é a mais longa (desvio maior).
  if (risk(rb) < risk(rs) || (risk(rb) === risk(rs) && rb.distanceM > rs.distanceM)) {
    const sPts = rs.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const bPts = rb.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    rs = buildRoute(bPts, 'safest', data, suit, tod);
    rb = buildRoute(sPts, 'balanced', data, suit, tod);
  }
  return [rs, rb, rf];
}

export function routeFromPolyline(points: LatLng[], data: MapData, suit: SuitState, tod: TimeOfDay): Route {
  const pts = points.length === 1 ? [points[0], points[0]] : points;
  return buildRoute(pts, 'manual', data, suit, tod);
}
