/**
 * Debug: render every grid in public/data/grids as a PNG blended over the CTX preview,
 * plus vectors (hazards, landmarks, track). Output dir = argv[2] (default data/raw/debug).
 *   npx tsx scripts/data/debug-render.ts [outDir]
 */
import sharp from 'sharp';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { BOUNDS, PUB, RAW, ensureDir, exists, readJson } from './lib';
import type { Grid, Hazard, Landmark } from '../../src/core/types';

async function main() {
  const out = process.argv[2] ?? join(RAW, 'debug');
  await ensureDir(out);
  const base = await sharp(join(PUB, 'ctx', 'jezero-ctx-preview.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = base.info;
  const toPx = (lat: number, lng: number) => [((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * W, ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * H];

  for (const f of await readdir(join(PUB, 'grids'))) {
    const g = await readJson<Grid>(join(PUB, 'grids', f));
    const v = g.data.filter((x) => x !== g.nodata);
    const lo = Math.min(...v), hi = Math.max(...v);
    const rgb = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = Math.min(g.width - 1, Math.floor((x / W) * g.width));
        const r = Math.min(g.height - 1, Math.floor((y / H) * g.height));
        const val = g.data[r * g.width + c];
        const t = val === g.nodata ? 0 : (val - lo) / (hi - lo || 1);
        const b = base.data[(y * W + x) * 3];
        const i = (y * W + x) * 3;
        rgb[i] = Math.round(0.45 * b + 0.55 * 255 * t);
        rgb[i + 1] = Math.round(0.45 * b + 0.55 * 255 * (1 - Math.abs(t - 0.5) * 2));
        rgb[i + 2] = Math.round(0.45 * b + 0.55 * 255 * (1 - t));
      }
    await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(join(out, f.replace('.json', '.png')));
    console.log(f, lo, hi);
  }

  // vectors as SVG overlay
  const parts: string[] = [];
  if (await exists(join(PUB, 'hazards.json')))
    for (const h of await readJson<Hazard[]>(join(PUB, 'hazards.json'))) {
      const col = h.severity === 'avoid' ? 'red' : 'orange';
      if (h.polygon) parts.push(`<polygon points="${h.polygon.map(([a, b]) => toPx(a, b).join(',')).join(' ')}" fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="2"/>`);
      if (h.center && h.radiusM) {
        const [x, y] = toPx(h.center.lat, h.center.lng);
        parts.push(`<circle cx="${x}" cy="${y}" r="${(h.radiusM / 23.9) * (W / 1330)}" fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="2"/>`);
      }
    }
  if (await exists(join(PUB, 'perseverance-track.json'))) {
    const t = await readJson<[number, number][]>(join(PUB, 'perseverance-track.json'));
    parts.push(`<polyline points="${t.map(([a, b]) => toPx(a, b).join(',')).join(' ')}" fill="none" stroke="cyan" stroke-width="2"/>`);
  }
  if (await exists(join(PUB, 'landmarks.json')))
    for (const l of await readJson<Landmark[]>(join(PUB, 'landmarks.json'))) {
      const [x, y] = toPx(l.lat, l.lng);
      parts.push(`<circle cx="${x}" cy="${y}" r="5" fill="yellow"/><text x="${x + 7}" y="${y + 4}" font-size="16" fill="yellow" stroke="black" stroke-width="0.5">${l.name.replace(/&/g, '&amp;')}</text>`);
    }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`);
  await sharp(base.data, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: svg }]).png().toFile(join(out, 'vectors.png'));
  console.log('rendered to', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
