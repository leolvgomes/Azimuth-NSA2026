/**
 * Carrega os dados estáticos gerados pelo agente map-data (public/data/**).
 * Funciona no navegador (fetch) e no servidor (fs), para a rota /api/azimuth.
 *
 * Arquivos esperados (formato em src/core/types.ts):
 *   public/data/grids/slope.json | tempDay.json | tempNight.json   (obrigatórios)
 *   public/data/grids/elevation.json | hazard.json | trackProximity.json (opcionais)
 *   public/data/hazards.json        Hazard[]
 *   public/data/landmarks.json      Landmark[]
 *   public/data/perseverance-track.json  [lat,lng][]
 *   public/data/photos.json         RoverPhoto[]
 *   public/data/shelters.json       Shelter[]
 *   public/data/science-targets.json ScienceTarget[] (opcional)
 * Se um arquivo faltar, cai num valor neutro e o core gera alerta 'no-data'.
 */
import { BASE, JEZERO_BOUNDS } from '@/config/mission';
import type { Grid, Hazard, Landmark, MapData, RoverPhoto, ScienceTarget, Shelter } from '@/core/types';

type Reader = (path: string) => Promise<unknown | null>;

const browserReader: Reader = async (path) => {
  try {
    const r = await fetch(`/data/${path}`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

async function serverReader(path: string): Promise<unknown | null> {
  try {
    // webpackIgnore: o bundle do navegador não tenta resolver 'node:*' (só roda no servidor).
    const { readFile } = (await import(/* webpackIgnore: true */ 'node:fs/promises')) as typeof import('node:fs/promises');
    const { join } = (await import(/* webpackIgnore: true */ 'node:path')) as typeof import('node:path');
    const txt = await readFile(join(process.cwd(), 'public', 'data', path), 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function flatGrid(name: string, unit: string, value: number): Grid {
  return {
    name, unit, width: 1, height: 1, bounds: { ...JEZERO_BOUNDS }, cellSizeM: 30000,
    nodata: -9999, data: [value], source: 'placeholder (sem dado)', approximate: true,
  };
}

let cache: Promise<MapData> | null = null;

export function loadMapData(): Promise<MapData> {
  if (!cache) cache = load(typeof window === 'undefined' ? serverReader : browserReader);
  return cache;
}

async function load(read: Reader): Promise<MapData> {
  const [slope, tempDay, tempNight, elevation, hazard, trackProximity, hazards, landmarks, track, photos, shelters, science] =
    await Promise.all([
      read('grids/slope.json'), read('grids/tempDay.json'), read('grids/tempNight.json'),
      read('grids/elevation.json'), read('grids/hazard.json'), read('grids/trackProximity.json'),
      read('hazards.json'), read('landmarks.json'), read('perseverance-track.json'),
      read('photos.json'), read('shelters.json'), read('science-targets.json'),
    ]);
  const baseShelter: Shelter = { id: BASE.id, name: BASE.name, lat: BASE.lat, lng: BASE.lng };
  return {
    grids: {
      slope: (slope as Grid) ?? flatGrid('slope', 'deg', 0),
      tempDay: (tempDay as Grid) ?? flatGrid('tempDay', 'degC', -20),
      tempNight: (tempNight as Grid) ?? flatGrid('tempNight', 'degC', -80),
      elevation: (elevation as Grid) ?? undefined,
      hazard: (hazard as Grid) ?? undefined,
      trackProximity: (trackProximity as Grid) ?? undefined,
    },
    hazards: (hazards as Hazard[]) ?? [],
    landmarks: (landmarks as Landmark[]) ?? [],
    perseveranceTrack: (track as [number, number][]) ?? [],
    photos: (photos as RoverPhoto[]) ?? [],
    shelters: (shelters as Shelter[])?.length ? (shelters as Shelter[]) : [baseShelter],
    scienceTargets: (science as ScienceTarget[]) ?? [],
  };
}

/** Amostra um Grid em lat/lng (vizinho mais próximo). Retorna null fora da área ou nodata. */
export function sampleGrid(g: Grid | undefined, lat: number, lng: number): number | null {
  if (!g) return null;
  const { south, west, north, east } = g.bounds;
  if (lat < south || lat > north || lng < west || lng > east) return null;
  const col = Math.min(g.width - 1, Math.floor(((lng - west) / (east - west)) * g.width));
  const row = Math.min(g.height - 1, Math.floor(((north - lat) / (north - south)) * g.height));
  const v = g.data[row * g.width + col];
  return v === g.nodata || v === undefined || Number.isNaN(v) ? null : v;
}
