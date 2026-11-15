/**
 * Modo Resgate: rota de volta (A* perfil safest) até o abrigo mais próximo em tempo de caminhada.
 */
import { BASE } from '@/config/mission';
import { suitConfig } from '@/config/suit';
import { getFeatures } from './costMap';
import { distanceM } from './geo';
import { o2UsedAt, pointOfNoReturn, returnNeed } from './oxygen';
import { PROFILE_WEIGHTS, buildRoute, cellsToPolyline, solveCells } from './routes';
import type { LatLng, MapData, PointOfNoReturn, RescuePlan, Route, RoverPhoto, Shelter, SuitState, TimeOfDay } from './types';

export function computeRescue(
  position: LatLng, progressIdx: number, route: Route | null, data: MapData, suit: SuitState, tod: TimeOfDay,
): RescuePlan {
  const shelters: Shelter[] = data.shelters?.length
    ? data.shelters
    : [{ id: BASE.id, name: BASE.name, lat: BASE.lat, lng: BASE.lng }];
  const f = getFeatures(data);
  const candidates = [...shelters].sort((a, b) => distanceM(position, a) - distanceM(position, b)).slice(0, 3);

  let best: { shelter: Shelter; route: Route } | null = null;
  for (const s of candidates) {
    const close = distanceM(position, s) < Math.min(f.cellWM, f.cellHM);
    const line = close
      ? [position, s]
      : cellsToPolyline(f, solveCells(f, PROFILE_WEIGHTS.safest, tod, position, s), position, s);
    const r = buildRoute(line, 'return', data, suit, tod);
    if (!best || r.durationMin < best.route.durationMin) best = { shelter: s, route: r };
  }
  const { shelter, route: returnRoute } = best!;

  // Ponto sem retorno da rota em andamento: estima o O₂ do início somando o que já foi gasto.
  let pnr: PointOfNoReturn | null = null;
  let passed = false;
  if (route && route.points.length) {
    const idx = Math.max(0, Math.min(route.points.length - 1, Math.round(progressIdx)));
    const usedSoFar = o2UsedAt(route)[idx] ?? 0;
    pnr = pointOfNoReturn(route, { ...suit, o2Pct: suit.o2Pct + usedSoFar });
    passed = pnr !== null && idx > pnr.index;
  }

  const o2Needed = returnNeed(returnRoute.o2UsedPct);
  return {
    from: { lat: position.lat, lng: position.lng },
    shelter,
    returnRoute,
    pointOfNoReturn: pnr,
    passedPointOfNoReturn: passed,
    etaMin: returnRoute.durationMin,
    o2NeededPct: o2Needed,
    o2AvailablePct: suit.o2Pct,
    ok: suit.o2Pct - o2Needed >= suitConfig.o2ReservePct,
  };
}

export function nearestPhoto(at: LatLng, data: MapData): RoverPhoto | null {
  let best: RoverPhoto | null = null;
  let bestD = Infinity;
  for (const p of data.photos ?? []) {
    const d = distanceM(at, p);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
