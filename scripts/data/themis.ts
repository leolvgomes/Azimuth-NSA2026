/**
 * THEMIS IR day / night (Mars Trek controlled mosaics, 100 m) → tempDay.json / tempNight.json.
 * The Trek tiles are 8-bit brightness images, NOT calibrated temperatures. We map brightness
 * linearly (2nd..98th percentile inside Jezero) to a plausible surface-temperature range:
 *   day   ~ -50 .. +5 °C   (afternoon, ~15:00-17:00 LTST)
 *   night ~ -95 .. -70 °C  (pre-dawn, ~04:00 LTST)
 * Relative pattern is real (bright = warmer); absolute values are approximate.
 */
import { BOUNDS, GRID_H, GRID_W, cellCenter, makeGrid, round, writeJson } from './lib';
import { greyMosaic, trekTemplate } from './trek';

export const THEMIS_DAY = 'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018';
export const THEMIS_NIGHT = 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018';
const Z = 9; // ~81 m/px at Jezero, max native zoom of these layers

async function brightnessGrid(layer: string) {
  const m = await greyMosaic(trekTemplate(layer, 'png'), layer, BOUNDS, Z);
  const dLat = (BOUNDS.north - BOUNDS.south) / GRID_H / 4;
  const dLng = (BOUNDS.east - BOUNDS.west) / GRID_W / 4;
  const out: (number | null)[] = [];
  for (let r = 0; r < GRID_H; r++)
    for (let c = 0; c < GRID_W; c++) {
      const { lat, lng } = cellCenter(r, c);
      let s = 0, n = 0;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const v = m.sample(lat + a * dLat, lng + b * dLng);
        if (v !== null) { s += v; n++; }
      }
      out.push(n ? s / n : null);
    }
  return out;
}

function toTemp(br: (number | null)[], lo: number, hi: number) {
  const vals = br.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const p2 = vals[Math.floor(vals.length * 0.02)], p98 = vals[Math.floor(vals.length * 0.98)];
  const data = br.map((v) => {
    if (v === null) return -9999;
    const t = Math.max(0, Math.min(1, (v - p2) / (p98 - p2)));
    return round(lo + t * (hi - lo), 1);
  });
  return { data, p2, p98, missing: br.filter((v) => v === null).length };
}

export async function buildThemis() {
  console.log('[themis] day/night tiles z' + Z);
  const day = toTemp(await brightnessGrid(THEMIS_DAY), -50, 5);
  const night = toTemp(await brightnessGrid(THEMIS_NIGHT), -95, -70);
  console.log(`  day brightness p2..p98 ${day.p2.toFixed(0)}..${day.p98.toFixed(0)} (missing ${day.missing}); night ${night.p2.toFixed(0)}..${night.p98.toFixed(0)} (missing ${night.missing})`);
  const note = 'Mars Trek THEMIS IR controlled mosaic 100 m (8-bit brightness), linear map of p2..p98 brightness to';
  await writeJson('grids/tempDay.json', makeGrid('tempDay', 'degC', day.data, `${note} -50..+5 °C (afternoon). Approximate, not calibrated.`, true));
  await writeJson('grids/tempNight.json', makeGrid('tempNight', 'degC', night.data, `${note} -95..-70 °C (pre-dawn). Approximate, not calibrated.`, true));
}

if (require.main === module) buildThemis().catch((e) => { console.error(e); process.exit(1); });
