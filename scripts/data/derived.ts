/**
 * Derived grids:
 *   hazard.json          0..1  rasterized hazards.json (avoid = 1, caution = 0.6) with a soft ~200 m edge
 *   trackProximity.json  0..1  1 = on the Perseverance track, linear decay to 0 at 300 m
 */
import { join } from 'node:path';
import { GRID_H, GRID_W, PUB, cellCenter, distM, distToSegM, makeGrid, pointInPolygon, readJson, round, writeJson } from './lib';
import type { Hazard } from '../../src/core/types';

const EDGE_M = 200;
const TRACK_M = 300;

function distToRing(lat: number, lng: number, poly: [number, number][]) {
  let d = Infinity;
  for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, distToSegM(lat, lng, poly[i], poly[i + 1]));
  if (poly.length > 1 && (poly[0][0] !== poly[poly.length - 1][0] || poly[0][1] !== poly[poly.length - 1][1]))
    d = Math.min(d, distToSegM(lat, lng, poly[poly.length - 1], poly[0]));
  return d;
}

export async function buildDerived() {
  console.log('[derived] hazard + trackProximity grids');
  const hazards = await readJson<Hazard[]>(join(PUB, 'hazards.json'));
  const track = await readJson<[number, number][]>(join(PUB, 'perseverance-track.json'));
  const hz: number[] = [];
  const tp: number[] = [];
  for (let r = 0; r < GRID_H; r++)
    for (let c = 0; c < GRID_W; c++) {
      const { lat, lng } = cellCenter(r, c);
      let v = 0;
      for (const h of hazards) {
        const w = h.severity === 'avoid' ? 1 : 0.6;
        let d: number; // metres outside the hazard (0 = inside)
        if (h.polygon) d = pointInPolygon(lat, lng, h.polygon) ? 0 : distToRing(lat, lng, h.polygon);
        else if (h.center && h.radiusM) d = Math.max(0, distM(lat, lng, h.center.lat, h.center.lng) - h.radiusM);
        else continue;
        const f = d === 0 ? 1 : Math.max(0, 1 - d / EDGE_M) ** 2;
        v = Math.max(v, w * f);
      }
      hz.push(round(v, 2));
      let dt = Infinity;
      for (let i = 0; i < track.length - 1; i++) {
        // cheap bbox reject (~0.004 deg ≈ 240 m margin is not enough for 300 m → use 0.006)
        const a = track[i], b = track[i + 1];
        if (Math.min(a[0], b[0]) - 0.006 > lat || Math.max(a[0], b[0]) + 0.006 < lat) continue;
        if (Math.min(a[1], b[1]) - 0.006 > lng || Math.max(a[1], b[1]) + 0.006 < lng) continue;
        dt = Math.min(dt, distToSegM(lat, lng, a, b));
      }
      tp.push(round(Math.max(0, 1 - dt / TRACK_M), 2));
    }
  await writeJson('grids/hazard.json', makeGrid('hazard', '0-1', hz, `Rasterized hazards.json (avoid=1, caution=0.6, ${EDGE_M} m soft edge)`, true));
  await writeJson('grids/trackProximity.json', makeGrid('trackProximity', '0-1', tp, `Distance to Perseverance traverse (NASA/JPL MMGIS M20_traverse), 1 on track → 0 at ${TRACK_M} m`));
}

if (require.main === module) buildDerived().catch((e) => { console.error(e); process.exit(1); });
