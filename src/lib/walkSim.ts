/**
 * Linha do tempo da caminhada simulada, a partir do PRÓPRIO tempo da rota calculado pelo core
 * (route.durationMin inclui as paradas; route.stops[].workMin é o tempo parado em cada uma).
 * Só distribui esse tempo ao longo dos pontos (proporcional à distância); não recalcula segurança.
 */
import type { Route } from '@/core/types';

export interface Timeline {
  routeId: string;
  /** minuto de missão em que chega ao ponto i */
  arrive: number[];
  /** minuto em que sai do ponto i (= arrive + trabalho se for parada) */
  depart: number[];
  total: number;
}

export function buildTimeline(route: Route): Timeline {
  const pts = route.points;
  const work = new Map<number, number>();
  for (const s of route.stops ?? []) work.set(s.index, (work.get(s.index) ?? 0) + Math.max(0, s.workMin));
  const workTotal = [...work.values()].reduce((a, b) => a + b, 0);
  const moving = Math.max(0, route.durationMin - workTotal);
  const dist = route.distanceM > 0 ? route.distanceM : 1;
  const arrive: number[] = [];
  const depart: number[] = [];
  let workBefore = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = (moving * pts[i].distM) / dist + workBefore;
    const w = work.get(i) ?? 0;
    arrive.push(a);
    depart.push(a + w);
    workBefore += w;
  }
  return { routeId: route.id, arrive, depart, total: depart[depart.length - 1] ?? 0 };
}

export interface SimPosition {
  idx: number;
  lat: number;
  lng: number;
  /** distância ao longo da rota (m), interpolada */
  distM: number;
  atStop: boolean;
  done: boolean;
}

export function positionAt(route: Route, tl: Timeline, t: number): SimPosition {
  const pts = route.points;
  const last = pts.length - 1;
  if (t >= tl.total || last <= 0) {
    const p = pts[last] ?? pts[0];
    return { idx: Math.max(0, last), lat: p.lat, lng: p.lng, distM: p.distM, atStop: false, done: true };
  }
  // busca binária: maior i com arrive[i] <= t
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.arrive[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const p = pts[i];
  if (t < tl.depart[i] || i === last) return { idx: i, lat: p.lat, lng: p.lng, distM: p.distM, atStop: tl.depart[i] > tl.arrive[i], done: false };
  const q = pts[i + 1];
  const span = tl.arrive[i + 1] - tl.depart[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (t - tl.depart[i]) / span)) : 1;
  return {
    idx: i,
    lat: p.lat + (q.lat - p.lat) * f,
    lng: p.lng + (q.lng - p.lng) * f,
    distM: p.distM + (q.distM - p.distM) * f,
    atStop: false,
    done: false,
  };
}
