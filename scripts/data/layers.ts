/**
 * Visualization layers for the 2D map → public/data/layers.json.
 * Every WMTS URL comes from the layer's Mars Trek WMTSCapabilities.xml and is verified by
 * downloading one Jezero tile. Trek tile scheme = Leaflet L.CRS.EPSG4326 ({z}/{y}/{x}, z0 = 2x1).
 * Small layers are also cached locally under public/tiles/<id>/{z}/{y}/{x}.<ext> for an offline demo;
 * then `url` points to the local copy and `remoteUrl` keeps the Trek URL.
 */
import { join, dirname } from 'node:path';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { BOUNDS, ROOT, ensureDir, fetchBuf, writeJson } from './lib';
import { getTile, tileRange } from './trek';
import { buildCrism } from './crism';

type Layer = {
  id: string;
  label: string;
  sublabel: string;
  url: string;
  remoteUrl?: string;
  type: 'wmts' | 'wms' | 'image';
  attribution: string;
  maxNativeZoom: number;
  minZoom?: number;
  opacity: number;
  verified: boolean;
  bounds?: [[number, number], [number, number]];
  wmsLayers?: string;
  note?: string;
};

type Cand = {
  id: string; label: string; sublabel: string; attribution: string; opacity: number;
  trekId?: string; arcgis?: boolean; local?: boolean; localMaxZoom?: number; note?: string;
};

const TREK_CAPS = (c: Cand) =>
  c.arcgis
    ? `https://trek.nasa.gov/mars/trekarcgis/rest/services/${c.trekId}/MapServer/WMTS/1.0.0/WMTSCapabilities.xml`
    : `https://trek.nasa.gov/tiles/Mars/EQ/${c.trekId}/1.0.0/WMTSCapabilities.xml`;

