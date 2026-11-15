/**
 * Dossiê da rota: entradas já formatadas, sempre com fonte.
 */
import { DEMO_TARGET } from '@/config/mission';
import { environment } from '@/config/suit';
import { distanceM, isPlaceholderGrid, sampleGrid } from './geo';
import { fmt } from './format';
import { tempGrid } from './sampling';
import type { Dossier, DossierEntry, LatLng, MapData, Route, TimeOfDay } from './types';

/** Distância mínima (m) da rota até um ponto. */
function minDistTo(route: Route, p: LatLng): number {
  let best = Infinity;
  for (const q of route.points) {
    const d = distanceM(q, p);
    if (d < best) best = d;
  }
  return best;
}

export function buildDossier(route: Route, data: MapData, tod: TimeOfDay): Dossier {
  const pts = route.points;
  const entries: DossierEntry[] = [];
  const g = data.grids;

  // Altitude
  const elevs = pts.map((p) => p.elevM ?? sampleGrid(g.elevation, p.lat, p.lng)).filter((v): v is number => v !== null && v !== undefined);
  entries.push({
    key: 'elevation',
    label: 'Altitude',
    value: elevs.length
      ? `${fmt(Math.min(...elevs))} m → ${fmt(Math.max(...elevs))} m (desnível ${fmt(Math.max(...elevs) - Math.min(...elevs))} m)`
      : 'Sem dado',
    source: g.elevation && !isPlaceholderGrid(g.elevation) ? g.elevation.source : 'MOLA / CTX DTM (sem dado carregado)',
    approximate: g.elevation?.approximate,
  });

  // Inclinação
  const slopes = pts.map((p) => p.slopeDeg).filter((v): v is number => v !== undefined);
  const slopeReal = !isPlaceholderGrid(g.slope);
  entries.push({
    key: 'slope',
    label: 'Inclinação',
    value: slopes.length && slopeReal
      ? `máx. ${fmt(Math.max(...slopes), 1)}° · média ${fmt(slopes.reduce((a, b) => a + b, 0) / slopes.length, 1)}°`
      : 'Sem dado',
    source: slopeReal ? g.slope.source : 'MOLA (sem dado carregado)',
    approximate: g.slope.approximate,
  });

  // Temperatura no período escolhido
  const tg = tempGrid(data, tod);
  const temps = pts.map((p) => sampleGrid(tg, p.lat, p.lng)).filter((v): v is number => v !== null);
  entries.push({
    key: 'temp',
    label: tod === 'night' ? 'Temperatura (noite)' : 'Temperatura (dia)',
    value: temps.length ? `${fmt(Math.min(...temps))} °C a ${fmt(Math.max(...temps))} °C` : 'Sem dado',
    source: tg && !isPlaceholderGrid(tg) ? tg.source : `THEMIS ${tod === 'night' ? 'NOITE' : 'DIA'} (valor neutro)`,
    approximate: true,
  });

  // Minerais e geologia por região
  const deltas: LatLng[] = data.landmarks.filter((l) => l.kind === 'delta');
  if (!deltas.length) deltas.push(DEMO_TARGET);
  const dDelta = Math.min(...deltas.map((d) => minDistTo(route, d)));
  const nearDelta = dDelta < 1500;
  entries.push({
    key: 'minerals',
    label: 'Minerais',
    value: nearDelta
      ? 'Carbonatos e argilas (margem / frente do delta)'
      : 'Olivina e piroxênio (assoalho da cratera); carbonatos na margem do delta',
    source: 'CRISM (MRO)',
    approximate: true,
  });
  const units = data.landmarks
    .filter((l) => l.kind === 'unit' && minDistTo(route, l) < 1500)
    .map((l) => l.name);
  entries.push({
    key: 'geology',
    label: 'Geologia',
    value: units.length
      ? units.join(' · ')
      : nearDelta
        ? 'Depósitos sedimentares do delta oeste sobre o assoalho da cratera'
        : 'Assoalho da cratera: Máaz (rocha vulcânica) e Séítah (rica em olivina)',
    source: 'USGS Astrogeology',
    approximate: true,
  });

  // Perigos
  const ids = new Set<string>();
  for (const p of pts) for (const id of p.hazardIds ?? []) ids.add(id);
  const hz = data.hazards.filter((h) => ids.has(h.id));
  entries.push({
    key: 'hazards',
    label: 'Perigos no caminho',
    value: hz.length ? hz.map((h) => h.name).join(' · ') : 'Nenhum perigo mapeado a menos de 150 m',
    source: hz.length ? Array.from(new Set(hz.map((h) => h.source))).join(', ') : 'Mars Trek (formas de relevo)',
  });

  // Radiação (estimativa RAD)
  const dose = (environment.radiationMSvPerDay * route.durationMin) / (24 * 60);
  entries.push({
    key: 'radiation',
    label: 'Radiação (estimativa)',
    value: `~${fmt(dose, 3)} mSv no trajeto de ida (${fmt(environment.radiationMSvPerDay, 2)} mSv/dia)`,
    source: 'Curiosity RAD (estimativa)',
    approximate: true,
  });

  // Ar
  entries.push({
    key: 'air',
    label: 'Ar perto da superfície',
    value: `${fmt(environment.airTempC)} °C · ${fmt(environment.pressurePa)} Pa`,
    source: 'MEDA (Perseverance)',
    approximate: true,
  });

  return { routeId: route.id, timeOfDay: tod, entries };
}
