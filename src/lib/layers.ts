/**
 * Camadas de visualização do mapa. Lidas de public/data/layers.json (gerado pelo map-data):
 *   [{ id, label, sublabel, url, type: 'wmts'|'wms'|'image', attribution, maxNativeZoom, opacity, verified, remoteUrl? }]
 * Enquanto o arquivo não existir, usa as URLs do Mars Trek abaixo (EPSG4326, zoom 0 = 2×1 tiles).
 * Os toggles do painel são GRUPOS (Óptica, Relevo, Térmica...) que ligam as camadas que casam com eles.
 */

export type LayerType = 'wmts' | 'wms' | 'image';

export interface LayerDef {
  id: string;
  label: string;
  sublabel?: string;
  url: string;
  type: LayerType;
  attribution?: string;
  maxNativeZoom?: number;
  opacity?: number;
  verified?: boolean;
  remoteUrl?: string;
  /** WMS */
  layers?: string;
  format?: string;
  /** image */
  bounds?: [[number, number], [number, number]];
}

export type LayerGroupId = 'optical' | 'relief' | 'thermal' | 'mineral' | 'geology' | 'hazards' | 'rovers';

export interface LayerGroup {
  id: LayerGroupId;
  label: string;
  sublabel: string;
  defaultOn: boolean;
}

export const LAYER_GROUPS: LayerGroup[] = [
  { id: 'optical', label: 'Óptica', sublabel: 'CTX · 6 M/PX', defaultOn: true },
  { id: 'relief', label: 'Relevo', sublabel: 'MOLA · HILLSHADE', defaultOn: false },
  { id: 'thermal', label: 'Térmica', sublabel: 'THEMIS IR', defaultOn: false },
  { id: 'mineral', label: 'Mineral', sublabel: 'CRISM · CARBONATOS', defaultOn: false },
  { id: 'geology', label: 'Geologia', sublabel: 'USGS · UNIDADES', defaultOn: false },
  { id: 'hazards', label: 'Perigos', sublabel: 'CANAIS · BRECHA · DUNAS', defaultOn: true },
  { id: 'rovers', label: 'Rovers', sublabel: 'TRILHA + FOTOS', defaultOn: true },
];

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ';
const TM = '1.0.0/default/default028mm/{z}/{y}/{x}';

export const VIKING_FALLBACK: LayerDef = {
  id: 'viking',
  label: 'Viking global',
  sublabel: 'VIKING MDIM 2.1 · 232 M/PX',
  url: `${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/${TM}.jpg`,
  type: 'wmts',
  attribution: 'NASA/JPL-Caltech/USGS · Mars Trek',
  maxNativeZoom: 7,
  opacity: 1,
  verified: false,
};

/** Fallback mínimo enquanto layers.json não existe (não verificado: se a tile falhar, fica transparente). */
export const FALLBACK_LAYERS: LayerDef[] = [
  VIKING_FALLBACK,
  {
    id: 'mola-hillshade',
    label: 'Relevo',
    sublabel: 'MOLA · HILLSHADE',
    url: `${TREK}/Mars_MGS_MOLA_ClrShade_merge_global_463m/${TM}.jpg`,
    type: 'wmts',
    attribution: 'NASA/JPL-Caltech/GSFC · MOLA',
    maxNativeZoom: 7,
    opacity: 0.55,
    verified: false,
  },
  {
    id: 'themis-day',
    label: 'Térmica dia',
    sublabel: 'THEMIS IR DIA',
    url: `${TREK}/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12/${TM}.png`,
    type: 'wmts',
    attribution: 'NASA/JPL-Caltech/ASU · THEMIS',
    maxNativeZoom: 9,
    opacity: 0.6,
    verified: false,
  },
  {
    id: 'themis-night',
    label: 'Térmica noite',
    sublabel: 'THEMIS IR NOITE',
    url: `${TREK}/Mars_MO_THEMIS-IR-Night_mosaic_60N60S_100m_v14/${TM}.png`,
    type: 'wmts',
    attribution: 'NASA/JPL-Caltech/ASU · THEMIS',
    maxNativeZoom: 9,
    opacity: 0.6,
    verified: false,
  },
];

