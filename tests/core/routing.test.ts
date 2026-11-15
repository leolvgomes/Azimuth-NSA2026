import { describe, expect, it } from 'vitest';
import { suitConfig } from '@/config/suit';
import { getFeatures } from '@/core/costMap';
import { PROFILE_WEIGHTS, solveCells } from '@/core/routes';
import { hazardDistanceM } from '@/core/geo';
import { pointStepM } from '@/core/sampling';
import { planRoutes, routeFromPolyline, computeRescue, distanceM, buildDossier, nearestPhoto } from '@/core';
import type { Route } from '@/core';
import { at, fullSuit, mapData } from './helpers';

const mid = (r: Route) => r.points[Math.floor(r.points.length / 2)];

describe('A* e perfis', () => {
  it('contorna um obstáculo (parede íngreme com passagem)', () => {
    // parede de 40° nas colunas 49..51, passagem nas linhas 5..9
    const data = mapData({ slope: (r, c) => (c >= 49 && c <= 51 && (r < 5 || r > 9) ? 40 : 2) });
    const f = getFeatures(data);
    const cells = solveCells(f, PROFILE_WEIGHTS.fastest, 'day', at(80, 10), at(80, 90));
    expect(cells.length).toBeGreaterThan(0);
    for (const i of cells) expect(f.blocked[i]).toBe(0);
    const rows = cells.map((i) => Math.floor(i / f.width));
    expect(Math.min(...rows)).toBeLessThanOrEqual(9);
    const [, , fastest] = planRoutes(at(80, 10), at(80, 90), data, fullSuit, 'day');
    expect(fastest.maxSlopeDeg).toBeLessThanOrEqual(suitConfig.slopeMaxDeg);
    expect(fastest.alerts.some((a) => a.kind === 'slope' && a.severity === 'critical')).toBe(false);
  });

  it('se o único caminho é bloqueado, ainda passa (custo alto)', () => {
    const data = mapData({ slope: (_r, c) => (c === 50 ? 40 : 2) });
    const [s] = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'day');
    expect(s.points.length).toBeGreaterThan(2);
    expect(s.alerts.some((a) => a.kind === 'slope' && a.severity === 'critical')).toBe(true);
  });

  it('safest evita o perigo e difere da fastest', () => {
    const hz = {
      id: 'h1', name: 'Canal teste', kind: 'channel' as const, center: at(50, 50), radiusM: 400,
      severity: 'caution' as const, advice: 'Contorne pelo sul.', source: 'teste',
    };
    const data = mapData({ hazards: [hz] });
    const routes = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'day');
    expect(routes.map((r) => r.profile)).toEqual(['safest', 'balanced', 'fastest']);
    expect(routes.map((r) => r.label)).toEqual(['Mais segura', 'Equilibrada', 'Mais rápida']);
    const [safest, balanced, fastest] = routes;
    const minD = (r: Route) => Math.min(...r.points.map((p) => hazardDistanceM(hz, p)));
    expect(minD(safest)).toBeGreaterThan(minD(fastest));
    expect(minD(safest)).toBeGreaterThan(100);
    expect(fastest.distanceM).toBeLessThanOrEqual(safest.distanceM);
    expect(fastest.alerts.some((a) => a.kind === 'hazard')).toBe(true);
    expect(distanceM(mid(safest), mid(fastest))).toBeGreaterThan(100);
    expect(distanceM(mid(balanced), mid(fastest))).toBeGreaterThan(100);
    expect(distanceM(mid(balanced), mid(safest))).toBeGreaterThan(50);
    for (const a of safest.alerts.concat(fastest.alerts)) {
      expect(a.action.length).toBeGreaterThan(5);
      expect(a.title.length).toBeGreaterThan(2);
    }
  });

  it('terreno uniforme: as 3 rotas ainda são visivelmente diferentes', () => {
    const data = mapData();
    const [s, b, f] = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'day');
    expect(distanceM(mid(s), mid(f))).toBeGreaterThan(150);
    expect(distanceM(mid(b), mid(f))).toBeGreaterThan(100);
    expect(distanceM(mid(b), mid(s))).toBeGreaterThan(100);
  });

  it('pontos com distM, elevação, inclinação, temperatura; início e fim exatos', () => {
    const data = mapData();
    const from = at(20, 20);
    const to = at(70, 80);
    const [r] = planRoutes(from, to, data, fullSuit, 'night');
    expect(r.points[0].lat).toBeCloseTo(from.lat, 9);
    expect(r.points[r.points.length - 1].lng).toBeCloseTo(to.lng, 9);
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].distM).toBeGreaterThanOrEqual(r.points[i - 1].distM);
      expect(r.points[i].distM - r.points[i - 1].distM).toBeLessThanOrEqual(50.5);
    }
    expect(r.points[5].surfaceTempC).toBe(-95);
    expect(r.points[5].slopeDeg).toBe(2);
    expect(typeof r.points[5].elevM).toBe('number');
    expect(r.distanceM).toBeGreaterThanOrEqual(distanceM(from, to) - 1);
    expect(r.durationMin).toBeGreaterThan(0);
    expect(r.o2RemainingPct).toBeCloseTo(100 - 2 * r.o2UsedPct, 6);
  });

  it('routeFromPolyline densifica (<= 50 m, menor que a célula da grade)', () => {
    const data = mapData();
    const r = routeFromPolyline([at(50, 10), at(50, 60)], data, fullSuit, 'day');
    expect(r.profile).toBe('manual');
    const d = distanceM(at(50, 10), at(50, 60));
    const step = pointStepM(data);
    expect(step).toBeLessThanOrEqual(50);
    expect(r.points.length).toBe(Math.ceil(d / step) + 1);
    expect(r.distanceM).toBeCloseTo(d, 3);
  });
});

