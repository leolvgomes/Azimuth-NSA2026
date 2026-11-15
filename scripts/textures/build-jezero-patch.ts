/**
 * Builds a high-res, Mars-tinted patch of Jezero crater from the local CTX orthomosaic, used by
 * the 3D intro as a curved decal over the globe so the final dive lands on real 6 m/px imagery
 * (the same base the 2D map uses) instead of the blurry global mosaic.
 *
 * Input:  data/raw/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif (8-bit gray, nodata = 0)
 *         bounds = JEZERO_BOUNDS in src/config/mission.ts (equirectangular, so a lat/lon box)
 * Output: public/textures/jezero-ctx.webp (RGBA, feathered edges, nodata transparent)
 * Credit: NASA/JPL-Caltech/MSSS (MRO CTX).
 *
 * Run: npx tsx scripts/textures/build-jezero-patch.ts
 */
import path from 'node:path';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';

const root = process.cwd();
const SRC = path.join(root, 'data', 'raw', 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif');
const OUT = path.join(root, 'public', 'textures', 'jezero-ctx.webp');
const W = 2048;
/** Average color of the Viking mosaic around Jezero (sampled from mars-4k.jpg). */
const TINT = { r: 150, g: 98, b: 80 };

async function main() {
  const meta = await sharp(SRC).metadata();
  const H = Math.round((W * (meta.height ?? 1)) / (meta.width ?? 1));

  const gray = await sharp(SRC, { limitInputPixels: false })
    .resize(W, H, { kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  // Contrast stretch (ignore nodata) so the crater reads well.
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) if (v > 0) hist[v]++;
  const total = hist.reduce((a, b) => a + b, 0);
  const pct = (p: number) => {
    let acc = 0;
    for (let i = 1; i < 256; i++) {
      acc += hist[i];
      if (acc >= total * p) return i;
    }
    return 255;
  };
  const lo = pct(0.01);
  const hi = pct(0.995);

  // Alpha: valid data, eroded a bit, times a rectangular feather of ~6% of the size.
  const feather = Math.round(W * 0.06);
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = gray[i];
      const n = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      // luminance around the tint, so the patch matches the globe color
      const l = 0.35 + 1.15 * n;
      rgba[i * 4] = Math.min(255, TINT.r * l);
      rgba[i * 4 + 1] = Math.min(255, TINT.g * l);
      rgba[i * 4 + 2] = Math.min(255, TINT.b * l);
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y) / feather;
      const e = Math.min(1, edge);
      const smooth = e * e * (3 - 2 * e);
      rgba[i * 4 + 3] = v > 0 ? Math.round(255 * smooth) : 0;
    }
  }

  // Soften the nodata boundary by blurring the alpha channel only.
  const img = sharp(rgba, { raw: { width: W, height: H, channels: 4 } });
  const alpha = await img.clone().extractChannel(3).blur(6).toBuffer();
  const rgb = await img.clone().removeAlpha().toBuffer();
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 80, alphaQuality: 70 })
    .toFile(OUT);

  console.log(OUT, `${W}x${H}`, ((await stat(OUT)).size / 1024).toFixed(0), 'KB', { lo, hi });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
