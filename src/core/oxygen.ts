/**
 * Walking time, O₂/battery use, margin and point of no return.
 * Model: suit speed × (1 − slowdownPerDeg·slope), at least 30 % of the flat speed.
 * O₂ and battery are proportional to time (% per hour, src/config/suit.ts), including work time at
 * stops (route.stops, same per-hour rate). The way back along the same path costs the same WALKING
 * O₂ as the way out (no stops) + returnSafetyMargin; o2ReservePct is never used.
 */
import { suitConfig } from '@/config/suit';
import type { OxygenMargin, PointOfNoReturn, Route, RoutePoint, SuitState } from './types';

export function speedKmh(slopeDeg: number | undefined): number {
  const s = slopeDeg && Number.isFinite(slopeDeg) ? Math.abs(slopeDeg) : 0;
  return suitConfig.walkSpeedKmh * Math.max(0.3, 1 - suitConfig.slowdownPerDeg * s);
}

/** Walking hours accumulated at each point (no stops). */
export function cumulativeHours(points: RoutePoint[]): number[] {
  const out = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.max(0, b.distM - a.distM);
    const s = ((a.slopeDeg ?? 0) + (b.slopeDeg ?? 0)) / 2;
    out[i] = out[i - 1] + seg / 1000 / speedKmh(s);
  }
  return out;
}

/** Work hours accumulated at each point (work at a stop counts from that point on). */
export function cumulativeStopHours(route: Pick<Route, 'points' | 'stops'>): number[] {
  const out = new Array<number>(route.points.length).fill(0);
  if (!route.stops?.length) return out;
  const add = new Array<number>(route.points.length).fill(0);
  for (const s of route.stops) if (s.index >= 0 && s.index < add.length) add[s.index] += Math.max(0, s.workMin) / 60;
  let acc = 0;
  for (let i = 0; i < out.length; i++) { acc += add[i]; out[i] = acc; }
  return out;
}

export function totalStopMin(route: Pick<Route, 'stops'>): number {
  return (route.stops ?? []).reduce((s, x) => s + Math.max(0, x.workMin), 0);
}

/**
 * O₂ used (%) up to each point: total (walk + work) and walk-only, consistent with route.o2UsedPct.
 */
function usedAt(route: Route, totalPct: number): { total: number[]; walk: number[] } {
  const pts = route.points;
  if (!pts.length) return { total: [], walk: [] };
  const w = cumulativeHours(pts);
  const s = cumulativeStopHours(route);
  const tot = w[w.length - 1] + s[s.length - 1];
  if (tot <= 0) {
    const d = route.distanceM || 1;
    const f = pts.map((p) => (p.distM / d) * totalPct);
    return { total: f, walk: f };
  }
  const k = totalPct / tot;
  return { total: w.map((v, i) => (v + s[i]) * k), walk: w.map((v) => v * k) };
}

export function o2UsedAt(route: Route): number[] {
  return usedAt(route, route.o2UsedPct).total;
}
export function o2WalkUsedAt(route: Route): number[] {
  return usedAt(route, route.o2UsedPct).walk;
}
export function batteryUsedAt(route: Route): number[] {
  return usedAt(route, route.batteryUsedPct).total;
}
export function batteryWalkUsedAt(route: Route): number[] {
  return usedAt(route, route.batteryUsedPct).walk;
}

/** O₂ needed to walk back to base along the same path, given the walking O₂ used to get there. */
export function returnNeed(walkUsed: number): number {
  return walkUsed * (1 + suitConfig.returnSafetyMargin);
}

/** O₂ used walking (no stops) for the whole route. */
function walkTotal(route: Route): number {
  const w = o2WalkUsedAt(route);
  return w.length ? w[w.length - 1] : route.o2UsedPct;
}

export function oxygenMargin(route: Route, suit: SuitState): OxygenMargin {
  const need = route.o2UsedPct + returnNeed(walkTotal(route));
  const margin = suit.o2Pct - need;
  return {
    o2AvailablePct: suit.o2Pct,
    o2NeededRoundTripPct: need,
    marginPct: margin,
    autonomyMin: Math.max(0, ((suit.o2Pct - suitConfig.o2ReservePct) / suitConfig.o2PctPerHour) * 60),
    ok: margin >= suitConfig.o2ReservePct,
  };
}

/**
 * Last index where the remaining O₂ (after walking + stop work so far) still covers walking back to
 * base along the same path (with returnSafetyMargin) without touching the reserve. null if the whole
 * route never crosses that limit. Index 0 if not even the start is safe.
 */
export function pointOfNoReturn(route: Route, suit: SuitState): PointOfNoReturn | null {
  const pts = route.points;
  if (pts.length === 0) return null;
  const { total, walk } = usedAt(route, route.o2UsedPct);
  const ok = (i: number) => suit.o2Pct - total[i] - returnNeed(walk[i]) >= suitConfig.o2ReservePct;
  if (ok(pts.length - 1)) return null;
  let last = 0;
  for (let i = 0; i < pts.length; i++) {
    if (ok(i)) last = i;
    else break;
  }
  const p = pts[last];
  return { index: last, lat: p.lat, lng: p.lng, distM: p.distM };
}

/** Index of the first point where O₂ no longer covers the way back (−1 if never). */
export function firstO2Failure(route: Route, suit: SuitState): number {
  const { total, walk } = usedAt(route, route.o2UsedPct);
  return total.findIndex((u, i) => suit.o2Pct - u - returnNeed(walk[i]) < suitConfig.o2ReservePct);
}
