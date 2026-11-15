import { describe, expect, it } from 'vitest';
import { suitConfig } from '@/config/suit';
import {
  buildDossier, computeRescue, distanceM, evaluateRoute, planRoutes, pointOfNoReturn, routeFromPolyline,
  scienceAlongRoute,
} from '@/core';
import type { Route, ScienceTarget } from '@/core';
import { at, fullSuit, mapData } from './helpers';

const hz = {
  id: 'h1', name: 'Canal teste', nameEn: 'Test channel', kind: 'channel' as const, center: at(50, 50), radiusM: 200,
  severity: 'caution' as const, advice: 'Contorne pelo sul.', adviceEn: 'Go around to the south.', source: 'test',
};

describe('language', () => {
  it('English by default (labels, alerts, dossier)', () => {
    const data = mapData({ hazards: [hz] });
    const routes = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'night');
    expect(routes.map((r) => r.label)).toEqual(['Safest', 'Balanced', 'Fastest']);
    const f = routes[2];
    const h = f.alerts.find((a) => a.kind === 'hazard')!;
    expect(h.title).toBe('CHANNEL: TEST CHANNEL');
    expect(h.action).toBe('Go around to the south.');
    const cold = f.alerts.find((a) => a.kind === 'cold')!;
    expect(cold.title).toBe('COLDER THAN SUIT LIMIT');
    expect(cold.action).toMatch(/daylight/);
    const d = buildDossier(f, data, 'night');
    expect(d.entries.find((e) => e.key === 'temp')!.label).toBe('Temperature (night)');
    expect(d.entries.find((e) => e.key === 'radiation')!.value).toMatch(/^~0\.\d{3} mSv/);
    const plan = computeRescue(f.points[10], 10, f, data, fullSuit, 'day');
    expect(plan.returnRoute.label).toBe('Back to shelter');
  });

  it('Portuguese when asked; evaluateRoute agrees with Route.alerts for the same lang', () => {
    const data = mapData({ hazards: [hz] });
    const opts = { lang: 'pt' as const };
    const routes = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'night', opts);
    expect(routes.map((r) => r.label)).toEqual(['Mais segura', 'Equilibrada', 'Mais rápida']);
    const f = routes[2];
    const h = f.alerts.find((a) => a.kind === 'hazard')!;
    expect(h.title).toBe('CANAL: CANAL TESTE');
    expect(h.action).toBe('Contorne pelo sul.');
    expect(f.alerts.find((a) => a.kind === 'cold')!.title).toBe('FRIO ABAIXO DO TRAJE');
    expect(evaluateRoute(f, data, fullSuit, 'night', opts).map((a) => a.title)).toEqual(f.alerts.map((a) => a.title));
    const d = buildDossier(f, data, 'night', opts);
    expect(d.entries.find((e) => e.key === 'radiation')!.value).toMatch(/^~0,\d{3} mSv/);
    expect(computeRescue(f.points[10], 10, f, data, fullSuit, 'day', opts).returnRoute.label).toBe('Volta ao abrigo');
    const m = routeFromPolyline([at(50, 10), at(50, 60)], data, fullSuit, 'day', opts);
    expect(m.label).toBe('Desenhada');
  });
});

