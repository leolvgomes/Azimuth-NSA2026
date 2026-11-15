/**
 * USGS Mars 2020 TRN CTX DTM (20 m, MOLA-controlled, geoid-referenced) → elevation.json + slope.json.
 *   source: https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/
 *           JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
 * Slope is computed at native 20 m resolution (Horn 3x3), then each ~150 m grid cell keeps the
 * 90th percentile slope (conservative for walking). Elevation = cell mean.
 */
import { fromFile } from 'geotiff';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { BOUNDS, GRID_H, GRID_W, RAW, exists, fetchBuf, makeGrid, mToDeg, round, writeJson } from './lib';

export const DTM_NAME = 'JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif';
const DTM_URL = `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/${DTM_NAME}`;

export async function buildDtm() {
  const path = join(RAW, DTM_NAME);
  if (!(await exists(path))) {
    console.log('[dtm] downloading', DTM_URL);
    await writeFile(path, await fetchBuf(DTM_URL, 600000));
  }
  console.log('[dtm] reading', path);
  const tiff = await fromFile(path);
  const img = await tiff.getImage();
  const W = img.getWidth(), H = img.getHeight();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const [resX] = img.getResolution();
  const nod = img.getGDALNoData() ?? -3.4e38;
  const ras = (await img.readRasters({ interleave: true })) as unknown as Float32Array;
  const west = mToDeg(minX), east = mToDeg(maxX), south = mToDeg(minY), north = mToDeg(maxY);
  console.log(`  DTM ${W}x${H}, bounds lat ${south.toFixed(4)}..${north.toFixed(4)} lon ${west.toFixed(4)}..${east.toFixed(4)}`);
  const valid = (v: number) => Number.isFinite(v) && v > -1e30 && v !== nod && v > -10000 && v < 10000;

  // native slope (deg). x spacing on ground = res * cos(lat), y spacing = res.
  const cosLat = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const dx = resX * cosLat, dy = resX;
  const slope = new Float32Array(W * H).fill(NaN);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const z = (xx: number, yy: number) => ras[yy * W + xx];
      const a = z(x - 1, y - 1), b = z(x, y - 1), c = z(x + 1, y - 1);
      const d = z(x - 1, y), f = z(x + 1, y);
      const g = z(x - 1, y + 1), h = z(x, y + 1), i = z(x + 1, y + 1);
      if (![a, b, c, d, f, g, h, i].every(valid)) continue;
      const gx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * dx);
      const gy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * dy);
      slope[y * W + x] = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    }
  }

  const elev: number[] = [];
  const slp: number[] = [];
  for (let r = 0; r < GRID_H; r++) {
    const latN = BOUNDS.north - (r / GRID_H) * (BOUNDS.north - BOUNDS.south);
    const latS = BOUNDS.north - ((r + 1) / GRID_H) * (BOUNDS.north - BOUNDS.south);
    const y0 = Math.max(0, Math.floor(((north - latN) / (north - south)) * H));
    const y1 = Math.min(H, Math.ceil(((north - latS) / (north - south)) * H));
    for (let c = 0; c < GRID_W; c++) {
      const lngW = BOUNDS.west + (c / GRID_W) * (BOUNDS.east - BOUNDS.west);
      const lngE = BOUNDS.west + ((c + 1) / GRID_W) * (BOUNDS.east - BOUNDS.west);
      const x0 = Math.max(0, Math.floor(((lngW - west) / (east - west)) * W));
      const x1 = Math.min(W, Math.ceil(((lngE - west) / (east - west)) * W));
      let sum = 0, n = 0;
      const ss: number[] = [];
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const v = ras[y * W + x];
          if (valid(v)) { sum += v; n++; }
          const s = slope[y * W + x];
          if (!Number.isNaN(s)) ss.push(s);
        }
      elev.push(n ? Math.round(sum / n) : -9999);
      if (ss.length) {
        ss.sort((p, q) => p - q);
        slp.push(round(ss[Math.min(ss.length - 1, Math.floor(ss.length * 0.9))], 1));
      } else slp.push(-9999);
    }
  }
  const nodataE = elev.filter((v) => v === -9999).length;
  const nodataS = slp.filter((v) => v === -9999).length;
  const ve = elev.filter((v) => v !== -9999), vs = slp.filter((v) => v !== -9999);
  console.log(`  elevation ${Math.min(...ve)}..${Math.max(...ve)} m (nodata ${nodataE}); slope p90 ${Math.min(...vs)}..${Math.max(...vs)} deg (nodata ${nodataS})`);
  const src = 'USGS Astrogeology Mars 2020 TRN CTX DTM 20 m (MOLA-controlled, geoid), JEZ_ctx_B_soc_008';
  await writeJson('grids/elevation.json', makeGrid('elevation', 'm', elev, `${src}; cell mean resampled to ~150 m`));
  await writeJson('grids/slope.json', makeGrid('slope', 'deg', slp, `${src}; Horn slope at 20 m, 90th percentile per ~150 m cell`));
  return { elev, slp };
}

if (require.main === module) buildDtm().catch((e) => { console.error(e); process.exit(1); });
