import { describe, expect, it } from 'vitest';
import { BASE, DEMO_TARGET } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import { core } from '@/core';
import type { MapData, ScienceTarget } from '@/core/types';
import type { AppSnapshot, AzimuthRequest } from '@/ai/contract';
import { detectIntent, detectLang, offlineAnswer } from '@/ai/offline';
import { buildSystemPrompt } from '@/ai/prompt';
import { cameraLabel, matchScienceTarget, resolvePlace, resolveScienceTarget, runTool, TOOL_DECLARATIONS, TOOL_NAMES } from '@/ai/tools';

const flat = (name: string, unit: string, v: number) => ({
  name, unit, width: 2, height: 2,
  bounds: { south: 18.211, west: 77.1605, north: 18.7212, east: 77.6992 },
  cellSizeM: 15000, nodata: -9999, data: [v, v, v, v], source: 'test', approximate: true,
});

const sci = (o: Partial<ScienceTarget> & Pick<ScienceTarget, 'id' | 'name' | 'lat' | 'lng' | 'kind'>): ScienceTarget => ({
  why: 'Por que importa.', whyEn: 'Why it matters.', task: 'Coletar amostra.', taskEn: 'Collect a core sample.',
  workMin: 20, priority: 2, source: 'test', ...o,
});

// Alvos sobre a linha base → delta (ficam dentro de 400 m de qualquer rota razoável).
const data: MapData = {
  grids: { slope: flat('slope', 'deg', 2), tempDay: flat('tempDay', 'degC', -20), tempNight: flat('tempNight', 'degC', -80) },
  hazards: [],
  landmarks: [
    { id: 'seitah', name: 'Séítah', nameEn: 'Seitah unit', lat: 18.43, lng: 77.44, kind: 'unit', description: 'test', source: 'test' },
  ],
  perseveranceTrack: [],
  photos: [
    { id: 'p1', src: '/data/rovers/p1.jpg', lat: 18.445, lng: 77.451, sol: 12, camera: 'NAVCAM', caption: 'Chão perto do pouso', captionEn: 'Ground near the landing site', credit: 'NASA/JPL-Caltech', approximatePosition: false },
    { id: 'p2', src: '/data/rovers/p2.jpg', lat: 18.48, lng: 77.41, sol: 400, camera: 'MASTCAM-Z', caption: 'Frente do delta', credit: 'NASA/JPL-Caltech', approximatePosition: true },
  ],
  shelters: [{ id: 'base', name: 'Base', lat: BASE.lat, lng: BASE.lng }],
  scienceTargets: [
    sci({ id: 'margin-carbonate', name: 'Carbonatos da margem', nameEn: 'Margin carbonates', lat: 18.4615, lng: 77.4312, kind: 'carbonate', priority: 1, workMin: 25 }),
    sci({ id: 'hawksbill-samples', name: 'Skinner Ridge e Wildcat Ridge', nameEn: 'Skinner Ridge & Wildcat Ridge', lat: 18.47, lng: 77.4212, kind: 'sample-site', priority: 1, workMin: 30 }),
    sci({ id: 'three-forks', name: 'Depósito Three Forks', nameEn: 'Three Forks sample depot', lat: 18.4514, lng: 77.4013, kind: 'sample-site', priority: 2 }),
  ],
};
// Põe os dois primeiros alvos em cima da rota que o core traça (vale para qualquer implementação do A*).
{
  const pts = core.planRoutes(BASE, DEMO_TARGET, data, { ...initialSuitState }, 'day', { lang: 'en' })[0].points;
  for (const [i, frac] of [[0, 0.4], [1, 0.7]] as const) {
    const p = pts[Math.floor(pts.length * frac)];
    Object.assign(data.scienceTargets[i], { lat: p.lat, lng: p.lng });
  }
}

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
const withRoutes = (over: Partial<AppSnapshot> = {}) => {
  const lang = over.lang ?? 'en';
  const routes = core.planRoutes(BASE, DEMO_TARGET, data, snap().suit, 'day', { lang });
  return snap({ routes, activeRouteId: routes[0].id, ...over });
};

const ask = (text: string, s = snap()): AzimuthRequest => ({ messages: [{ role: 'user', text }], snapshot: s });
const types = (r: { actions: { type: string }[] }) => r.actions.map((a) => a.type);

