import { describe, expect, it } from 'vitest';
import { suitConfig } from '@/config/suit';
import { evaluateRoute, oxygenMargin, planRoutes, pointOfNoReturn, routeFromPolyline } from '@/core';
import type { Grid, MapData, Route } from '@/core';
import { at, fullSuit, mapData } from './helpers';

function linearRoute(n: number, o2Used: number): Route {
  const points = Array.from({ length: n + 1 }, (_, i) => ({ lat: 18.4, lng: 77.4 + i * 0.0001, distM: i * 10, slopeDeg: 0 }));
  return {
    id: 't', profile: 'manual', label: 't', points, distanceM: n * 10, durationMin: 60,
    o2UsedPct: o2Used, batteryUsedPct: 10, o2RemainingPct: 0, batteryRemainingPct: 0, maxSlopeDeg: 0, alerts: [],
  };
}

describe('O₂ e ponto sem retorno', () => {
  it('ponto sem retorno com números simples', () => {
    // 60 − u − 1,3u ≥ 10  →  u ≤ 21,739  →  fração 0,5435 de 40 % → índice 54 de 100
    const r = linearRoute(100, 40);
    const p = pointOfNoReturn(r, { o2Pct: 60, batteryPct: 100, suitTempC: 0 });
    expect(p).not.toBeNull();
    expect(p!.index).toBe(54);
    expect(p!.distM).toBe(540);
  });

  it('null quando a rota inteira cobre a volta', () => {
    expect(pointOfNoReturn(linearRoute(100, 10), fullSuit)).toBeNull();
  });

  it('oxygenMargin', () => {
    const m = oxygenMargin(linearRoute(10, 20), { o2Pct: 72, batteryPct: 64, suitTempC: 18 });
    expect(m.o2NeededRoundTripPct).toBeCloseTo(20 + 26, 6);
    expect(m.marginPct).toBeCloseTo(26, 6);
    expect(m.ok).toBe(true);
    expect(m.autonomyMin).toBeCloseTo(((72 - suitConfig.o2ReservePct) / suitConfig.o2PctPerHour) * 60, 6);
  });
});

