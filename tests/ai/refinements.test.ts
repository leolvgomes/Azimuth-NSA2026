/**
 * Refinamentos da IA: pergunta hipotética não muda o mapa, O₂ na base sem "margem" inventada,
 * limite de perguntas por IP, status "pensando" por intenção.
 */
import { describe, expect, it } from 'vitest';
import { BASE, DEMO_TARGET } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import { core } from '@/core';
import type { MapData } from '@/core/types';
import type { AppSnapshot } from '@/ai/contract';
import { offlineAnswer } from '@/ai/offline';
import { runTool } from '@/ai/tools';
import { overLimit, clientIp } from '@/ai/rateLimit';
import { thinkingKey } from '@/lib/thinking';

const flat = (name: string, unit: string, v: number) => ({
  name, unit, width: 2, height: 2,
  bounds: { south: 18.211, west: 77.1605, north: 18.7212, east: 77.6992 },
  cellSizeM: 15000, nodata: -9999, data: [v, v, v, v], source: 'test', approximate: true,
});

// Noite abaixo do limite do traje (−80 °C) → alerta de frio só à noite.
const data: MapData = {
  grids: { slope: flat('slope', 'deg', 2), tempDay: flat('tempDay', 'degC', -20), tempNight: flat('tempNight', 'degC', -95) },
  hazards: [], landmarks: [], perseveranceTrack: [], photos: [],
  shelters: [{ id: 'base', name: 'Base', lat: BASE.lat, lng: BASE.lng }],
  scienceTargets: [],
};

const base: AppSnapshot = {
  suit: { ...initialSuitState }, timeOfDay: 'day', position: { lat: BASE.lat, lng: BASE.lng },
  mode: 'plan', activeRouteId: null, routes: [], progressIdx: 0, lang: 'en',
};

describe('IA1 · hypothetical questions do not change the map', () => {
  it('plan_routes with what_if_time_of_day only evaluates (no actions)', () => {
    const r = runTool('plan_routes', { destination: 'delta', what_if_time_of_day: 'night' }, { data, snapshot: { ...base } });
    expect(r.actions).toEqual([]);
    expect(r.summary.hypothetical).toBe(true);
    expect(r.summary.evaluatedFor).toBe('night');
    expect(r.summary.mapUnchanged).toBe(true);
  });

  it('what_if equal to the current time behaves like a normal plan', () => {
    const r = runTool('plan_routes', { destination: 'delta', what_if_time_of_day: 'day' }, { data, snapshot: { ...base } });
    expect(r.actions.map((a) => a.type)).toEqual(['showRoutes']);
  });

  it('explain_alerts what_if night finds cold alerts without focusing the map', () => {
    const routes = core.planRoutes(base.position, DEMO_TARGET, data, base.suit, 'day', { lang: 'en' });
    const snap = { ...base, routes, activeRouteId: routes[0].id };
    const r = runTool('explain_alerts', { what_if_time_of_day: 'night' }, { data, snapshot: snap });
    expect(r.actions).toEqual([]);
    expect((r.summary.alerts as { kind: string }[]).some((a) => a.kind === 'cold')).toBe(true);
  });

  it('offline: "what if I go at night?" with a route does not switch day/night', async () => {
    const routes = core.planRoutes(base.position, DEMO_TARGET, data, base.suit, 'day', { lang: 'en' });
    const res = await offlineAnswer(
      { messages: [{ role: 'user', text: 'what if I go at night?' }], snapshot: { ...base, routes, activeRouteId: routes[0].id } },
      data,
    );
    expect(res.actions.some((a) => a.type === 'setTimeOfDay')).toBe(false);
    expect(res.text).toMatch(/map stays/i);
  });

  it('offline: an explicit "switch to night" still switches', async () => {
    const res = await offlineAnswer({ messages: [{ role: 'user', text: 'switch to night' }], snapshot: { ...base } }, data);
    expect(res.actions).toContainEqual({ type: 'setTimeOfDay', timeOfDay: 'night' });
  });
});

describe('IA2 · oxygen at the shelter', () => {
  it('reports atShelter and walking autonomy instead of a fake margin', () => {
    const r = runTool('oxygen_margin', {}, { data, snapshot: { ...base } });
    expect(r.summary.route).toBeNull();
    expect(r.summary.atShelter).toBe(true);
    expect(r.summary.walkingAutonomyMin).toBeGreaterThan(0);
  });

  it('offline answer at the base talks about autonomy and offers to plan', async () => {
    const res = await offlineAnswer({ messages: [{ role: 'user', text: 'how much oxygen margin do I have?' }], snapshot: { ...base } }, data);
    expect(res.text).toMatch(/at the base/i);
    expect(res.text).toMatch(/Plan a route/i);
  });
});

describe('IA4 · rate limit', () => {
  it('blocks after the max per window and recovers after it', () => {
    const ip = `test-${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(overLimit(ip, t0 + i, 3)).toBe(false);
    expect(overLimit(ip, t0 + 10, 3)).toBe(true);
    expect(overLimit(ip, t0 + 120_000, 3)).toBe(false);
  });

  it('reads the first forwarded IP', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers())).toBe('local');
  });
});

describe('IA3 · thinking status', () => {
  it('maps questions to a status label', () => {
    expect(thinkingKey('take me to the delta')).toBe('thinkRoute');
    expect(thinkingKey('quanto oxigênio tenho?')).toBe('thinkO2');
    expect(thinkingKey('chame o batedor')).toBe('thinkRover');
    expect(thinkingKey('how do I get back?')).toBe('thinkRescue');
    expect(thinkingKey('hello')).toBe('computing');
  });
});