const CANDIDATES: Cand[] = [
  { id: 'viking', label: 'Viking', sublabel: 'Mosaico global colorido', trekId: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', attribution: 'NASA/JPL/USGS Viking MDIM 2.1 via Mars Trek', opacity: 1, local: true, localMaxZoom: 8 },
  { id: 'mola-color', label: 'MOLA', sublabel: 'Relevo colorido (altitude)', trekId: 'Mars_MGS_MOLA_ClrShade_merge_global_463m', attribution: 'NASA/JPL/GSFC MGS MOLA via Mars Trek', opacity: 0.7, local: true, localMaxZoom: 9 },
  { id: 'mola-hrsc-color', label: 'MOLA + HRSC', sublabel: 'Relevo colorido 200 m', trekId: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', attribution: 'NASA/JPL/GSFC MOLA, ESA/DLR/FU Berlin HRSC via Mars Trek', opacity: 0.7, local: true, localMaxZoom: 10 },
  { id: 'mola-hillshade', label: 'MOLA sombreado', sublabel: 'Relevo sombreado 200 m', trekId: 'Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw', attribution: 'NASA/JPL/GSFC MOLA, ESA/DLR/FU Berlin HRSC via Mars Trek', opacity: 0.6, local: true, localMaxZoom: 10 },
  { id: 'themis-day', label: 'THEMIS dia', sublabel: 'Infravermelho térmico diurno', trekId: 'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', attribution: 'NASA/JPL/ASU Mars Odyssey THEMIS via Mars Trek', opacity: 0.75, local: true, localMaxZoom: 11 },
  { id: 'themis-night', label: 'THEMIS noite', sublabel: 'Infravermelho térmico noturno', trekId: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', attribution: 'NASA/JPL/ASU Mars Odyssey THEMIS via Mars Trek', opacity: 0.75, local: true, localMaxZoom: 11 },
  { id: 'geology', label: 'Geologia USGS', sublabel: 'Mapa geológico global (SIM 3292)', trekId: 'SIM3292_Global_Geology', attribution: 'USGS Astrogeology, Tanaka et al. 2014 (SIM 3292) via Mars Trek', opacity: 0.55, local: true, localMaxZoom: 9 },
  { id: 'ctx-trek', label: 'CTX (Mars Trek)', sublabel: 'Jezero 6 m, controlado', trekId: 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0', attribution: 'NASA/JPL/MSSS MRO CTX, USGS via Mars Trek', opacity: 1 },
  { id: 'hirise-trek', label: 'HiRISE', sublabel: 'Jezero 25 cm, controlado', trekId: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd', attribution: 'NASA/JPL/University of Arizona MRO HiRISE, USGS via Mars Trek', opacity: 1 },
];

function parseCaps(xml: string) {
  const tpl = xml.match(/template="([^"]+)"/)?.[1];
  // tile matrix set default028mm (EPSG:4326 2x1 scheme) — collect identifiers of the matching set
  const sets = [...xml.matchAll(/<TileMatrixSet>([\s\S]*?)<\/TileMatrixSet>/g)].filter((m) => m[1].includes('<TileMatrix>'));
  let maxZ = -1, setId = 'default028mm';
  for (const s of sets) {
    const id = s[1].split('<TileMatrix>')[0].match(/<ows:Identifier>([^<]+)<\/ows:Identifier>/)?.[1];
    const mats = [...s[1].matchAll(/<TileMatrix>\s*<ows:Identifier>(\d+)<\/ows:Identifier>[\s\S]*?<MatrixWidth>([\d.]+)<\/MatrixWidth>\s*<MatrixHeight>([\d.]+)/g)];
    // standard EPSG:4326 pyramid: z0 = 2x1, z1 = 4x2
    const ok = mats.length > 1 && +mats[0][2] === 2 && +mats[0][3] === 1 && +mats[1][2] === 4 && +mats[1][3] === 2;
    if (id && ok) {
      setId = id;
      maxZ = Math.max(...mats.map((m) => +m[1]));
    }
  }
  return { tpl, setId, maxZ };
}

const LOCAL_LEAFLET_BOUNDS: [[number, number], [number, number]] = [[BOUNDS.south, BOUNDS.west], [BOUNDS.north, BOUNDS.east]];

export async function buildLayers() {
  console.log('[layers] verifying Mars Trek layers');
  const out: Layer[] = [
    {
      id: 'ctx', label: 'CTX', sublabel: 'Imagem óptica 6 m (base)', url: '/data/ctx/jezero-ctx.webp', type: 'image',
      attribution: 'NASA/JPL/MSSS MRO CTX; USGS Astrogeology Mars 2020 TRN mosaic', maxNativeZoom: 15, opacity: 1, verified: true,
      bounds: LOCAL_LEAFLET_BOUNDS, note: 'L.imageOverlay(url, bounds). Preview: /data/ctx/jezero-ctx-preview.webp',
    },
  ];
  try {
    const cr = await buildCrism();
    out.push({
      id: 'crism', label: 'CRISM', sublabel: 'Minerais: carbonatos (verde)', url: cr.url, remoteUrl: cr.remoteUrl, type: 'image',
      attribution: 'NASA/JPL/JHUAPL MRO CRISM (MTRDR FRT00005C5E, CAR browse), PDS Geosciences Node', maxNativeZoom: 13, opacity: 0.7,
      verified: true, bounds: cr.bounds,
      note: 'L.imageOverlay(url, bounds). Green/yellow = Mg-carbonate signature (BD2500/D2300), strongest on the western margin and delta; transparent outside the CRISM footprint (covers delta + landing site, not the full CTX area).',
    });
  } catch (e) {
    console.warn('  CRISM failed', (e as Error).message);
  }
  for (const c of CANDIDATES) {
    let xml = '';
    try { xml = (await fetchBuf(TREK_CAPS(c), 30000)).toString('utf8'); } catch (e) { console.warn('  caps failed', c.id, (e as Error).message); }
    const { tpl, setId, maxZ } = parseCaps(xml);
    if (!tpl || maxZ < 0) {
      console.warn('  no usable template for', c.id);
      continue;
    }
    const remoteUrl = tpl.replace('{Style}', 'default').replace('{TileMatrixSet}', setId).replace('{TileMatrix}', '{z}').replace('{TileRow}', '{y}').replace('{TileCol}', '{x}').replace('1.0.0//', '1.0.0/');
    const ext = remoteUrl.endsWith('.jpg') ? 'jpg' : 'png';
    const testZ = Math.min(maxZ, 10);
    const r = tileRange(BOUNDS, testZ);
    const buf = await getTile(remoteUrl, testZ, r.x0 + 1 > r.x1 ? r.x0 : r.x0 + 1, r.y0, c.id);
    let verified = false;
    if (buf) {
      try { const m = await sharp(buf).metadata(); verified = m.width === 256 && m.height === 256; } catch { verified = false; }
    }
    const layer: Layer = {
      id: c.id, label: c.label, sublabel: c.sublabel, url: remoteUrl, type: 'wmts', attribution: c.attribution,
      maxNativeZoom: maxZ, opacity: c.opacity, verified, ...(c.note ? { note: c.note } : {}),
    };
    if (verified && c.local) {
      // cache Jezero tiles z(localMax-3)..localMax under public/tiles/<id>
      const zMax = Math.min(maxZ, c.localMaxZoom ?? maxZ);
      let n = 0;
      for (let z = Math.max(0, zMax - 3); z <= zMax; z++) {
        const t = tileRange(BOUNDS, z);
        for (let y = t.y0; y <= t.y1; y++)
          for (let x = t.x0; x <= t.x1; x++) {
            const b = await getTile(remoteUrl, z, x, y, c.id);
            if (!b) continue;
            const p = join(ROOT, 'public', 'tiles', c.id, String(z), String(y), `${x}.${ext}`);
            await ensureDir(dirname(p));
            await writeFile(p, b);
            n++;
          }
      }
      layer.remoteUrl = remoteUrl;
      layer.url = `/tiles/${c.id}/{z}/{y}/{x}.${ext}`;
      layer.maxNativeZoom = zMax;
      layer.minZoom = Math.max(0, zMax - 3);
      layer.bounds = LOCAL_LEAFLET_BOUNDS;
      layer.note = `${c.note ? c.note + ' ' : ''}Local copy covers Jezero only, z${zMax - 3}-${zMax} (${n} tiles); use remoteUrl outside Jezero/other zooms.`;
    }
    console.log(`  ${verified ? 'OK ' : 'BAD'} ${c.id} maxZ=${maxZ} ${layer.url}`);
    out.push(layer);
  }
  // USGS WMS (MOLA colour) as an example of the WMS path
  const wmsBase = 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map';
  let wmsOk = false;
  try {
    const test = await fetchBuf(`${wmsBase}&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=MOLA_color&STYLES=&SRS=EPSG:4326&BBOX=${BOUNDS.west},${BOUNDS.south},${BOUNDS.east},${BOUNDS.north}&WIDTH=256&HEIGHT=256&FORMAT=image/png`, 40000);
    const m = await sharp(test).metadata();
    wmsOk = m.width === 256;
  } catch (e) { console.warn('  USGS WMS failed', (e as Error).message); }
  out.push({
    id: 'usgs-wms-mola', label: 'MOLA (USGS WMS)', sublabel: 'Relevo colorido via WMS', url: wmsBase, type: 'wms', wmsLayers: 'MOLA_color',
    attribution: 'USGS Astrogeology / NASA MOLA', maxNativeZoom: 9, opacity: 0.7, verified: wmsOk,
    note: 'L.tileLayer.wms(url, { layers: wmsLayers, format: "image/png", transparent: true }) with CRS EPSG:4326',
  });
  console.log(`  ${wmsOk ? 'OK ' : 'BAD'} usgs-wms-mola`);
  await writeJson('layers.json', out, true);
}

if (require.main === module) buildLayers().catch((e) => { console.error(e); process.exit(1); });
