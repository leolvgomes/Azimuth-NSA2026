/**
 * Hand-curated vectors for Jezero → hazards.json, landmarks.json, shelters.json.
 * Coordinates come from (a) Perseverance localized waypoints (NASA/JPL MMGIS M20_waypoints.json),
 * (b) features digitized on the USGS CTX orthomosaic (full-res pixel coords, converted below),
 * (c) the USGS CTX DTM. Each item carries its `source`.
 */
import { BOUNDS, DEG_M, round, writeJson } from './lib';
import { BASE } from '../../src/config/mission';
import type { Hazard, Landmark, Shelter } from '../../src/core/types';

// CTX orthomosaic full-res grid (5322 x 5040 px) → lat/lng
const CTX_W = 5322, CTX_H = 5040;
export function ctx(px: number, py: number): [number, number] {
  return [
    round(BOUNDS.north - (py / CTX_H) * (BOUNDS.north - BOUNDS.south), 5),
    round(BOUNDS.west + (px / CTX_W) * (BOUNDS.east - BOUNDS.west), 5),
  ];
}
const line = (pts: [number, number][]) => pts.map(([x, y]) => ctx(x, y));

/** Buffer a polyline ([lat,lng][]) into a closed polygon of half-width `halfM` metres. */
export function bufferLine(pts: [number, number][], halfM: number): [number, number][] {
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  const xy = pts.map(([lat, lng]) => [lng * k * DEG_M, lat * DEG_M]);
  const left: number[][] = [], right: number[][] = [];
  for (let i = 0; i < xy.length; i++) {
    const a = xy[Math.max(0, i - 1)], b = xy[Math.min(xy.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    left.push([xy[i][0] + nx * halfM, xy[i][1] + ny * halfM]);
    right.push([xy[i][0] - nx * halfM, xy[i][1] - ny * halfM]);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]);
  return ring.map(([x, y]) => [round(y / DEG_M, 5), round(x / (k * DEG_M), 5)]);
}

const SRC_CTX = 'Digitized on USGS Mars 2020 TRN CTX orthomosaic 6 m (JEZ_ctx_B_soc_008); approximate outline';
const SRC_WP = 'NASA/JPL-Caltech Perseverance localized waypoints (MMGIS M20_waypoints.json)';

// --- key polylines (CTX full-res pixel coords) ---
const NERETVA = line([[0, 1128], [160, 1140], [320, 1200], [480, 1272], [640, 1320], [820, 1352], [872, 1409], [820, 1541], [768, 1681]]);
const BREACH = line([[768, 1681], [780, 1841], [860, 2001], [980, 2141], [1100, 2241]]);
const WEST_RIM = line([[1140, 2400], [1100, 2800], [1060, 3200], [1080, 3600], [1140, 4000], [1200, 4400], [1240, 5040]]);
const DELTA_SCARP = line([
  [2340, 2630], [2380, 2617], [2433, 2603], [2500, 2597], [2553, 2583], [2587, 2550], [2613, 2503], [2633, 2450],
  [2673, 2410], [2733, 2370], [2712, 2252], [2728, 2124], [2688, 2028], [2600, 1884], [2552, 1788],
]);
const FLOOR_TROUGH = line([[2553, 2683], [2613, 2670], [2673, 2660], [2727, 2630], [2767, 2577], [2793, 2530], [2833, 2510]]);
const SEITAH: [number, number][] = [
  [18.44, 77.42], [18.438, 77.44], [18.432, 77.446], [18.42, 77.445], [18.41, 77.435],
  [18.408, 77.415], [18.418, 77.405], [18.432, 77.408], [18.44, 77.42],
];

export const HAZARDS: Hazard[] = [
  {
    id: 'neretva-vallis', name: 'Neretva Vallis (canal de entrada)', kind: 'channel', severity: 'avoid',
    polygon: bufferLine(NERETVA, 450),
    advice: 'Não desça no leito do vale: paredes íngremes e areia fina; atravesse só por uma rampa mapeada.',
    source: `${SRC_CTX}; valley walls confirmed by CTX DTM slope`,
  },
  {
    id: 'western-breach', name: 'Brecha oeste (Neretva corta a borda)', kind: 'breach', severity: 'avoid',
    polygon: bufferLine(BREACH, 400),
    advice: 'Passagem estreita entre paredes da borda: evite, risco de queda e deslizamento.',
    source: `${SRC_CTX}; inlet breach where Neretva Vallis cuts the western rim`,
  },
  {
    id: 'west-rim', name: 'Borda oeste da cratera Jezero', kind: 'rim', severity: 'caution',
    polygon: bufferLine(WEST_RIM, 1000),
    advice: 'Terreno alto e acidentado com encostas >15°: suba só com rota planejada e reserva de O₂.',
    source: `${SRC_CTX}; rim location from CTX DTM elevation/slope`,
  },
  {
    id: 'delta-front-scarp', name: 'Escarpa da frente do delta', kind: 'scarp', severity: 'caution',
    polygon: bufferLine(DELTA_SCARP, 120),
    advice: 'Escarpa de dezenas de metros: aproxime-se pela base e suba só por uma rampa (ex.: Hawksbill Gap).',
    source: `${SRC_CTX}; scarp traced along the eastern/southern delta front, steepness from CTX DTM`,
  },
  {
    id: 'floor-trough', name: 'Canal sinuoso no assoalho (pré-delta)', kind: 'channel', severity: 'caution',
    polygon: bufferLine(FLOOR_TROUGH, 90),
    advice: 'Depressão rasa com borda irregular: cruze em ângulo reto e devagar, sem pisar na borda.',
    source: `${SRC_CTX}; sinuous trough/contact on the crater floor between landing site and delta (interpretation approximate)`,
  },
  {
    id: 'seitah', name: 'Séítah (dunas e cristas)', kind: 'dune', severity: 'caution',
    polygon: SEITAH,
    advice: 'Areia solta entre cristas rochosas: contorne pela borda leste, como fez o Perseverance.',
    source: `Approximate outline from Perseverance traverse (sols 180-380 skirted Séítah's east edge) and CTX texture`,
  },
  {
    id: 'seitah-dunes', name: 'Campo de dunas de Séítah', kind: 'dune', severity: 'avoid',
    center: { lat: 18.422, lng: 77.425 }, radiusM: 900,
    advice: 'Dunas de areia fina: risco de atolar; não atravesse a pé.',
    source: 'Approximate; Séítah dune/ripple field (NASA/JPL Perseverance mission reports), placed on CTX texture',
  },
  {
    id: 'belva-crater', name: 'Cratera Belva', kind: 'crater', severity: 'avoid',
    center: { lat: 18.4835, lng: 77.3783 }, radiusM: 500,
    advice: 'Paredes internas íngremes: observe da borda sul, não desça.',
    source: `${SRC_CTX}; ~1 km crater on the delta top, Perseverance studied its south rim ~sol 760`,
  },
  {
    id: 'floor-crater-n', name: 'Cratera pequena ao norte da base', kind: 'crater', severity: 'caution',
    center: { lat: ctx(2770, 2607)[0], lng: ctx(2770, 2607)[1] }, radiusM: 160,
    advice: 'Pequena cratera de impacto: contorne pela borda.',
    source: SRC_CTX,
  },
];

const [dLat, dLng] = ctx(2001, 2161);
const [nLat, nLng] = ctx(480, 1272);
const [bLat, bLng] = ctx(860, 2001);
const [kLat, kLng] = ctx(2447, 2783);
const [rLat, rLng] = ctx(1080, 3600);

export const DEMO_TARGET_REAL = { lat: 18.4571, lng: 77.4088 }; // Hawksbill Gap base, rover sol 437

export const LANDMARKS: Landmark[] = [
  { id: 'octavia-e-butler-landing', name: 'Octavia E. Butler Landing', lat: BASE.lat, lng: BASE.lng, kind: 'landing',
    description: 'Local de pouso do Perseverance (18 fev 2021). Base e abrigo da missão.', source: `${SRC_WP} (sol 13: 18.44463, 77.45089)` },
  { id: 'jezero-delta', name: 'Delta de Jezero', lat: dLat, lng: dLng, kind: 'delta',
    description: 'Delta em leque formado por um rio que desaguava no antigo lago da cratera; alvo principal de amostras.', source: SRC_CTX },
  { id: 'delta-front', name: 'Frente do delta (Hawksbill Gap)', lat: DEMO_TARGET_REAL.lat, lng: DEMO_TARGET_REAL.lng, kind: 'delta',
    description: 'Base da rampa por onde o Perseverance subiu a frente do delta (sols 437-470). Destino do demo.', source: `${SRC_WP} (sol 437)` },
  { id: 'enchanted-lake', name: 'Enchanted Lake', lat: 18.4494, lng: 77.4052, kind: 'poi',
    description: 'Afloramento na base da escarpa do delta, primeira parada do rover na frente do delta (~sol 415).', source: `${SRC_WP} (sol 415)` },
  { id: 'three-forks', name: 'Depósito Three Forks', lat: 18.4514, lng: 77.4013, kind: 'poi',
    description: 'Onde o Perseverance deixou 10 tubos de amostras para uma futura missão de retorno (sols 586-653).', source: `${SRC_WP} (sols 592-632)` },
  { id: 'neretva-vallis', name: 'Neretva Vallis', lat: nLat, lng: nLng, kind: 'channel',
    description: 'Vale do antigo rio que alimentava o lago de Jezero, entrando pelo oeste.', source: SRC_CTX },
  { id: 'western-breach', name: 'Brecha oeste', lat: bLat, lng: bLng, kind: 'breach',
    description: 'Onde Neretva Vallis rompe a borda da cratera; paredes íngremes.', source: SRC_CTX },
  { id: 'belva', name: 'Cratera Belva', lat: 18.4835, lng: 77.3783, kind: 'crater',
    description: 'Cratera de ~1 km no topo do delta que expõe camadas do delta.', source: SRC_CTX },
  { id: 'seitah', name: 'Séítah', lat: 18.424, lng: 77.427, kind: 'unit',
    description: 'Unidade com cristas rochosas (olivina) e dunas de areia, a sudoeste do pouso. Explorada pela borda.', source: 'Approximate centre; NASA/JPL Perseverance mission reports + CTX' },
  { id: 'maaz', name: 'Máaz', lat: 18.447, lng: 77.462, kind: 'unit',
    description: 'Formação do assoalho da cratera ao redor do pouso: rochas vulcânicas planas, terreno bom para caminhar.', source: 'Approximate label position; NASA/JPL Perseverance mission reports' },
  { id: 'kodiak', name: 'Kodiak', lat: kLat, lng: kLng, kind: 'poi',
    description: 'Morro testemunho (butte) remanescente do delta, ~2 km a sudoeste da frente do delta.', source: `${SRC_CTX}; identification approximate` },
  { id: 'west-rim', name: 'Borda oeste de Jezero', lat: rLat, lng: rLng, kind: 'crater',
    description: 'Borda da cratera (45 km de diâmetro), ~600 m acima do assoalho.', source: `${SRC_CTX} + CTX DTM` },
];

export const SHELTERS: Shelter[] = [{ id: BASE.id, name: BASE.name, lat: BASE.lat, lng: BASE.lng }];

export async function buildVectors() {
  console.log('[vectors] hazards / landmarks / shelters');
  await writeJson('hazards.json', HAZARDS, true);
  await writeJson('landmarks.json', LANDMARKS, true);
  await writeJson('shelters.json', SHELTERS, true);
}

if (require.main === module) buildVectors().catch((e) => { console.error(e); process.exit(1); });
