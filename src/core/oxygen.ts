/**
 * Tempo de caminhada, consumo de O₂/bateria, margem e ponto sem retorno.
 * Modelo: velocidade do traje × (1 − slowdownPerDeg·inclinação), mínimo 30 % da velocidade.
 * Consumo de O₂ e bateria proporcional ao tempo (% por hora, src/config/suit.ts).
 * A volta pelo mesmo caminho gasta o mesmo O₂ da ida, + returnSafetyMargin; o2ReservePct nunca é usado.
 */
import { suitConfig } from '@/config/suit';
import type { OxygenMargin, PointOfNoReturn, Route, RoutePoint, SuitState } from './types';

export function speedKmh(slopeDeg: number | undefined): number {
  const s = slopeDeg && Number.isFinite(slopeDeg) ? Math.abs(slopeDeg) : 0;
  return suitConfig.walkSpeedKmh * Math.max(0.3, 1 - suitConfig.slowdownPerDeg * s);
}

/** Horas acumuladas desde o início em cada ponto. */
export function cumulativeHours(points: RoutePoint[]): number[] {
  const out = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.max(0, b.distM - a.distM);
    const s = ((a.slopeDeg ?? 0) + (b.slopeDeg ?? 0)) / 2;
    out[i] = out[i - 1] + seg / 1000 / speedKmh(s);
  }
  return out;
}

/** Fração do tempo total decorrida em cada ponto (0..1). Usa só a distância se o tempo for 0. */
export function timeFractions(route: Route): number[] {
  const pts = route.points;
  if (pts.length === 0) return [];
  const h = cumulativeHours(pts);
  const tot = h[h.length - 1];
  if (tot > 0) return h.map((v) => v / tot);
  const d = route.distanceM || 1;
  return pts.map((p) => p.distM / d);
}

/** O₂ usado (%) até cada ponto, consistente com route.o2UsedPct. */
export function o2UsedAt(route: Route): number[] {
  return timeFractions(route).map((f) => f * route.o2UsedPct);
}
export function batteryUsedAt(route: Route): number[] {
  return timeFractions(route).map((f) => f * route.batteryUsedPct);
}

/** O₂ necessário para voltar à base pelo mesmo caminho a partir de um ponto com uso `used`. */
export function returnNeed(used: number): number {
  return used * (1 + suitConfig.returnSafetyMargin);
}

export function oxygenMargin(route: Route, suit: SuitState): OxygenMargin {
  const need = route.o2UsedPct + returnNeed(route.o2UsedPct);
  const margin = suit.o2Pct - need;
  return {
    o2AvailablePct: suit.o2Pct,
    o2NeededRoundTripPct: need,
    marginPct: margin,
    autonomyMin: Math.max(0, ((suit.o2Pct - suitConfig.o2ReservePct) / suitConfig.o2PctPerHour) * 60),
    ok: margin >= suitConfig.o2ReservePct,
  };
}

/**
 * Último índice em que o O₂ restante ainda cobre a volta à base pelo mesmo caminho
 * (com returnSafetyMargin) sem tocar na reserva. null se a rota inteira (ida até o destino)
 * nunca passa desse limite. Se já no início não cobre, retorna o índice 0.
 */
export function pointOfNoReturn(route: Route, suit: SuitState): PointOfNoReturn | null {
  const pts = route.points;
  if (pts.length === 0) return null;
  const used = o2UsedAt(route);
  const ok = (i: number) => suit.o2Pct - used[i] - returnNeed(used[i]) >= suitConfig.o2ReservePct;
  if (ok(pts.length - 1)) return null;
  let last = 0;
  for (let i = 0; i < pts.length; i++) {
    if (ok(i)) last = i;
    else break;
  }
  const p = pts[last];
  return { index: last, lat: p.lat, lng: p.lng, distM: p.distM };
}
