/**
 * Mapa de custo sobre a área de Jezero.
 *
 * Fatores por célula (independentes de perfil) ficam em cache por MapData. Cada perfil gera um
 * campo de custo: fator = 1 + wSlope·(s/slopeWarn)² + wHazard·hazard + wClear·folga(300 m) + wCold·frio(tod) + wHeat·calor(tod)
 *                     − wTrack·trackProximity (+ penalidade sem dado).
 * Inclinação > slopeMaxDeg ou perigo 'avoid' = BLOQUEADO (fator muito alto, mas finito: se for o
 * único caminho, o A* ainda passa por ali).
 * Custo de um passo = comprimento do passo (m) × média dos fatores das duas células.
 */
import { JEZERO_BOUNDS } from '@/config/mission';
import { suitConfig } from '@/config/suit';
import {
  DEG, M_PER_DEG, cellCenter, distPointSegXY, hazardDistXY, isPlaceholderGrid, makeProj,
  projectHazards, sampleGrid, toXY, type GridSpec, type HazardShape, type LocalProj,
} from './geo';
import type { GeoBounds, MapData, TimeOfDay } from './types';

export const DEFAULT_COLS = 200;
export const MAX_COLS = 320;
/** Raio de influência de um perigo (m): alerta e custo decaem até aqui. */
export const HAZARD_BUFFER_M = 150;
/** Folga desejada dos perigos (m): o perfil seguro paga para ficar além disso. */
export const CLEARANCE_BUFFER_M = 300;
/** Raio de influência da trilha do Perseverance quando não há grade trackProximity (m). */
export const TRACK_BUFFER_M = 200;
export const BLOCKED_FACTOR = 500;

export interface CostFeatures extends GridSpec {
  bounds: GeoBounds;
  cellWM: number;
  cellHM: number;
  proj: LocalProj;
  /** graus; NaN = sem dado */
  slope: Float32Array;
  tempDay: Float32Array;
  tempNight: Float32Array;
  /** 0..1 */
  hazard: Float32Array;
  /** 0..1: 1 = dentro/encostado num perigo, 0 = a >= CLEARANCE_BUFFER_M */
  clearance: Float32Array;
  track: Float32Array;
  /** 1 = intransponível */
  blocked: Uint8Array;
  hazardShapes: HazardShape[];
  slopePlaceholder: boolean;
}

export interface ProfileWeights {
  wSlope: number;
  wHazard: number;
  /** custo extra para ficar a < CLEARANCE_BUFFER_M de qualquer perigo (folga). */
  wClear: number;
  wCold: number;
  wHeat: number;
  wTrack: number;
  nodataPenalty: number;
}

export interface CostField {
  cost: Float32Array;
  minFactor: number;
}

const cache = new WeakMap<MapData, CostFeatures>();

/** Fatores da grade (com cache por objeto MapData). */
export function getFeatures(data: MapData): CostFeatures {
  let f = cache.get(data);
  if (!f) {
    f = buildFeatures(data);
    cache.set(data, f);
  }
  return f;
}

function chooseSpec(data: MapData): { width: number; height: number; bounds: GeoBounds } {
  const s = data.grids.slope;
  if (s && !isPlaceholderGrid(s)) {
    if (s.width <= MAX_COLS) return { width: s.width, height: s.height, bounds: { ...s.bounds } };
    const k = s.width / MAX_COLS;
    return { width: MAX_COLS, height: Math.max(1, Math.round(s.height / k)), bounds: { ...s.bounds } };
  }
  const b = { ...JEZERO_BOUNDS };
  const latMid = (b.north + b.south) / 2;
  const wM = (b.east - b.west) * M_PER_DEG * Math.cos(latMid * DEG);
  const hM = (b.north - b.south) * M_PER_DEG;
  return { width: DEFAULT_COLS, height: Math.max(1, Math.round((DEFAULT_COLS * hM) / wM)), bounds: b };
}