describe('resgate, dossiê, fotos', () => {
  it('computeRescue volta à base', () => {
    const base = { id: 'base', name: 'Base', ...at(50, 5) };
    const far = { id: 'far', name: 'Longe', ...at(5, 95) };
    const data = mapData({ shelters: [far, base] });
    const [route] = planRoutes(base, at(50, 90), data, fullSuit, 'day');
    const k = Math.floor(route.points.length * 0.6);
    const pos = route.points[k];
    const plan = computeRescue(pos, k, route, data, { o2Pct: 70, batteryPct: 70, suitTempC: 18 }, 'day');
    expect(plan.shelter.id).toBe('base');
    const last = plan.returnRoute.points[plan.returnRoute.points.length - 1];
    expect(distanceM(last, base)).toBeLessThan(1);
    expect(plan.returnRoute.profile).toBe('return');
    expect(plan.etaMin).toBeCloseTo(plan.returnRoute.durationMin, 6);
    expect(plan.o2NeededPct).toBeCloseTo(plan.returnRoute.o2UsedPct * (1 + suitConfig.returnSafetyMargin), 6);
    expect(plan.ok).toBe(true);
    expect(plan.passedPointOfNoReturn).toBe(false);
    // com pouco O₂ não dá e já passou do ponto sem retorno
    const bad = computeRescue(pos, k, route, data, { o2Pct: 11, batteryPct: 70, suitTempC: 18 }, 'day');
    expect(bad.ok).toBe(false);
    expect(bad.passedPointOfNoReturn).toBe(true);
  });

  it('dossiê tem todas as entradas com fonte', () => {
    const data = mapData();
    const [r] = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'night');
    const d = buildDossier(r, data, 'night');
    expect(d.entries.map((e) => e.key)).toEqual(
      ['elevation', 'slope', 'temp', 'minerals', 'geology', 'hazards', 'radiation', 'air']);
    for (const e of d.entries) {
      expect(e.source.length).toBeGreaterThan(0);
      expect(e.value.length).toBeGreaterThan(0);
    }
    expect(d.entries.find((e) => e.key === 'temp')!.value).toContain('-95');
  });

  it('nearestPhoto', () => {
    const data = mapData();
    data.photos = [
      { id: 'a', src: '', ...at(10, 10), sol: 1, camera: '', caption: '', credit: 'NASA/JPL-Caltech', approximatePosition: false },
      { id: 'b', src: '', ...at(90, 90), sol: 1, camera: '', caption: '', credit: 'NASA/JPL-Caltech', approximatePosition: false },
    ];
    expect(nearestPhoto(at(80, 80), data)!.id).toBe('b');
    expect(nearestPhoto(at(80, 80), { ...data, photos: [] })).toBeNull();
  });
});
