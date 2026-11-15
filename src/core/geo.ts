/**
 * Geometria em Marte (esfera MARS_RADIUS_M) e utilidades de grade. Código puro.
 */
import { MARS_RADIUS_M } from '@/config/mission';
import type { GeoBounds, Grid, Hazard, LatLng } from './types';

export const DEG = Math.PI / 180;
/** metros por grau de latitude */
export const M_PER_DEG = MARS_RADIUS_M * DEG;

/** Distância de grande círculo (haversine) em metros. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Densifica uma polilinha: um ponto a cada <= stepM metros (mantém os vértices originais). */
export function densify(points: LatLng[], stepM = 50): LatLng[] {
  if (points.length === 0) return [];
  const out: LatLng[] = [{ lat: points[0].lat, lng: points[0].lng }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = distanceM(a, b);
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let k = 1; k <= n; k++) out.push(lerp(a, b, k / n));
  }
  return out;
}

/** Projeção local equirretangular (metros) em torno de lat0/lng0. Boa para ~50 km. */
export interface LocalProj {
  lat0: number;
  lng0: number;
  kx: number;
  ky: number;
}
export function makeProj(lat0: number, lng0: number): LocalProj {
  return { lat0, lng0, kx: M_PER_DEG * Math.cos(lat0 * DEG), ky: M_PER_DEG };
}
export function toXY(p: LocalProj, lat: number, lng: number): [number, number] {
  return [(lng - p.lng0) * p.kx, (lat - p.lat0) * p.ky];
}

export function pointInPolygonXY(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distPointSegXY(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** Hazard pré-projetado para consultas rápidas de distância. */
export interface HazardShape {
  hazard: Hazard;
  /** círculo */
  cx?: number;
  cy?: number;
  r?: number;
  /** polígono em XY */
  poly?: [number, number][];
  /** bbox XY */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function projectHazards(hazards: Hazard[], proj: LocalProj): HazardShape[] {
  const out: HazardShape[] = [];
  for (const h of hazards) {
    if (h.polygon && h.polygon.length >= 3) {
      const poly = h.polygon.map(([lat, lng]) => toXY(proj, lat, lng));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      out.push({ hazard: h, poly, minX, minY, maxX, maxY });
    } else if (h.center && typeof h.radiusM === 'number') {
      const [cx, cy] = toXY(proj, h.center.lat, h.center.lng);
      const r = h.radiusM;
      out.push({ hazard: h, cx, cy, r, minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r });
    }
  }
  return out;
}

/** Distância (m) do ponto XY até a borda do perigo; 0 se dentro. */
export function hazardDistXY(s: HazardShape, x: number, y: number): number {
  if (s.poly) {
    if (pointInPolygonXY(x, y, s.poly)) return 0;
    let best = Infinity;
    const p = s.poly;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const d = distPointSegXY(x, y, p[j][0], p[j][1], p[i][0], p[i][1]);
      if (d < best) best = d;
    }
    return best;
  }
  const dx = x - (s.cx as number);
  const dy = y - (s.cy as number);
  return Math.max(0, Math.sqrt(dx * dx + dy * dy) - (s.r as number));
}

/** Distância (m) de um ponto lat/lng até um perigo (0 = dentro). Infinity se o perigo não tem geometria. */
export function hazardDistanceM(h: Hazard, at: LatLng): number {
  const proj = makeProj(at.lat, at.lng);
  const [s] = projectHazards([h], proj);
  if (!s) return Infinity;
  return hazardDistXY(s, 0, 0);
}

/** Amostra um Grid (vizinho mais próximo). null fora da área ou nodata. */
export function sampleGrid(g: Grid | undefined, lat: number, lng: number): number | null {
  if (!g || !g.data || g.width < 1 || g.height < 1) return null;
  const { south, west, north, east } = g.bounds;
  if (lat < south || lat > north || lng < west || lng > east) return null;
  const col = Math.min(g.width - 1, Math.floor(((lng - west) / (east - west)) * g.width));
  const row = Math.min(g.height - 1, Math.floor(((north - lat) / (north - south)) * g.height));
  const v = g.data[row * g.width + col];
  return v === g.nodata || v === undefined || v === null || Number.isNaN(v) ? null : v;
}

/** Grade placeholder (1×1 de loadMapData) ou ausente = sem dado real. */
export function isPlaceholderGrid(g: Grid | undefined): boolean {
  return !g || g.width * g.height <= 1 || /placeholder/i.test(g.source ?? '');
}

/** Especificação geométrica de uma grade regular (linha 0 = norte, coluna 0 = oeste). */
export interface GridSpec {
  width: number;
  height: number;
  bounds: GeoBounds;
}

export function cellOf(spec: GridSpec, lat: number, lng: number): { row: number; col: number } {
  const { south, west, north, east } = spec.bounds;
  let col = Math.floor(((lng - west) / (east - west)) * spec.width);
  let row = Math.floor(((north - lat) / (north - south)) * spec.height);
  col = Math.max(0, Math.min(spec.width - 1, col));
  row = Math.max(0, Math.min(spec.height - 1, row));
  return { row, col };
}

export function cellCenter(spec: GridSpec, row: number, col: number): LatLng {
  const { south, west, north, east } = spec.bounds;
  return {
    lat: north - ((row + 0.5) / spec.height) * (north - south),
    lng: west + ((col + 0.5) / spec.width) * (east - west),
  };
}