export function buildFeatures(data: MapData): CostFeatures {
  const { width, height, bounds } = chooseSpec(data);
  const n = width * height;
  const latMid = (bounds.north + bounds.south) / 2;
  const lngMid = (bounds.east + bounds.west) / 2;
  const proj = makeProj(latMid, lngMid);
  const cellWM = ((bounds.east - bounds.west) / width) * proj.kx;
  const cellHM = ((bounds.north - bounds.south) / height) * proj.ky;
  const spec: GridSpec = { width, height, bounds };

  const slope = new Float32Array(n);
  const tempDay = new Float32Array(n);
  const tempNight = new Float32Array(n);
  const hazard = new Float32Array(n);
  const clearance = new Float32Array(n);
  const track = new Float32Array(n);
  const blocked = new Uint8Array(n);
  const g = data.grids;
  const hasTrackGrid = !isPlaceholderGrid(g.trackProximity);
  const hasHazardGrid = !isPlaceholderGrid(g.hazard);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      const { lat, lng } = cellCenter(spec, r, c);
      const s = sampleGrid(g.slope, lat, lng);
      slope[i] = s ?? NaN;
      tempDay[i] = sampleGrid(g.tempDay, lat, lng) ?? NaN;
      tempNight[i] = sampleGrid(g.tempNight, lat, lng) ?? NaN;
      if (hasHazardGrid) hazard[i] = clamp01(sampleGrid(g.hazard, lat, lng) ?? 0);
      if (hasTrackGrid) track[i] = clamp01(sampleGrid(g.trackProximity, lat, lng) ?? 0);
      if (s !== null && s > suitConfig.slopeMaxDeg) blocked[i] = 1;
    }
  }

  // Perigos vetoriais: rasteriza só a bbox (+buffer) de cada um.
  const hazardShapes = projectHazards(data.hazards ?? [], proj);
  const north = bounds.north;
  const west = bounds.west;
  const dLat = (bounds.north - bounds.south) / height;
  const dLng = (bounds.east - bounds.west) / width;
  const rangeOf = (minX: number, minY: number, maxX: number, maxY: number, buf: number) => {
    const lngMin = proj.lng0 + (minX - buf) / proj.kx;
    const lngMax = proj.lng0 + (maxX + buf) / proj.kx;
    const latMin = proj.lat0 + (minY - buf) / proj.ky;
    const latMax = proj.lat0 + (maxY + buf) / proj.ky;
    return {
      c0: Math.max(0, Math.floor((lngMin - west) / dLng)),
      c1: Math.min(width - 1, Math.floor((lngMax - west) / dLng)),
      r0: Math.max(0, Math.floor((north - latMax) / dLat)),
      r1: Math.min(height - 1, Math.floor((north - latMin) / dLat)),
    };
  };
  const cellXY = (r: number, c: number) => toXY(proj, north - (r + 0.5) * dLat, west + (c + 0.5) * dLng);

  for (const sh of hazardShapes) {
    const avoid = sh.hazard.severity === 'avoid';
    const { r0, r1, c0, c1 } = rangeOf(sh.minX, sh.minY, sh.maxX, sh.maxY, CLEARANCE_BUFFER_M);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const [x, y] = cellXY(r, c);
        const d = hazardDistXY(sh, x, y);
        if (d > CLEARANCE_BUFFER_M) continue;
        const i = r * width + c;
        const cl = 1 - d / CLEARANCE_BUFFER_M;
        if (cl > clearance[i]) clearance[i] = cl;
        if (d > HAZARD_BUFFER_M) continue;
        let v: number;
        if (d === 0) {
          v = avoid ? 1 : 0.8;
          if (avoid) blocked[i] = 1;
        } else {
          v = (avoid ? 0.6 : 0.4) * (1 - d / HAZARD_BUFFER_M);
        }
        if (v > hazard[i]) hazard[i] = v;
      }
    }
  }

  // Trilha do Perseverance vetorial (se não houver grade).
  const tr = data.perseveranceTrack ?? [];
  if (!hasTrackGrid && tr.length >= 2) {
    const pts = tr.map(([lat, lng]) => toXY(proj, lat, lng));
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1];
      const [bx, by] = pts[k];
      const { r0, r1, c0, c1 } = rangeOf(
        Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), TRACK_BUFFER_M,
      );
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const [x, y] = cellXY(r, c);
          const d = distPointSegXY(x, y, ax, ay, bx, by);
          if (d > TRACK_BUFFER_M) continue;
          const v = 1 - d / TRACK_BUFFER_M;
          const i = r * width + c;
          if (v > track[i]) track[i] = v;
        }
      }
    }
  }

  return {
    width, height, bounds, cellWM, cellHM, proj, slope, tempDay, tempNight, hazard, clearance, track, blocked,
    hazardShapes, slopePlaceholder: isPlaceholderGrid(g.slope),
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 0 longe do limite, 1 no limite mínimo do traje, até 1.5 abaixo. */
export function coldness(tempC: number): number {
  const v = (suitConfig.minSurfaceTempC + 25 - tempC) / 25;
  return v < 0 ? 0 : v > 1.5 ? 1.5 : v;
}
export function heatness(tempC: number): number {
  const v = (tempC - (suitConfig.maxSurfaceTempC - 10)) / 10;
  return v < 0 ? 0 : v > 1.5 ? 1.5 : v;
}

/** Campo de custo por perfil. extraPenalty (opcional) multiplica o fator de células específicas. */
export function buildCostField(
  f: CostFeatures, w: ProfileWeights, tod: TimeOfDay, extraPenalty?: Float32Array,
): CostField {
  const n = f.width * f.height;
  const cost = new Float32Array(n);
  const temp = tod === 'day' ? f.tempDay : f.tempNight;
  let minFactor = Infinity;
  const warn = suitConfig.slopeWarnDeg;
  // Frio/calor relativos ao mínimo da área: se a noite toda é gelada, isso não deve empurrar a
  // rota para perigos em troca de 1-2 °C (o alerta de frio continua absoluto).
  let minCold = Infinity;
  let minHeat = Infinity;
  for (let i = 0; i < n; i++) {
    const t = temp[i];
    if (Number.isNaN(t)) continue;
    const c = coldness(t);
    const h = heatness(t);
    if (c < minCold) minCold = c;
    if (h < minHeat) minHeat = h;
  }
  if (!Number.isFinite(minCold)) minCold = 0;
  if (!Number.isFinite(minHeat)) minHeat = 0;
  for (let i = 0; i < n; i++) {
    let fac: number;
    if (f.blocked[i]) {
      fac = BLOCKED_FACTOR;
    } else {
      fac = 1;
      const s = f.slope[i];
      if (Number.isNaN(s)) fac += w.nodataPenalty;
      else fac += w.wSlope * (s / warn) * (s / warn);
      fac += w.wHazard * f.hazard[i] + w.wClear * f.clearance[i];
      const t = temp[i];
      if (!Number.isNaN(t)) fac += w.wCold * (coldness(t) - minCold) + w.wHeat * (heatness(t) - minHeat);
      fac -= w.wTrack * f.track[i];
      if (fac < 0.2) fac = 0.2;
    }
    if (extraPenalty) fac *= extraPenalty[i] || 1;
    cost[i] = fac;
    if (fac < minFactor) minFactor = fac;
  }
  return { cost, minFactor: Number.isFinite(minFactor) ? minFactor : 1 };
}