describe('tools', () => {
  it('declares every executor', () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(TOOL_NAMES).toEqual(expect.arrayContaining(['science_stops', 'add_science_stop']));
  });

  it('resolves named places and landmarks (PT/EN)', () => {
    expect(resolvePlace('delta', data)).toMatchObject({ lat: DEMO_TARGET.lat, lng: DEMO_TARGET.lng });
    expect(resolvePlace('take me to the delta front.', data)).toMatchObject({ lat: DEMO_TARGET.lat });
    expect(resolvePlace('me leve até o delta.', data)).toMatchObject({ lat: DEMO_TARGET.lat });
    expect(resolvePlace('base', data)).toMatchObject({ lat: BASE.lat });
    expect(resolvePlace('Seitah', data)?.label).toBe('Séítah');
    expect(resolvePlace('Atlantis', data)).toBeNull();
  });

  it('resolves science targets by name, id or kind', () => {
    expect(resolveScienceTarget('carbonates', data)?.id).toBe('margin-carbonate');
    expect(resolveScienceTarget('add the carbonate stop', data)?.id).toBe('margin-carbonate');
    expect(resolveScienceTarget('Wildcat Ridge', data)?.id).toBe('hawksbill-samples');
    expect(resolveScienceTarget('sample depot', data)?.id).toBe('three-forks');
    expect(resolveScienceTarget('add the sample depot', data)?.id).toBe('three-forks');
    expect(resolveScienceTarget('three-forks', data)?.id).toBe('three-forks');
    expect(resolveScienceTarget('inclua os carbonatos', data)?.id).toBe('margin-carbonate');
    expect(resolveScienceTarget('unicorns', data)).toBeNull();
  });

  it('generic words pick the target closest to the route; names pick the named one', () => {
    const s = withRoutes();
    const corridor = s.routes[0].points;
    const near = { ...data.scienceTargets[0], id: 'olv-near', name: 'Olivina perto', nameEn: 'Near olivine', kind: 'olivine' as const, priority: 3 as const };
    const far = sci({ id: 'olv-far', name: 'Olivina longe', nameEn: 'Far olivine', lat: 18.65, lng: 77.25, kind: 'olivine', priority: 1 });
    const d2: MapData = { ...data, scienceTargets: [far, near, ...data.scienceTargets] };
    expect(matchScienceTarget('add the olivine stop', d2, corridor)).toMatchObject({ target: { id: 'olv-near' }, specific: false });
    expect(matchScienceTarget('add the far olivine', d2, corridor)).toMatchObject({ target: { id: 'olv-far' }, specific: true });
  }, 30_000);

  it('generic request with no nearby target → no_nearby_target + suggestion (no replan)', async () => {
    const farCarb = sci({ id: 'far-carb', name: 'Carbonatos longe', nameEn: 'Far carbonates', lat: 18.65, lng: 77.25, kind: 'carbonate', priority: 1 });
    const d2: MapData = { ...data, scienceTargets: [farCarb, ...data.scienceTargets.filter((t) => t.kind !== 'carbonate')] };
    const s = withRoutes();
    const r = runTool('add_science_stop', { targets: ['carbonates'] }, { data: d2, snapshot: s });
    expect(r.actions).toEqual([]);
    expect(r.summary).toMatchObject({ error: 'no_nearby_target', nearestOfKind: { id: 'far-carb' } });
    expect((r.summary.suggestion as { id: string }).id).toBe('hawksbill-samples');
    const o = await offlineAnswer(ask('Add the carbonate stop', s), d2);
    expect(o.actions).toEqual([]);
    expect(o.text).toMatch(/no target of that kind near the route/);
    expect(o.text).toMatch(/I suggest Skinner Ridge & Wildcat Ridge/);
    // Pedindo pelo nome, adiciona mesmo longe.
    expect(types(runTool('add_science_stop', { targets: ['Far carbonates'] }, { data: d2, snapshot: withRoutes() }))).toEqual(['addScienceStops']);
  }, 30_000);

  it('camera labels in English', () => {
    expect(cameraLabel('Navcam esquerda', 'en')).toBe('left Navcam');
    expect(cameraLabel('Mastcam-Z direita', 'en')).toBe('right Mastcam-Z');
    expect(cameraLabel('Navcam esquerda', 'pt')).toBe('Navcam esquerda');
  });

  it('call_rover only proposes (confirmRoverCall)', () => {
    const r = runTool('call_rover', { role: 'scout', reason: 'check' }, { data, snapshot: snap({ position: { lat: 18.47, lng: 77.42 } }) });
    expect(types(r)).toEqual(['confirmRoverCall']);
    expect(r.actions[0]).toMatchObject({ role: 'scout' });
    expect((r.actions[0] as { etaMin: number }).etaMin).toBeGreaterThan(0);
  });

  it('science_stops → showScience with localized summary', () => {
    const r = runTool('science_stops', {}, { data, snapshot: withRoutes() });
    expect(types(r)).toEqual(['showScience']);
    const stops = r.summary.stops as { name: string; why: string; alongKm: number }[];
    expect(stops.map((s) => s.name)).toContain('Margin carbonates');
    expect(stops[0].why).toBe('Why it matters.');
    const pt = runTool('science_stops', {}, { data, snapshot: withRoutes({ lang: 'pt' }) });
    expect((pt.summary.stops as { name: string }[]).map((s) => s.name)).toContain('Carbonatos da margem');
  }, 30_000);

  it('add_science_stop → addScienceStops (replans with via)', () => {
    const ctx = { data, snapshot: withRoutes() };
    const r = runTool('add_science_stop', { targets: ['Three Forks sample depot'] }, ctx);
    expect(types(r)).toEqual(['addScienceStops']);
    const a = r.actions[0] as { targetIds: string[]; routes: unknown[]; selectId: string };
    expect(a.targetIds).toEqual(['three-forks']);
    expect(a.routes.length).toBeGreaterThan(0);
    expect(ctx.snapshot.activeRouteId).toBe(a.selectId);
    expect(runTool('add_science_stop', { targets: ['unicorns'] }, { data, snapshot: snap() }).summary.error).toBe('unknown_science_target');
  }, 30_000);

  it('unknown tool and bad args never throw', () => {
    expect(runTool('nope', {}, { data, snapshot: snap() }).summary.error).toBeTruthy();
    expect(runTool('plan_routes', { destination: 'Atlantis' }, { data, snapshot: snap() }).actions).toEqual([]);
  });

  it('system prompt asks for the interface language and mentions science', () => {
    expect(buildSystemPrompt(snap())).toMatch(/Reply in English/);
    expect(buildSystemPrompt(snap({ lang: 'pt' }))).toMatch(/Reply in Brazilian Portuguese/);
    expect(buildSystemPrompt(snap())).toMatch(/carbonates/);
    expect(buildSystemPrompt(snap({ mode: 'walk', missionElapsedMin: 42 }))).toMatch(/"missionElapsedMin":42/);
  });
});

