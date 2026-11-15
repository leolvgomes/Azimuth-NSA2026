import { describe, expect, it } from 'vitest';
import { BASE, DEMO_TARGET } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import { core } from '@/core';
import type { MapData } from '@/core/types';
import type { AppSnapshot, AzimuthRequest } from '@/ai/contract';
import { detectIntent, detectLang, offlineAnswer } from '@/ai/offline';
import { resolvePlace, runTool, TOOL_DECLARATIONS, TOOL_NAMES } from '@/ai/tools';

const flat = (name: string, unit: string, v: number) => ({
  name, unit, width: 2, height: 2,
  bounds: { south: 18.211, west: 77.1605, north: 18.7212, east: 77.6992 },
  cellSizeM: 15000, nodata: -9999, data: [v, v, v, v], source: 'test', approximate: true,
});

const data: MapData = {
  grids: { slope: flat('slope', 'deg', 2), tempDay: flat('tempDay', 'degC', -20), tempNight: flat('tempNight', 'degC', -80) },
  hazards: [],
  landmarks: [
    { id: 'seitah', name: 'Séítah', lat: 18.43, lng: 77.44, kind: 'unit', description: 'test', source: 'test' },
  ],
  perseveranceTrack: [],
  photos: [
    { id: 'p1', src: '/data/rovers/p1.jpg', lat: 18.445, lng: 77.451, sol: 12, camera: 'NAVCAM', caption: 'Chão perto do pouso', credit: 'NASA/JPL-Caltech', approximatePosition: false },
    { id: 'p2', src: '/data/rovers/p2.jpg', lat: 18.48, lng: 77.41, sol: 400, camera: 'MASTCAM-Z', caption: 'Frente do delta', credit: 'NASA/JPL-Caltech', approximatePosition: true },
  ],
  shelters: [{ id: 'base', name: 'Base', lat: BASE.lat, lng: BASE.lng }],
};

const snap = (over: Partial<AppSnapshot> = {}): AppSnapshot => ({
  suit: { ...initialSuitState },
  timeOfDay: 'day',
  position: { lat: BASE.lat, lng: BASE.lng },
  mode: 'plan',
  activeRouteId: null,
  routes: [],
  progressIdx: 0,
  ...over,
});

const ask = (text: string, s = snap()): AzimuthRequest => ({ messages: [{ role: 'user', text }], snapshot: s });
const types = (r: { actions: { type: string }[] }) => r.actions.map((a) => a.type);