describe('alertas', () => {
  it('frio aparece à noite e não de dia', () => {
    const data = mapData({ day: -20, night: -95 });
    const r = routeFromPolyline([at(50, 10), at(50, 60)], data, fullSuit, 'night');
    const night = evaluateRoute(r, data, fullSuit, 'night');
    const day = evaluateRoute(r, data, fullSuit, 'day');
    const cold = night.filter((a) => a.kind === 'cold');
    expect(cold.length).toBe(1); // agrupado em um trecho
    expect(cold[0].severity).toBe('critical');
    expect(cold[0].fromIdx).toBe(0);
    expect(cold[0].toIdx).toBe(r.points.length - 1);
    expect(cold[0].action.length).toBeGreaterThan(10);
    expect(day.some((a) => a.kind === 'cold')).toBe(false);
  });

  it('inclinação: warning > 15°, critical > 25°, trechos separados', () => {
    // trechos a ~900 m um do outro (> MERGE_GAP_M): ficam separados, com títulos diferentes
    const data = mapData({ slope: (_r, c) => (c >= 15 && c < 18 ? 18 : c >= 50 && c < 53 ? 30 : 2) });
    const r = routeFromPolyline([at(50, 10), at(50, 60)], data, fullSuit, 'day');
    const sl = r.alerts.filter((a) => a.kind === 'slope');
    expect(sl.map((a) => a.severity).sort()).toEqual(['critical', 'warning']);
    expect(new Set(r.alerts.map((a) => a.title)).size).toBe(r.alerts.length);
  });

  it('junta trechos repetidos do mesmo alerta próximos (<= 600 m) e nunca repete título', () => {
    // duas rampas a ~200 m uma da outra → um alerta só, cobrindo as duas
    const data = mapData({ slope: (_r, c) => ((c >= 20 && c < 23) || (c >= 30 && c < 33) ? 18 : 2) });
    const r = routeFromPolyline([at(50, 10), at(50, 60)], data, fullSuit, 'day');
    const sl = r.alerts.filter((a) => a.kind === 'slope');
    expect(sl.length).toBe(1);
    expect(r.points[sl[0].fromIdx].lng).toBeLessThan(at(50, 21).lng);
    expect(r.points[sl[0].toIdx].lng).toBeGreaterThan(at(50, 31).lng);
    // dois perigos homônimos (mesmo título) em sequência → um alerta
    const circ = (id: string, c: number) => ({ id, name: 'Escarpa Y', kind: 'scarp' as const, center: at(46, c),
      radiusM: 30, severity: 'caution' as const, advice: 'Suba pela rampa.', source: 'teste' });
    const d2 = mapData({ hazards: [circ('e1', 30), circ('e2', 36)] });
    const r2 = routeFromPolyline([at(50, 10), at(50, 60)], d2, fullSuit, 'day');
    const hz = r2.alerts.filter((a) => a.kind === 'hazard');
    expect(hz.length).toBe(1);
    expect(evaluateRoute(r2, d2, fullSuit, 'day').map((a) => a.title)).toEqual(r2.alerts.map((a) => a.title));
    const titles = r2.alerts.map((a) => a.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('perigo a < 150 m gera alerta com a advice', () => {
    const c = (r: number, k: number): [number, number] => [at(r, k).lat, at(r, k).lng];
    const hz = {
      id: 'dn', name: 'Dunas X', kind: 'dune' as const, polygon: [c(45, 30), c(45, 35), c(48, 35), c(48, 30)],
      severity: 'avoid' as const, advice: 'Não atravesse dunas.', source: 'teste',
    };
    const data = mapData({ hazards: [hz] });
    const r = routeFromPolyline([at(50, 10), at(50, 60)], data, fullSuit, 'day');
    const a = r.alerts.filter((x) => x.kind === 'hazard');
    expect(a.length).toBe(1);
    expect(a[0].action).toBe('Não atravesse dunas.');
    expect(a[0].severity).toBe('warning'); // perto, não dentro
    expect(r.points.some((p) => p.hazardIds?.includes('dn'))).toBe(true);
  });

  it('O₂ insuficiente → critical a partir do ponto sem retorno', () => {
    const data = mapData();
    const suit = { o2Pct: 20, batteryPct: 100, suitTempC: 0 };
    const r = routeFromPolyline([at(95, 2), at(5, 98)], data, suit, 'day');
    const o2 = r.alerts.find((a) => a.kind === 'o2');
    expect(o2?.severity).toBe('critical');
    const pnr = pointOfNoReturn(r, suit);
    expect(o2!.fromIdx).toBe(pnr!.index + 1);
  });

  it('grades placeholder 1×1 geram alerta no-data e ainda planejam 3 rotas diferentes', () => {
    const ph = (name: string, v: number): Grid => ({
      name, unit: '', width: 1, height: 1, bounds: { south: 18.211, west: 77.1605, north: 18.7212, east: 77.6992 },
      cellSizeM: 30000, nodata: -9999, data: [v], source: 'placeholder (sem dado)', approximate: true,
    });
    const data: MapData = {
      grids: { slope: ph('slope', 0), tempDay: ph('tempDay', -20), tempNight: ph('tempNight', -80) },
      hazards: [], landmarks: [], perseveranceTrack: [], photos: [], shelters: [],
    };
    const rs = planRoutes({ lat: 18.4447, lng: 77.4508 }, { lat: 18.4782, lng: 77.4116 }, data, fullSuit, 'day');
    expect(rs.length).toBe(3);
    for (const r of rs) expect(r.alerts.some((a) => a.kind === 'no-data')).toBe(true);
    expect(new Set(rs.map((r) => Math.round(r.distanceM))).size).toBe(3);
  });
});
