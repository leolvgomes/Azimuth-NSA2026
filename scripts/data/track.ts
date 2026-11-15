/**
 * Perseverance traverse (NASA/JPL MMGIS M20_traverse.json) → perseverance-track.json ([lat,lng][]),
 * clipped to JEZERO_BOUNDS and simplified (Douglas-Peucker, ~4 m).
 * Also exports the waypoint list (sol → position) used by photos.ts.
 */
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { DEG_M, RAW, ensureDir, exists, fetchBuf, inBounds, readJson, round, writeJson } from './lib';

const M20 = join(RAW, 'm20');
const BASE_URL = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json';

type FC<P> = { features: { properties: P; geometry: { type: string; coordinates: number[][] | number[] } }[] };
export type Waypoint = { sol: number; lat: number; lng: number };

export async function loadM20(name: 'M20_traverse' | 'M20_waypoints') {
  const p = join(M20, `${name}.json`);
  if (!(await exists(p))) {
    await ensureDir(M20);
    console.log('  downloading', `${BASE_URL}/${name}.json`);
    await writeFile(p, await fetchBuf(`${BASE_URL}/${name}.json`, 120000));
  }
  return p;
}

export async function loadWaypoints(): Promise<Waypoint[]> {
  const fc = await readJson<FC<{ sol: number; lat: number; lon: number }>>(await loadM20('M20_waypoints'));
  return fc.features.map((f) => ({ sol: f.properties.sol, lat: f.properties.lat, lng: f.properties.lon }));
}

function simplify(pts: [number, number][], tolM: number): [number, number][] {
  if (pts.length < 3) return pts;
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a][1] * k, ay = pts[a][0], bx = pts[b][1] * k, by = pts[b][0];
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] * k, py = pts[i][0];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy) * DEG_M;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tolM) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export async function buildTrack(): Promise<[number, number][]> {
  console.log('[track] Perseverance traverse');
  const fc = await readJson<FC<{ sol: number }>>(await loadM20('M20_traverse'));
  const feats = [...fc.features].sort((a, b) => a.properties.sol - b.properties.sol);
  const raw: [number, number][] = [];
  for (const f of feats) {
    const g = f.geometry;
    const lines = (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]) as unknown as number[][][];
    for (const l of lines) for (const c of l) if (inBounds(c[1], c[0])) raw.push([c[1], c[0]]);
  }
  const track = simplify(raw, 4).map(([a, b]) => [round(a, 5), round(b, 5)] as [number, number]);
  const lastSol = feats[feats.length - 1]?.properties.sol;
  console.log(`  ${raw.length} pts → ${track.length} after simplify (traverse to sol ${lastSol})`);
  await writeJson('perseverance-track.json', track);
  return track;
}

if (require.main === module) buildTrack().catch((e) => { console.error(e); process.exit(1); });
