/**
 * Mars Trek WMTS helpers. Trek "default028mm" tile matrix set == Leaflet L.CRS.EPSG4326 scheme:
 * zoom 0 = 2x1 tiles of 256 px, each tile spans 180/2^z degrees, origin (-180, 90), row 0 = north.
 */
import { join, dirname } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { RAW, ensureDir, exists, fetchBuf } from './lib';
import type { GeoBounds } from '../../src/core/types';

export const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ';
export const trekTemplate = (layer: string, ext: 'png' | 'jpg') =>
  `${TREK}/${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`;

export const tileDeg = (z: number) => 180 / 2 ** z;

export function tileRange(b: GeoBounds, z: number) {
  const d = tileDeg(z);
  return {
    x0: Math.floor((b.west + 180) / d),
    x1: Math.floor((b.east + 180) / d),
    y0: Math.floor((90 - b.north) / d),
    y1: Math.floor((90 - b.south) / d),
  };
}

/** Download (with on-disk cache in data/raw/trek/tiles) one tile; returns null on 404/error. */
export async function getTile(template: string, z: number, x: number, y: number, layerKey: string): Promise<Buffer | null> {
  const ext = template.endsWith('jpg') ? 'jpg' : 'png';
  const p = join(RAW, 'trek', 'tiles', layerKey, String(z), String(y), `${x}.${ext}`);
  if (await exists(p)) return readFile(p);
  const url = template.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
  try {
    const buf = await fetchBuf(url, 30000);
    await ensureDir(dirname(p));
    await writeFile(p, buf);
    return buf;
  } catch (e) {
    console.warn('  tile failed', url, (e as Error).message);
    return null;
  }
}

/**
 * Mosaic the tiles covering bounds at zoom z into one grey raster (first channel) + alpha.
 * Returns a sampler (lat,lng) → grey 0..255 or null where transparent/missing.
 */
export async function greyMosaic(template: string, layerKey: string, b: GeoBounds, z: number) {
  const { x0, x1, y0, y1 } = tileRange(b, z);
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const W = tw * 256, H = th * 256;
  const grey = new Uint8Array(W * H);
  const alpha = new Uint8Array(W * H);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const buf = await getTile(template, z, tx, ty, layerKey);
      if (!buf) continue;
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      const hasA = ch === 2 || ch === 4;
      for (let py = 0; py < info.height; py++)
        for (let px = 0; px < info.width; px++) {
          const s = (py * info.width + px) * ch;
          const d = ((ty - y0) * 256 + py) * W + (tx - x0) * 256 + px;
          grey[d] = ch >= 3 ? Math.round((data[s] + data[s + 1] + data[s + 2]) / 3) : data[s];
          alpha[d] = hasA ? data[s + ch - 1] : 255;
        }
    }
  const d = tileDeg(z);
  const lng0 = x0 * d - 180, lat0 = 90 - y0 * d;
  const ppd = 256 / d;
  return {
    W, H,
    sample(lat: number, lng: number): number | null {
      const fx = (lng - lng0) * ppd - 0.5, fy = (lat0 - lat) * ppd - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const ax = fx - ix, ay = fy - iy;
      let s = 0, wsum = 0;
      for (const [dx, dy, w] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]] as const) {
        const x = ix + dx, y = iy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (alpha[i] < 128) continue;
        s += grey[i] * w;
        wsum += w;
      }
      return wsum > 0.01 ? s / wsum : null;
    },
  };
}