/** Em que grupo do painel cada camada entra (pelo id, depois label). 'base' = mosaico global (Viking). */
export function groupOf(l: LayerDef): LayerGroupId | 'base' | null {
  const s = `${l.id} ${l.label}`.toLowerCase();
  if (/viking/.test(s)) return 'base';
  if (/ctx|hirise|optic|óptic/.test(s)) return 'optical';
  if (/crism|mineral|carbon/.test(s)) return 'mineral';
  if (/themis|thermal|térm/.test(s)) return 'thermal';
  if (/mola|relief|relevo|hillshade|elev|dtm|topo/.test(s)) return 'relief';
  if (/geolog|usgs|(^|[^a-z])geo([^a-z]|$)/.test(s)) return 'geology';
  return null;
}

/** Uma camada por grupo (evita empilhar 4 relevos): prefere arquivo local, depois verificada, depois a ordem. */
export function pickLayer(layers: LayerDef[], group: LayerGroupId, tod: 'day' | 'night'): LayerDef | null {
  const prefer: Partial<Record<LayerGroupId, RegExp>> = { relief: /hillshade|sombread/i };
  let c = layers.filter((l) => groupOf(l) === group);
  if (group === 'thermal') {
    const exact = c.filter((l) => thermalTimeOf(l) === tod);
    c = exact.length ? exact : c.filter((l) => thermalTimeOf(l) === null);
  }
  if (!c.length) return null;
  const score = (l: LayerDef) =>
    (l.url.startsWith('/') ? 4 : 0) + (l.verified ? 2 : 0) + (prefer[group]?.test(`${l.id} ${l.label}`) ? 8 : 0);
  return [...c].sort((a, b) => score(b) - score(a))[0];
}

/** Para camadas térmicas: 'day' | 'night' | null (vale para os dois). */
export function thermalTimeOf(l: LayerDef): 'day' | 'night' | null {
  const s = `${l.id} ${l.label} ${l.sublabel ?? ''}`.toLowerCase();
  if (/night|noite/.test(s)) return 'night';
  if (/day|dia/.test(s)) return 'day';
  return null;
}

function normalize(raw: unknown): LayerDef[] | null {
  const arr = Array.isArray(raw) ? raw : (raw as { layers?: unknown })?.layers;
  if (!Array.isArray(arr)) return null;
  const out: LayerDef[] = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.url !== 'string') continue;
    const type = (o.type === 'wms' || o.type === 'image' ? o.type : 'wmts') as LayerType;
    out.push({
      id: o.id,
      label: typeof o.label === 'string' ? o.label : o.id,
      sublabel: typeof o.sublabel === 'string' ? o.sublabel : undefined,
      url: o.url,
      type,
      attribution: typeof o.attribution === 'string' ? o.attribution : undefined,
      maxNativeZoom: typeof o.maxNativeZoom === 'number' ? o.maxNativeZoom : undefined,
      opacity: typeof o.opacity === 'number' ? o.opacity : undefined,
      verified: o.verified === true,
      remoteUrl: typeof o.remoteUrl === 'string' ? o.remoteUrl : undefined,
      layers: typeof o.layers === 'string' ? o.layers : undefined,
      format: typeof o.format === 'string' ? o.format : undefined,
      bounds: Array.isArray(o.bounds) ? (o.bounds as LayerDef['bounds']) : undefined,
    });
  }
  return out.length ? out : null;
}

let cache: Promise<{ layers: LayerDef[]; fromFile: boolean }> | null = null;

export function loadLayers(): Promise<{ layers: LayerDef[]; fromFile: boolean }> {
  if (!cache) {
    cache = fetch('/data/layers.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((raw) => {
        const layers = normalize(raw);
        if (!layers) return { layers: FALLBACK_LAYERS, fromFile: false };
        // garante uma base global mesmo se o arquivo não tiver uma
        const hasBase = layers.some((l) => groupOf(l) === 'base');
        return { layers: hasBase ? layers : [VIKING_FALLBACK, ...layers], fromFile: true };
      });
  }
  return cache;
}

/** Primeiro caminho que responde (HEAD), ou null. Para o CTX full → preview. */
export async function firstAvailable(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      const r = await fetch(p, { method: 'HEAD' });
      if (r.ok) return p;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}
