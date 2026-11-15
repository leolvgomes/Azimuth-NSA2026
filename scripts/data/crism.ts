/**
 * CRISM mineral layer for Jezero: MTRDR browse product "CAR" (carbonate index composite,
 * R = D2300, G = BD2500_2, B = BD1900_2) of observation FRT00005C5E, which covers the delta,
 * the western margin carbonates and the landing site. Map-projected (equirectangular) by the
 * CRISM team; footprint bounds come from the PDS label.
 *   → public/data/crism/jezero-crism-carbonate.webp  (L.imageOverlay with the returned bounds)
 * Source: PDS Geosciences Node, mro-m-crism-5-rdr-mptargeted-v1 (MTRDR), found via ODE REST.
 */
import { join } from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { PUB, RAW, ensureDir, exists, fetchBuf } from './lib';

const OBS = 'frt00005c5e';
const BASE = `https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2007/2007_139/${OBS}`;
const NAME = `${OBS}_07_brcarj_mtr3`;

async function cached(file: string) {
  const p = join(RAW, 'crism', file);
  if (!(await exists(p))) {
    await ensureDir(join(RAW, 'crism'));
    await writeFile(p, await fetchBuf(`${BASE}/${file}`, 180000));
  }
  return p;
}

export async function buildCrism() {
  console.log('[crism] CAR browse', NAME);
  const lbl = await readFile(await cached(`${NAME}.lbl`), 'utf8');
  const num = (k: string) => {
    const m = lbl.match(new RegExp(`${k}\\s*=\\s*([-\\d.]+)`));
    if (!m) throw new Error(`label key ${k} missing`);
    return +m[1];
  };
  const south = num('MINIMUM_LATITUDE'), north = num('MAXIMUM_LATITUDE');
  const west = num('WESTERNMOST_LONGITUDE'), east = num('EASTERNMOST_LONGITUDE');
  const png = await cached(`${NAME}.png`);
  const outDir = join(PUB, 'crism');
  await ensureDir(outDir);
  const out = join(outDir, 'jezero-crism-carbonate.webp');
  // brighten: browse is dark; keep alpha (outside footprint is transparent)
  await sharp(png).linear(1.6, 0).webp({ quality: 85, alphaQuality: 60 }).toFile(out);
  console.log(`  wrote public/data/crism/jezero-crism-carbonate.webp (${((await stat(out)).size / 1024).toFixed(0)} KB) bounds ${south},${west} .. ${north},${east}`);
  return {
    url: '/data/crism/jezero-crism-carbonate.webp',
    remoteUrl: `${BASE}/${NAME}.png`,
    bounds: [[south, west], [north, east]] as [[number, number], [number, number]],
  };
}

if (require.main === module) buildCrism().catch((e) => { console.error(e); process.exit(1); });
