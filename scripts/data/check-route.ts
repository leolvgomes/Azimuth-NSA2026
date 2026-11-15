/** Debug: sample all grids along a straight line base → target. npx tsx scripts/data/check-route.ts [lat lng] */
import { join } from 'node:path';
import { PUB, readJson, distM } from './lib';
import { BASE } from '../../src/config/mission';
import { DEMO_TARGET_REAL } from './vectors';
import { sampleGrid } from '../../src/data/loadMapData';
import type { Grid } from '../../src/core/types';

async function main() {
  const to = process.argv[3] ? { lat: +process.argv[2], lng: +process.argv[3] } : DEMO_TARGET_REAL;
  const names = ['elevation', 'slope', 'tempDay', 'tempNight', 'hazard', 'trackProximity'];
  const gs = await Promise.all(names.map((n) => readJson<Grid>(join(PUB, 'grids', `${n}.json`))));
  console.log('dist', Math.round(distM(BASE.lat, BASE.lng, to.lat, to.lng)), 'm');
  console.log('t     lat      lng      ' + names.join(' '));
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, lat = BASE.lat + (to.lat - BASE.lat) * t, lng = BASE.lng + (to.lng - BASE.lng) * t;
    console.log(t.toFixed(2), lat.toFixed(4), lng.toFixed(4), gs.map((g) => String(sampleGrid(g, lat, lng))).join(' '));
  }
}
main();
