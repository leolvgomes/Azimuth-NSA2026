/**
 * Builds the equirectangular Mars texture used by the 3D intro (src/components/globe).
 *
 * Source: NASA Mars Trek WMTS, Viking MDIM 2.1 color mosaic (EPSG:4326, 256 px tiles,
 * TopLeftCorner -180 90; zoom z has 2^(z+1) x 2^z tiles). Zoom 3 = 16 x 8 tiles = 4096 x 2048 px.
 * Credit: NASA/JPL-Caltech/USGS.
 *
 * Run: npx tsx scripts/textures/build-mars-texture.ts
 * Tiles are cached in data/raw/mars-tiles/z3 (outside git). Outputs:
 *   public/textures/mars-4k.jpg (4096x2048), public/textures/mars-2k.jpg (2048x1024)
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';

const LAYER =
  'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm';
const Z = 3;
const COLS = 2 ** (Z + 1);
const ROWS = 2 ** Z;
const TILE = 256;

const root = process.cwd();
const cacheDir = path.join(root, 'data', 'raw', 'mars-tiles', `z${Z}`);
const outDir = path.join(root, 'public', 'textures');

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function getTile(row: number, col: number): Promise<Buffer> {
  const file = path.join(cacheDir, `${row}_${col}.jpg`);
  if (await exists(file)) return readFile(file);
  const url = `${LAYER}/${Z}/${row}/${col}.jpg`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // validate it decodes as an image before caching
      await sharp(buf).metadata();
      await writeFile(file, buf);
      return buf;
    } catch (err) {
      if (attempt === 3) throw new Error(`tile ${row}/${col} failed: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const jobs: { row: number; col: number }[] = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) jobs.push({ row, col });

  const composites: OverlayOptions[] = [];
  const CONCURRENCY = 6;
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const { row, col } = jobs[i++];
      const buf = await getTile(row, col);
      const tile = await sharp(buf).resize(TILE, TILE).removeAlpha().toBuffer();
      composites.push({ input: tile, left: col * TILE, top: row * TILE });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`tiles: ${composites.length}`);

  const W = COLS * TILE;
  const H = ROWS * TILE;
  const full = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite(composites)
    .png()
    .toBuffer();

  // warm grade + contrast so the globe reads well on black
  const graded = sharp(full)
    .linear([1.1, 0.98, 0.84], [-6, -6, -4])
    .modulate({ saturation: 1.22, brightness: 1.0 });

  const out4k = path.join(outDir, 'mars-4k.jpg');
  const out2k = path.join(outDir, 'mars-2k.jpg');
  await graded.clone().jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(out4k);
  await graded
    .clone()
    .resize(W / 2, H / 2)
    .jpeg({ quality: 85, mozjpeg: true, progressive: true })
    .toFile(out2k);

  for (const f of [out4k, out2k]) console.log(f, ((await stat(f)).size / 1024).toFixed(0), 'KB');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
