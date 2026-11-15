/**
 * CTX orthomosaic (USGS Mars 2020 TRN, 6 m/px, 8-bit, nodata=0) → WebP with transparent nodata.
 *   public/data/ctx/jezero-ctx.webp          full resolution (5322 x 5040)
 *   public/data/ctx/jezero-ctx-preview.webp  ~1330 px wide
 * Bounds = JEZERO_BOUNDS (src/config/mission.ts). Use with L.imageOverlay(url, JEZERO_LEAFLET_BOUNDS).
 */
import sharp from 'sharp';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { PUB, RAW, ensureDir, exists } from './lib';

export const CTX_TIF = join(RAW, 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif');

export async function buildCtx() {
  console.log('[ctx] reading', CTX_TIF);
  if (!(await exists(CTX_TIF))) throw new Error('CTX TIF missing: download from https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/');
  sharp.cache(false);
  const { data, info } = await sharp(CTX_TIF, { limitInputPixels: false }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const ga = Buffer.alloc(width * height * 2);
  for (let i = 0, n = width * height; i < n; i++) {
    const v = data[i];
    ga[2 * i] = v;
    ga[2 * i + 1] = v === 0 ? 0 : 255;
  }
  const outDir = join(PUB, 'ctx');
  await ensureDir(outDir);
  const img = () => sharp(ga, { raw: { width, height, channels: 2 }, limitInputPixels: false });
  const full = join(outDir, 'jezero-ctx.webp');
  await img().webp({ quality: 86, alphaQuality: 50, effort: 4 }).toFile(full);
  const prev = join(outDir, 'jezero-ctx-preview.webp');
  await img().resize({ width: 1330 }).webp({ quality: 78, alphaQuality: 50 }).toFile(prev);
  for (const f of [full, prev]) console.log(`  wrote ${f.slice(PUB.length - 11)} (${((await stat(f)).size / 1048576).toFixed(2)} MB)`);
  return { width, height };
}

if (require.main === module) buildCtx().catch((e) => { console.error(e); process.exit(1); });
