/**
 * Amostragem dos dados ao longo de uma rota e montagem do objeto Route.
 */
import { suitConfig } from '@/config/suit';
import { getFeatures, HAZARD_BUFFER_M } from './costMap';
import { DEG, M_PER_DEG, densify, distanceM, hazardDistXY, isPlaceholderGrid, sampleGrid, toXY } from './geo';
import { cumulativeHours } from './oxygen';
import type { LatLng, MapData, Route, RouteProfile, RoutePoint, SuitState, TimeOfDay } from './types';

export const POINT_STEP_M = 50;

/** Passo de amostragem: ~50 m, menor se a grade de inclinação for mais fina (para não pular células). */
export function pointStepM(data: MapData): number {
  const g = data.grids.slope;
  if (isPlaceholderGrid(g)) return POINT_STEP_M;
  const latMid = (g.bounds.north + g.bounds.south) / 2;
  const cw = ((g.bounds.east - g.bounds.west) / g.width) * M_PER_DEG * Math.cos(latMid * DEG);
  const ch = ((g.bounds.north - g.bounds.south) / g.height) * M_PER_DEG;
  return Math.max(10, Math.min(POINT_STEP_M, 0.9 * Math.min(cw, ch)));
}

export function tempGrid(data: MapData, tod: TimeOfDay) {
  return tod === 'day' ? data.grids.tempDay : data.grids.tempNight;
}

/** ids dos perigos a <= bufferM do ponto (0 = dentro). Ordenado do mais próximo. */
export function hazardsNear(data: MapData, at: LatLng, bufferM = HAZARD_BUFFER_M): { id: string; distM: number }[] {
  const f = getFeatures(data);
  const [x, y] = toXY(f.proj, at.lat, at.lng);
  const out: { id: string; distM: number }[] = [];
  for (const s of f.hazardShapes) {
    if (x < s.minX - bufferM || x > s.maxX + bufferM || y < s.minY - bufferM || y > s.maxY + bufferM) continue;
    const d = hazardDistXY(s, x, y);
    if (d <= bufferM) out.push({ id: s.hazard.id, distM: d });
  }
  return out.sort((a, b) => a.distM - b.distM);
}

/** Densifica (opcional) e preenche distM, elevM, slopeDeg, surfaceTempC, hazardIds. */
export function samplePoints(latlngs: LatLng[], data: MapData, tod: TimeOfDay, step = pointStepM(data)): RoutePoint[] {
  const pts = step > 0 ? densify(latlngs, step) : latlngs.map((p) => ({ lat: p.lat, lng: p.lng }));
  const tg = tempGrid(data, tod);
  let acc = 0;
  return pts.map((p, i) => {
    if (i > 0) acc += distanceM(pts[i - 1], p);
    const rp: RoutePoint = { lat: p.lat, lng: p.lng, distM: acc };
    const e = sampleGrid(data.grids.elevation, p.lat, p.lng);
    if (e !== null) rp.elevM = e;
    const s = sampleGrid(data.grids.slope, p.lat, p.lng);
    if (s !== null) rp.slopeDeg = s; // placeholder (0) também; o alerta 'no-data' avisa
    const t = sampleGrid(tg, p.lat, p.lng);
    if (t !== null) rp.surfaceTempC = t;
    const hz = hazardsNear(data, p);
    rp.hazardIds = hz.map((h) => h.id);
    return rp;
  });
}

let routeSeq = 0;

/** Monta a Route a partir de pontos já amostrados. Alertas são preenchidos por quem chama. */
/** Builds the Route from sampled points (+ optional stops). Alerts are filled by the caller. */
export function assembleRoute(
  points: RoutePoint[], profile: RouteProfile, label: string, suit: SuitState, stops?: Route['stops'],
): Route {
  const distanceM = points.length ? points[points.length - 1].distM : 0;
  const hrs = cumulativeHours(points);
  const walkH = hrs.length ? hrs[hrs.length - 1] : 0;
  const workH = (stops ?? []).reduce((a, s) => a + Math.max(0, s.workMin), 0) / 60;
  const hours = walkH + workH;
  const o2Used = hours * suitConfig.o2PctPerHour;
  const batUsed = hours * suitConfig.batteryPctPerHour;
  const o2Walk = walkH * suitConfig.o2PctPerHour;
  const batWalk = walkH * suitConfig.batteryPctPerHour;
  let maxSlope = 0;
  for (const p of points) if (p.slopeDeg !== undefined && p.slopeDeg > maxSlope) maxSlope = p.slopeDeg;
  routeSeq = (routeSeq + 1) % 1e6;
  const r: Route = {
    id: `${profile}-${Math.round(distanceM)}-${routeSeq}`,
    profile,
    label,
    points,
    distanceM,
    durationMin: hours * 60,
    o2UsedPct: o2Used,
    batteryUsedPct: batUsed,
    // round trip: way out (walk + stops) + walking back along the same path (no margin here)
    o2RemainingPct: suit.o2Pct - o2Used - o2Walk,
    batteryRemainingPct: suit.batteryPct - batUsed - batWalk,
    maxSlopeDeg: maxSlope,
    alerts: [],
  };
  if (stops?.length) r.stops = stops;
  return r;
}
