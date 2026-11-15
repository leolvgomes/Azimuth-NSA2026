/**
 * Rebuild every static data file in public/data (npm run data:build).
 * Inputs: data/raw/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif (local); everything else is
 * downloaded on demand into data/raw/ (USGS DTM, Mars Trek tiles, MMGIS traverse, raw-image feed).
 * Steps that need the network fail soft: existing outputs are kept and the error is reported.
 */
import { buildCtx } from './ctx';
import { buildDtm } from './dtm';
import { buildThemis } from './themis';
import { buildVectors } from './vectors';
import { buildTrack } from './track';
import { buildDerived } from './derived';
import { buildLayers } from './layers';
import { buildPhotos } from './photos';
import { buildScience } from './science';

const steps: [string, () => Promise<unknown>][] = [
  ['ctx', buildCtx],
  ['dtm', buildDtm],
  ['themis', buildThemis],
  ['vectors', buildVectors],
  ['track', buildTrack],
  ['derived', buildDerived],
  ['layers', buildLayers],
  ['photos', buildPhotos],
  ['science', buildScience],
];

async function main() {
  const only = process.argv.slice(2);
  const failed: string[] = [];
  for (const [name, fn] of steps) {
    if (only.length && !only.includes(name)) continue;
    const t = Date.now();
    try {
      await fn();
      console.log(`  ✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    } catch (e) {
      failed.push(name);
      console.error(`  ✗ ${name}:`, (e as Error).message);
    }
  }
  if (failed.length) {
    console.error('failed steps:', failed.join(', '));
    process.exit(1);
  }
  console.log('all data built');
}

main();
