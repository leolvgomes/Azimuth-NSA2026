/**
 * Science targets along a route: each target is projected onto the route's SEGMENTS (not only its
 * vertices). Returns those within radiusM (default 400 m), de-duplicated and sorted by distance along
 * the route.
 */
import { distPointSegXY, makeProj, toXY } from './geo';
import type { MapData, Route, ScienceStopOnRoute } from './types';

export const SCIENCE_RADIUS_M = 400;

export function scienceAlongRoute(route: Route, data: MapData, radiusM = SCIENCE_RADIUS_M): ScienceStopOnRoute[] {
  const pts = route.points;
  const targets = data.scienceTargets ?? [];
  if (!pts.length || !targets.length) return [];
  const seenId = new Set<string>();
  const seenPos = new Set<string>();
  const out: ScienceStopOnRoute[] = [];
  for (const target of targets) {
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) continue;
    const posKey = `${target.lat.toFixed(5)},${target.lng.toFixed(5)}`;
    if (seenId.has(target.id) || seenPos.has(posKey)) continue;
    const proj = makeProj(target.lat, target.lng);
    const xy = pts.map((p) => toXY(proj, p.lat, p.lng));
    let bestD = Infinity;
    let bestIdx = 0;
    let bestAlong = 0;
    if (pts.length === 1) {
      bestD = Math.hypot(xy[0][0], xy[0][1]);
    }
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = xy[k];
      const [bx, by] = xy[k + 1];
      const d = distPointSegXY(0, 0, ax, ay, bx, by);
      if (d < bestD) {
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? (-ax * dx - ay * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        bestD = d;
        bestIdx = t < 0.5 ? k : k + 1;
        bestAlong = pts[k].distM + t * (pts[k + 1].distM - pts[k].distM);
      }
    }
    if (bestD > radiusM) continue;
    seenId.add(target.id);
    seenPos.add(posKey);
    out.push({ target, index: bestIdx, alongM: bestAlong, offsetM: bestD });
  }
  return out.sort((a, b) => a.alongM - b.alongM || a.target.priority - b.target.priority);
}
