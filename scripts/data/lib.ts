/**
 * Shared helpers for the map-data scripts (npx tsx scripts/data/<x>.ts).
 * Only depends on Node, sharp, geotiff and the shared contracts (read-only).
 */
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { JEZERO_BOUNDS, MARS_RADIUS_M } from '../../src/config/mission';
import type { GeoBounds, Grid } from '../../src/core/types';

export const ROOT = resolve(__dirname, '..', '..');
export const RAW = join(ROOT, 'data', 'raw');
export const PUB = join(ROOT, 'public', 'data');
export const BOUNDS: GeoBounds = { ...JEZERO_BOUNDS };
export const R = MARS_RADIUS_M;

/** Grid size used by all numeric grids (~200 columns over Jezero). */
export const GRID_W = 200;
const COS_LAT = Math.cos((((BOUNDS.north + BOUNDS.south) / 2) * Math.PI) / 180);
/** Rows chosen so cells are ~square on the ground (~200 x 200, ~150 m). */
export const GRID_H = Math.round((GRID_W * (BOUNDS.north - BOUNDS.south)) / ((BOUNDS.east - BOUNDS.west) * COS_LAT));

export const DEG_M = (Math.PI * R) / 180; // metres per degree of latitude
export const cellSizeM = ((BOUNDS.east - BOUNDS.west) / GRID_W) * DEG_M * COS_LAT;

export async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}

export async function writeJson(rel: string, value: unknown, pretty = false) {
  const p = join(PUB, rel);
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(value, null, pretty ? 2 : undefined));
  const s = await stat(p);
  console.log(`  wrote public/data/${rel} (${(s.size / 1024).toFixed(1)} KB)`);
}

export async function readJson<T>(abs: string): Promise<T> {
  return JSON.parse(await readFile(abs, 'utf8')) as T;
}

export async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Centre of grid cell (row, col) in lat/lng. Row 0 = north. */
export function cellCenter(row: number, col: number, w = GRID_W, h = GRID_H, b = BOUNDS) {
  return {
    lat: b.north - ((row + 0.5) / h) * (b.north - b.south),
    lng: b.west + ((col + 0.5) / w) * (b.east - b.west),
  };
}

export function makeGrid(
  name: string,
  unit: string,
  data: number[],
  source: string,
  approximate = false,
  nodata = -9999,
): Grid {
  return {
    name,
    unit,
    width: GRID_W,
    height: GRID_H,
    bounds: { ...BOUNDS },
    cellSizeM: Math.round(cellSizeM * 10) / 10,
    nodata,
    data,
    source,
    ...(approximate ? { approximate: true } : {}),
  };
}

export const round = (v: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

/** Equirectangular distance in metres (fine at this scale). */
export function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const k = Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  const dy = (aLat - bLat) * DEG_M;
  const dx = (aLng - bLng) * DEG_M * k;
  return Math.hypot(dx, dy);
}

/** Distance (m) from point to segment, local planar approx. */
export function distToSegM(lat: number, lng: number, a: [number, number], b: [number, number]) {
  const k = Math.cos((lat * Math.PI) / 180);
  const px = lng * k, py = lat;
  const ax = a[1] * k, ay = a[0];
  const bx = b[1] * k, by = b[0];
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * DEG_M;
}

export function pointInPolygon(lat: number, lng: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inBounds(lat: number, lng: number, b = BOUNDS) {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/** Equirectangular metres (latTs=0, lon0=0) → degrees on the Mars 2000 sphere. */
export const mToDeg = (m: number) => (m / R) * (180 / Math.PI);

export async function fetchBuf(url: string, timeoutMs = 60000): Promise<Buffer> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'azimuth-data-script' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}
