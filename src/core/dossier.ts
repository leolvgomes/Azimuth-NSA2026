/**
 * Route dossier: formatted entries, always with a source. English by default, Portuguese with
 * opts.lang = 'pt'.
 */
import { DEFAULT_LANG, localized, type Lang } from '@/config/i18n';
import { DEMO_TARGET } from '@/config/mission';
import { environment } from '@/config/suit';
import { distanceM, isPlaceholderGrid, sampleGrid } from './geo';
import { fmt } from './format';
import { tempGrid } from './sampling';
import type { Dossier, DossierEntry, LatLng, MapData, PlanOptions, Route, TimeOfDay } from './types';

/** Minimum distance (m) from the route to a point. */
function minDistTo(route: Route, p: LatLng): number {
  let best = Infinity;
  for (const q of route.points) {
    const d = distanceM(q, p);
    if (d < best) best = d;
  }
  return best;
}

export function buildDossier(route: Route, data: MapData, tod: TimeOfDay, opts?: PlanOptions): Dossier {
  const lang: Lang = opts?.lang ?? DEFAULT_LANG;
  const L = (en: string, pt: string) => (lang === 'pt' ? pt : en);
  const n = (v: number, d = 0) => fmt(v, d, lang);
  const pts = route.points;
  const entries: DossierEntry[] = [];
  const g = data.grids;
  const noData = L('No data', 'Sem dado');

  // Elevation
  const elevs = pts
    .map((p) => p.elevM ?? sampleGrid(g.elevation, p.lat, p.lng))
    .filter((v): v is number => v !== null && v !== undefined);
  const eMin = Math.min(...elevs);
  const eMax = Math.max(...elevs);
  entries.push({
    key: 'elevation',
    label: L('Elevation', 'Altitude'),
    value: elevs.length
      ? L(`${n(eMin)} m → ${n(eMax)} m (${n(eMax - eMin)} m relief)`, `${n(eMin)} m → ${n(eMax)} m (desnível ${n(eMax - eMin)} m)`)
      : noData,
    source: g.elevation && !isPlaceholderGrid(g.elevation) ? g.elevation.source : L('MOLA / CTX DTM (not loaded)', 'MOLA / CTX DTM (sem dado carregado)'),
    approximate: g.elevation?.approximate,
  });

  // Slope
  const slopes = pts.map((p) => p.slopeDeg).filter((v): v is number => v !== undefined);
  const slopeReal = !isPlaceholderGrid(g.slope);
  const sMax = Math.max(...slopes);
  const sMean = slopes.reduce((a, b) => a + b, 0) / (slopes.length || 1);
  entries.push({
    key: 'slope',
    label: L('Slope', 'Inclinação'),
    value: slopes.length && slopeReal
      ? L(`max ${n(sMax, 1)}° · mean ${n(sMean, 1)}°`, `máx. ${n(sMax, 1)}° · média ${n(sMean, 1)}°`)
      : noData,
    source: slopeReal ? g.slope.source : L('MOLA (not loaded)', 'MOLA (sem dado carregado)'),
    approximate: g.slope.approximate,
  });

  // Temperature for the chosen time of day
  const tg = tempGrid(data, tod);
  const temps = pts.map((p) => sampleGrid(tg, p.lat, p.lng)).filter((v): v is number => v !== null);
  entries.push({
    key: 'temp',
    label: tod === 'night' ? L('Temperature (night)', 'Temperatura (noite)') : L('Temperature (day)', 'Temperatura (dia)'),
    value: temps.length
      ? L(`${n(Math.min(...temps))} °C to ${n(Math.max(...temps))} °C`, `${n(Math.min(...temps))} °C a ${n(Math.max(...temps))} °C`)
      : noData,
    source: tg && !isPlaceholderGrid(tg)
      ? tg.source
      : `THEMIS ${tod === 'night' ? L('NIGHT', 'NOITE') : L('DAY', 'DIA')} (${L('neutral value', 'valor neutro')})`,
    approximate: true,
  });

  // Minerals and geology by region
  const deltas: LatLng[] = data.landmarks.filter((l) => l.kind === 'delta');
  if (!deltas.length) deltas.push(DEMO_TARGET);
  const dDelta = Math.min(...deltas.map((d) => minDistTo(route, d)));
  const nearDelta = dDelta < 1500;
  entries.push({
    key: 'minerals',
    label: L('Minerals', 'Minerais'),
    value: nearDelta
      ? L('Carbonates and clays (delta margin / front)', 'Carbonatos e argilas (margem / frente do delta)')
      : L('Olivine and pyroxene (crater floor); carbonates at the delta margin',
        'Olivina e piroxênio (assoalho da cratera); carbonatos na margem do delta'),
    source: 'CRISM (MRO)',
    approximate: true,
  });
  const units = data.landmarks
    .filter((l) => l.kind === 'unit' && minDistTo(route, l) < 1500)
    .map((l) => localized(l.name, l.nameEn, lang));
  entries.push({
    key: 'geology',
    label: L('Geology', 'Geologia'),
    value: units.length
      ? units.join(' · ')
      : nearDelta
        ? L('Western delta sedimentary deposits over the crater floor', 'Depósitos sedimentares do delta oeste sobre o assoalho da cratera')
        : L('Crater floor: Máaz (volcanic rock) and Séítah (olivine-rich)',
          'Assoalho da cratera: Máaz (rocha vulcânica) e Séítah (rica em olivina)'),
    source: 'USGS Astrogeology',
    approximate: true,
  });

  // Hazards
  const ids = new Set<string>();
  for (const p of pts) for (const id of p.hazardIds ?? []) ids.add(id);
  const hz = data.hazards.filter((h) => ids.has(h.id));
  entries.push({
    key: 'hazards',
    label: L('Hazards on the way', 'Perigos no caminho'),
    value: hz.length
      ? hz.map((h) => localized(h.name, h.nameEn, lang)).join(' · ')
      : L('No mapped hazard within 150 m', 'Nenhum perigo mapeado a menos de 150 m'),
    source: hz.length ? Array.from(new Set(hz.map((h) => h.source))).join(', ') : L('Mars Trek (landforms)', 'Mars Trek (formas de relevo)'),
  });

  // Radiation (RAD estimate) — whole time out, including stops
  const dose = (environment.radiationMSvPerDay * route.durationMin) / (24 * 60);
  entries.push({
    key: 'radiation',
    label: L('Radiation (estimate)', 'Radiação (estimativa)'),
    value: L(`~${n(dose, 3)} mSv on the way out (${n(environment.radiationMSvPerDay, 2)} mSv/day)`,
      `~${n(dose, 3)} mSv no trajeto de ida (${n(environment.radiationMSvPerDay, 2)} mSv/dia)`),
    source: L('Curiosity RAD (estimate)', 'Curiosity RAD (estimativa)'),
    approximate: true,
  });

  // Air
  entries.push({
    key: 'air',
    label: L('Near-surface air', 'Ar perto da superfície'),
    value: `${n(environment.airTempC)} °C · ${n(environment.pressurePa)} Pa`,
    source: 'MEDA (Perseverance)',
    approximate: true,
  });

  return { routeId: route.id, timeOfDay: tod, entries };
}
