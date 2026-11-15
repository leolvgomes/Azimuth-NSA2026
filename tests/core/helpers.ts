import type { GeoBounds, Grid, Hazard, MapData, Shelter } from '@/core/types';

export const B: GeoBounds = { south: 18.4, west: 77.4, north: 18.45, east: 77.45 };

export function grid(name: string, w: number, h: number, fn: (r: number, c: number) => number, bounds = B): Grid {
  const data: number[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) data.push(fn(r, c));
  return { name, unit: '', width: w, height: h, bounds, cellSizeM: 30, nodata: -9999, data, source: `test ${name}` };
}

/** lat/lng do centro da célula (r,c) numa grade w×h sobre B. */
export function at(r: number, c: number, w = 100, h = 100, b = B) {
  return { lat: b.north - ((r + 0.5) / h) * (b.north - b.south), lng: b.west + ((c + 0.5) / w) * (b.east - b.west) };
}

export function mapData(opts: {
  w?: number; h?: number; slope?: (r: number, c: number) => number; day?: number; night?: number;
  hazards?: Hazard[]; shelters?: Shelter[];
} = {}): MapData {
  const w = opts.w ?? 100;
  const h = opts.h ?? 100;
  return {
    grids: {
      slope: grid('slope', w, h, opts.slope ?? (() => 2)),
      tempDay: grid('tempDay', w, h, () => opts.day ?? -20),
      tempNight: grid('tempNight', w, h, () => opts.night ?? -95),
      elevation: grid('elevation', w, h, (r) => -2500 + r),
    },
    hazards: opts.hazards ?? [],
    landmarks: [],
    perseveranceTrack: [],
    photos: [],
    shelters: opts.shelters ?? [{ id: 'base', name: 'Base', ...at(50, 5) }],
  };
}

export const fullSuit = { o2Pct: 100, batteryPct: 100, suitTempC: 18 };
