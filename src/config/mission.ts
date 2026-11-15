/**
 * Geografia da missão. Valores conferidos no GeoTIFF do CTX
 * (JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif, Mars 2000 sphere R=3396190 m).
 */
export const MARS_RADIUS_M = 3_396_190;

export const JEZERO_BOUNDS = {
  south: 18.211,
  west: 77.1605,
  north: 18.7212,
  east: 77.6992,
} as const;

/** Leaflet-style [[south, west], [north, east]] */
export const JEZERO_LEAFLET_BOUNDS: [[number, number], [number, number]] = [
  [JEZERO_BOUNDS.south, JEZERO_BOUNDS.west],
  [JEZERO_BOUNDS.north, JEZERO_BOUNDS.east],
];

export const JEZERO_CENTER = { lat: 18.466, lng: 77.43 } as const;

/** Base / abrigo: local de pouso do Perseverance (Octavia E. Butler Landing). */
export const BASE = {
  id: 'base',
  name: 'Base · Octavia E. Butler Landing',
  lat: 18.4447,
  lng: 77.4508,
} as const;

/**
 * Destino da história do demo: frente do delta, base da rampa por onde o Perseverance subiu
 * (Hawksbill Gap, waypoint sol 437, −2540 m). 2,47 km em linha reta da base.
 */
export const DEMO_TARGET = {
  id: 'delta-front',
  name: 'Frente do delta (Hawksbill Gap)',
  lat: 18.4571,
  lng: 77.4088,
} as const;

/** Lugares que o astronauta (ou a Azimuth) pode pedir pelo nome. Coordenadas em public/data/landmarks.json. */
export const NAMED_PLACES: Record<string, { lat: number; lng: number; label: string }> = {
  base: { lat: BASE.lat, lng: BASE.lng, label: 'Base' },
  delta: { lat: DEMO_TARGET.lat, lng: DEMO_TARGET.lng, label: 'Frente do delta' },
  'three-forks': { lat: 18.4514, lng: 77.4013, label: 'Three Forks' },
  'enchanted-lake': { lat: 18.4494, lng: 77.4052, label: 'Enchanted Lake' },
  belva: { lat: 18.4835, lng: 77.3783, label: 'Cratera Belva' },
  seitah: { lat: 18.424, lng: 77.427, label: 'Séítah' },
  kodiak: { lat: 18.4395, lng: 77.4082, label: 'Kodiak' },
};