describe('tools', () => {
  it('declares every executor', () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('resolves named places and landmarks', () => {
    expect(resolvePlace('delta', data)).toMatchObject({ lat: DEMO_TARGET.lat, lng: DEMO_TARGET.lng });
    expect(resolvePlace('me leve até o delta.', data)).toMatchObject({ lat: DEMO_TARGET.lat });
    expect(resolvePlace('base', data)).toMatchObject({ lat: BASE.lat });
    expect(resolvePlace('Seitah', data)?.label).toBe('Séítah');
    expect(resolvePlace('Atlantis', data)).toBeNull();
  });

  it('call_rover only proposes (confirmRoverCall)', () => {
    const r = runTool('call_rover', { role: 'scout', reason: 'checar' }, { data, snapshot: snap({ position: { lat: 18.47, lng: 77.42 } }) });
    expect(types(r)).toEqual(['confirmRoverCall']);
    expect(r.actions[0]).toMatchObject({ role: 'scout' });
    expect((r.actions[0] as { etaMin: number }).etaMin).toBeGreaterThan(0);
  });

  it('unknown tool and bad args never throw', () => {
    expect(runTool('nope', {}, { data, snapshot: snap() }).summary.error).toBeTruthy();
    expect(runTool('plan_routes', { destination: 'Atlantis' }, { data, snapshot: snap() }).actions).toEqual([]);
  });
});

describe('offline plan B', () => {
  it('detects language and intents', () => {
    expect(detectLang('me leve até o delta')).toBe('pt');
    expect(detectLang('take me to the delta')).toBe('en');
    expect(detectIntent('me leve até o delta')).toBe('navigate');
    expect(detectIntent('qual a rota mais segura?')).toBe('compare');
    expect(detectIntent('quanto oxigênio eu tenho de margem?')).toBe('oxygen');
    expect(detectIntent('socorro, preciso voltar')).toBe('rescue');
    expect(detectIntent('mostra a foto do rover mais perto')).toBe('photo');
    expect(detectIntent('chame o batedor')).toBe('rover');
    expect(detectIntent('muda para noite')).toBe('time');
  }, 30_000);

  it('1. "me leve até o delta" → showRoutes', async () => {
    const r = await offlineAnswer(ask('Azimuth, me leve até o delta'), data);
    expect(r.source).toBe('offline');
    expect(types(r)).toEqual(['showRoutes']);
    const a = r.actions[0] as { routes: unknown[]; selectId: string };
    expect(a.routes.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/rotas até/);
    expect(r.text).toMatch(/km/);
  }, 30_000);

  it('2. "qual a mais segura" → selectRoute using visible routes', async () => {
    const routes = core.planRoutes(BASE, DEMO_TARGET, data, snap().suit, 'day');
    const r = await offlineAnswer(ask('Qual a rota mais segura?', snap({ routes, activeRouteId: routes[0].id })), data);
    expect(types(r)).toEqual(['selectRoute']);
    expect(routes.map((x) => x.id)).toContain((r.actions[0] as { routeId: string }).routeId);
  }, 30_000);

  it('2b. compare without routes says so (no invented numbers)', async () => {
    const r = await offlineAnswer(ask('compare as rotas'), data);
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/Ainda não tracei/);
  });

  it('3. oxygen margin uses core numbers', async () => {
    const routes = core.planRoutes(BASE, DEMO_TARGET, data, snap().suit, 'day');
    const r = await offlineAnswer(ask('Quanto oxigênio eu tenho de margem?', snap({ routes, activeRouteId: routes[0].id })), data);
    const m = core.oxygenMargin(routes[0], snap().suit);
    expect(r.actions).toEqual([]);
    expect(r.text).toContain(`${Math.round(m.o2AvailablePct)}%`);
    expect(r.text).toContain(`${Math.round(m.o2NeededRoundTripPct)}%`);
  }, 30_000);

  it('4. rescue → startRescue', async () => {
    const r = await offlineAnswer(ask('Socorro, me tira daqui', snap({ position: { lat: 18.47, lng: 77.42 }, mode: 'walk' })), data);
    expect(types(r)).toContain('startRescue');
    expect(r.text).toMatch(/resgate/i);
  }, 30_000);

  it('4b. rescue with no O₂ proposes rover (confirm only)', async () => {
    const s = snap({ position: { lat: 18.6, lng: 77.25 }, suit: { o2Pct: 1, batteryPct: 50, suitTempC: 18 } });
    const r = await offlineAnswer(ask('rescue!', s), data);
    expect(types(r)[0]).toBe('startRescue');
    const plan = (r.actions[0] as { plan: { ok: boolean } }).plan;
    if (!plan.ok) {
      expect(types(r)).toContain('confirmRoverCall');
      expect(r.text).toMatch(/Confirm/);
    }
  }, 30_000);

  it('5. photo → showPhoto (nearest)', async () => {
    const r = await offlineAnswer(ask('Mostra a foto do rover mais perto'), data);
    expect(types(r)).toEqual(['showPhoto']);
    expect((r.actions[0] as { photo: { id: string } }).photo.id).toBe('p1');
  });

  it('night/day → setTimeOfDay', async () => {
    const r = await offlineAnswer(ask('switch to night'), data);
    expect(r.actions).toEqual([{ type: 'setTimeOfDay', timeOfDay: 'night' }]);
    expect(r.text).toMatch(/night/);
  });

  it('call rover → only confirmRoverCall', async () => {
    const r = await offlineAnswer(ask('chame o rover batedor para checar o caminho'), data);
    expect(types(r)).toEqual(['confirmRoverCall']);
    expect(r.text).toMatch(/Confirma\?/);
  });

  it('English navigation', async () => {
    const r = await offlineAnswer(ask('Take me to the delta'), data);
    expect(types(r)).toEqual(['showRoutes']);
    expect(r.text).toMatch(/routes to/);
  }, 30_000);

  it('fallback help', async () => {
    const r = await offlineAnswer(ask('blá blá'), data);
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/Posso traçar rotas/);
  });
});