describe('offline plan B (English default)', () => {
  it('detects language and intents', () => {
    expect(detectLang('me leve até o delta')).toBe('pt');
    expect(detectLang('take me to the delta')).toBe('en');
    expect(detectIntent('take me to the delta')).toBe('navigate');
    expect(detectIntent('me leve até o delta')).toBe('navigate');
    expect(detectIntent("what's the safest route?")).toBe('compare');
    expect(detectIntent('qual a rota mais segura?')).toBe('compare');
    expect(detectIntent("what's my oxygen margin?")).toBe('oxygen');
    expect(detectIntent('quanto oxigênio eu tenho de margem?')).toBe('oxygen');
    expect(detectIntent('what science is along the way?')).toBe('science');
    expect(detectIntent('o que tem de ciência no caminho?')).toBe('science');
    expect(detectIntent('add the carbonate stop')).toBe('addScience');
    expect(detectIntent('inclua a parada dos carbonatos')).toBe('addScience');
    expect(detectIntent('rescue, I need to go back')).toBe('rescue');
    expect(detectIntent('socorro, preciso voltar')).toBe('rescue');
    expect(detectIntent('show the nearest rover photo')).toBe('photo');
    expect(detectIntent('call the scout rover')).toBe('rover');
    expect(detectIntent('chame o batedor')).toBe('rover');
    expect(detectIntent('switch to night')).toBe('time');
  });

  it('1. "take me to the delta" → showRoutes, English, offers science', async () => {
    const r = await offlineAnswer(ask('Azimuth, take me to the delta'), data);
    expect(r.source).toBe('offline');
    expect(types(r)).toEqual(['showRoutes']);
    expect((r.actions[0] as { routes: unknown[] }).routes.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/routes to the delta front/);
    expect(r.text).toMatch(/km/);
  }, 30_000);

  it('1b. PT when snapshot.lang = pt', async () => {
    const r = await offlineAnswer(ask('me leve até o delta', snap({ lang: 'pt' })), data);
    expect(types(r)).toEqual(['showRoutes']);
    expect(r.text).toMatch(/rotas até a frente do delta/);
  }, 30_000);

  it('2. "safest" → selectRoute using visible routes', async () => {
    const s = withRoutes();
    const r = await offlineAnswer(ask("What's the safest route?", s), data);
    expect(types(r)).toEqual(['selectRoute']);
    expect(s.routes.map((x) => x.id)).toContain((r.actions[0] as { routeId: string }).routeId);
    expect(r.text).toMatch(/safest/);
  }, 30_000);

  it('2b. compare without routes says so (no invented numbers)', async () => {
    const r = await offlineAnswer(ask('compare the routes'), data);
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/haven't traced/);
  });

  it('3. science along the way → showScience', async () => {
    const r = await offlineAnswer(ask('What science is along the way?', withRoutes()), data);
    expect(types(r)).toEqual(['showScience']);
    expect(r.text).toMatch(/science stop/);
    expect(r.text).toMatch(/Margin carbonates|Skinner Ridge/);
  }, 30_000);

  it('3b. add the carbonate stop → addScienceStops', async () => {
    const r = await offlineAnswer(ask('Add the carbonate stop', withRoutes()), data);
    expect(types(r)).toEqual(['addScienceStops']);
    expect((r.actions[0] as { targetIds: string[] }).targetIds).toEqual(['margin-carbonate']);
    expect(r.text).toMatch(/^Added Margin carbonates/);
  }, 30_000);

  it('3c. PT science', async () => {
    const r = await offlineAnswer(ask('inclua a parada dos carbonatos', withRoutes({ lang: 'pt' })), data);
    expect(types(r)).toEqual(['addScienceStops']);
    expect(r.text).toMatch(/^Incluí Carbonatos da margem/);
  }, 30_000);

  it('4. oxygen margin uses core numbers', async () => {
    const s = withRoutes();
    const r = await offlineAnswer(ask("What's my oxygen margin?", s), data);
    const m = core.oxygenMargin(s.routes[0], s.suit);
    expect(r.actions).toEqual([]);
    expect(r.text).toContain(`${Math.round(m.o2AvailablePct)}%`);
    expect(r.text).toContain(`${Math.round(m.o2NeededRoundTripPct)}%`);
  }, 30_000);

  it('5. rescue → startRescue', async () => {
    const r = await offlineAnswer(ask('Rescue! Get me home', snap({ position: { lat: 18.47, lng: 77.42 }, mode: 'walk' })), data);
    expect(types(r)).toContain('startRescue');
    expect(r.text).toMatch(/Rescue mode/);
  }, 30_000);

  it('5b. rescue with no O₂ proposes rover (confirm only)', async () => {
    const s = snap({ position: { lat: 18.6, lng: 77.25 }, suit: { o2Pct: 1, batteryPct: 50, suitTempC: 18 } });
    const r = await offlineAnswer(ask('rescue!', s), data);
    expect(types(r)[0]).toBe('startRescue');
    const plan = (r.actions[0] as { plan: { ok: boolean } }).plan;
    if (!plan.ok) {
      expect(types(r)).toContain('confirmRoverCall');
      expect(r.text).toMatch(/Confirm\?/);
    }
  }, 30_000);

  it('6. call rover → only confirmRoverCall', async () => {
    const r = await offlineAnswer(ask('Call the scout rover to check the path'), data);
    expect(types(r)).toEqual(['confirmRoverCall']);
    expect(r.text).toMatch(/Confirm\?/);
    const pt = await offlineAnswer(ask('chame o rover batedor', snap({ lang: 'pt' })), data);
    expect(pt.text).toMatch(/Confirma\?/);
  });

  it('photo → showPhoto (nearest, English caption)', async () => {
    const r = await offlineAnswer(ask('Show me the nearest rover photo'), data);
    expect(types(r)).toEqual(['showPhoto']);
    expect((r.actions[0] as { photo: { id: string } }).photo.id).toBe('p1');
    expect(r.text).toMatch(/Ground near the landing site/);
  });

  it('night/day → setTimeOfDay', async () => {
    const r = await offlineAnswer(ask('switch to night'), data);
    expect(r.actions).toEqual([{ type: 'setTimeOfDay', timeOfDay: 'night' }]);
    expect(r.text).toMatch(/night/);
  });

  it('fallback help', async () => {
    expect((await offlineAnswer(ask('blah'), data)).text).toMatch(/I can plan routes/);
    expect((await offlineAnswer(ask('blá', snap({ lang: 'pt' })), data)).text).toMatch(/Posso traçar rotas/);
  });
});