describe('via stops', () => {
  it('planRoutes passes within ~50 m of each via, in order; duration includes workMin', () => {
    const data = mapData();
    const via = [at(20, 40), at(80, 60)];
    const opts = { via, viaWorkMin: [30, 15], viaTargetIds: ['t-a', undefined] };
    const plain = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'day');
    const routes = planRoutes(at(50, 10), at(50, 90), data, fullSuit, 'day', opts);
    for (const r of routes) {
      expect(r.stops).toHaveLength(2);
      const [s1, s2] = r.stops!;
      expect(s1.index).toBeLessThan(s2.index);
      expect(distanceM(r.points[s1.index], via[0])).toBeLessThan(50);
      expect(distanceM(r.points[s2.index], via[1])).toBeLessThan(50);
      expect(s1.workMin).toBe(30);
      expect(s2.workMin).toBe(15);
      expect(s1.targetId).toBe('t-a');
      expect(s2.targetId).toBeUndefined();
      // walking time from the points + 45 min of work
      expect(r.durationMin).toBeGreaterThan(45);
      expect(r.o2UsedPct).toBeCloseTo((r.durationMin / 60) * suitConfig.o2PctPerHour, 6);
    }
    expect(routes[0].durationMin).toBeGreaterThan(plain[0].durationMin + 45);
    // still 3 distinct options
    const mid = (r: Route) => r.points[Math.floor(r.points.length / 2)];
    expect(distanceM(mid(routes[0]), mid(routes[2]))).toBeGreaterThan(50);
  });

  it('routeFromPolyline inserts the via and counts the stop; PNR accounts for stop work', () => {
    const data = mapData();
    const via = at(52, 40);
    const base = routeFromPolyline([at(50, 10), at(50, 70)], data, fullSuit, 'day');
    const r = routeFromPolyline([at(50, 10), at(50, 70)], data, fullSuit, 'day', { via: [via], viaWorkMin: [60], viaTargetIds: ['t-x'] });
    expect(r.stops![0].targetId).toBe('t-x');
    expect(r.stops).toHaveLength(1);
    expect(distanceM(r.points[r.stops![0].index], via)).toBeLessThan(1);
    expect(r.durationMin).toBeGreaterThan(base.durationMin + 59);
    // with O₂ that is enough without the stop but not with 60 min of work, the PNR is at/before the stop
    const need = base.o2UsedPct * (2 + suitConfig.returnSafetyMargin) + suitConfig.o2ReservePct;
    const suit = { o2Pct: need + 2, batteryPct: 100, suitTempC: 0 };
    expect(pointOfNoReturn(base, suit)).toBeNull();
    const pnr = pointOfNoReturn(r, suit);
    expect(pnr).not.toBeNull();
    expect(pnr!.index).toBeLessThan(r.stops![0].index);
    expect(r.o2RemainingPct).toBeCloseTo(fullSuit.o2Pct - r.o2UsedPct - (r.o2UsedPct - (60 / 60) * suitConfig.o2PctPerHour), 6);
  });
});

describe('scienceAlongRoute', () => {
  const t = (id: string, r: number, c: number, extra: Partial<ScienceTarget> = {}): ScienceTarget => ({
    id, name: id, ...at(r, c), kind: 'carbonate', why: '', task: '', workMin: 20, priority: 2, source: 'test', ...extra,
  });

  it('projects onto segments, filters by radius, sorts by alongM and de-dupes', () => {
    const data = mapData();
    // a straight 2-vertex route: targets near the middle of the single segment must still be found
    const r = routeFromPolyline([at(50, 10), at(50, 90)], data, fullSuit, 'day');
    const two: Route = { ...r, points: [r.points[0], r.points[r.points.length - 1]] };
    data.scienceTargets = [
      t('late', 46, 70), t('early', 54, 30), t('far', 10, 50), t('dup', 46, 70), t('early', 54, 30),
    ];
    const s = scienceAlongRoute(two, data);
    expect(s.map((x) => x.target.id)).toEqual(['early', 'late']);
    expect(s[0].alongM).toBeLessThan(s[1].alongM);
    expect(s[0].offsetM).toBeGreaterThan(80);
    expect(s[0].offsetM).toBeLessThan(140);
    const expectedAlong = distanceM(two.points[0], at(50, 30));
    expect(Math.abs(s[0].alongM - expectedAlong)).toBeLessThan(15);
    // a bigger radius includes the far one
    expect(scienceAlongRoute(two, data, 5000).map((x) => x.target.id)).toContain('far');
    expect(scienceAlongRoute(two, { ...data, scienceTargets: [] })).toEqual([]);
  });
});
