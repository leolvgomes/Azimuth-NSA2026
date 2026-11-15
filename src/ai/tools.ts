/**
 * Ferramentas da Azimuth: declarações (function calling do Gemini) + executores.
 * Os executores SÓ calculam via `core` (src/core) com o MapData e o AppSnapshot.
 * Usado no servidor (rota /api/azimuth) e no cliente (plano B offline): sem segredos, sem fs.
 */
import type { FunctionDeclaration } from '@google/genai';
import { BASE, NAMED_PLACES } from '@/config/mission';
import { core } from '@/core';
import type { LatLng, MapData, Route, TimeOfDay } from '@/core/types';
import type { AppSnapshot, AzimuthAction } from './contract';

/** Robôs de apoio = CONCEITO. Velocidade usada só para estimar a chegada (rotulado como conceito). */
export const ROVER_CONCEPT = { speedKmh: 6, dispatchMin: 2 } as const;

export type RoverRole = 'scout' | 'rescue' | 'carrier' | 'relay';
export type ToolName =
  | 'plan_routes' | 'compare_routes' | 'oxygen_margin' | 'explain_alerts' | 'start_rescue'
  | 'nearest_photo' | 'set_time_of_day' | 'call_rover' | 'focus_map';

export interface ToolContext {
  data: MapData;
  /** Mutável: plan_routes / set_time_of_day atualizam para as próximas ferramentas da mesma resposta. */
  snapshot: AppSnapshot;
}

export interface ToolResult {
  /** Resumo numérico compacto devolvido ao modelo (e usado pelo plano B para montar o texto). */
  summary: Record<string, unknown>;
  actions: AzimuthAction[];
}

// ---------------------------------------------------------------- declarações

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, ...(required.length ? { required } : {}),
});

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'plan_routes',
    description:
      'Traça 3 rotas (mais segura, equilibrada, mais rápida) da posição atual do astronauta até um destino e desenha no mapa. ' +
      'Use o nome do lugar (ex.: "delta", "base", "Séítah", "Belva") ou lat/lng.',
    parametersJsonSchema: obj({
      destination: { type: 'string', description: 'Nome do lugar (ex.: "delta", "base").' },
      lat: { type: 'number' },
      lng: { type: 'number' },
    }),
  },
  {
    name: 'compare_routes',
    description: 'Compara as rotas visíveis (distância, tempo, O₂ restante, inclinação, alertas) e indica a recomendada.',
    parametersJsonSchema: obj({}),
  },
  {
    name: 'oxygen_margin',
    description: 'Margem de O₂ para ida e volta numa rota (padrão: rota ativa). Sem rota, calcula a volta direta à base.',
    parametersJsonSchema: obj({ route_id: { type: 'string' } }),
  },
  {
    name: 'explain_alerts',
    description: 'Lista os alertas de uma rota (padrão: rota ativa) com o que fazer em cada um.',
    parametersJsonSchema: obj({ route_id: { type: 'string' } }),
  },
  {
    name: 'start_rescue',
    description: 'Ativa o modo resgate: rota de volta ao abrigo mais próximo, tempo, O₂ necessário e ponto sem retorno.',
    parametersJsonSchema: obj({}),
  },
  {
    name: 'nearest_photo',
    description: 'Mostra a foto real de rover (NASA/JPL-Caltech) mais próxima de um ponto (padrão: posição atual).',
    parametersJsonSchema: obj({ lat: { type: 'number' }, lng: { type: 'number' } }),
  },
  {
    name: 'set_time_of_day',
    description: 'Troca o mapa para dia ou noite (muda temperaturas e alertas).',
    parametersJsonSchema: obj({ time: { type: 'string', enum: ['day', 'night'] } }, ['time']),
  },
  {
    name: 'call_rover',
    description:
      'PROPÕE chamar um robô de apoio (conceito). Não executa: a UI pede confirmação ao astronauta. ' +
      'scout = batedor checa o caminho, rescue = resgate, carrier = carga, relay = repetidor de rádio.',
    parametersJsonSchema: obj({
      role: { type: 'string', enum: ['scout', 'rescue', 'carrier', 'relay'] },
      reason: { type: 'string' },
    }, ['role', 'reason']),
  },
  {
    name: 'focus_map',
    description: 'Centraliza o mapa num lugar pelo nome.',
    parametersJsonSchema: obj({ place: { type: 'string' } }, ['place']),
  },
];

// ---------------------------------------------------------------- utilitários

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9.,\s-]/g, ' ')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ') // pontuação some; decimais (18.47) ficam
    .replace(/\s+/g, ' ').trim();

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

export interface Place extends LatLng { label: string }

const ALIASES: Record<string, string[]> = {
  base: ['base', 'home', 'casa', 'abrigo', 'shelter', 'pouso', 'landing', 'octavia', 'butler'],
  delta: ['delta', 'frente do delta', 'delta front', 'western delta', 'delta oeste'],
};
const GENERIC = new Set(['cratera', 'crater', 'canal', 'channel', 'frente', 'front', 'unidade', 'unit', 'monte', 'mount', 'ponto', 'point']);

interface Candidate { term: string; place: Place; priority: number }

function candidates(data: MapData): Candidate[] {
  const out: Candidate[] = [];
  for (const [key, p] of Object.entries(NAMED_PLACES)) {
    const place = { lat: p.lat, lng: p.lng, label: p.label };
    for (const t of [key, p.label, ...(ALIASES[key] ?? [])]) out.push({ term: normalize(t), place, priority: 2 });
  }
  for (const l of data.landmarks ?? []) {
    const place = { lat: l.lat, lng: l.lng, label: l.name };
    const name = normalize(l.name);
    const terms = [name, normalize(l.id.replace(/[-_]/g, ' '))];
    const first = name.split(' ')[0];
    if (first && first.length >= 5 && !GENERIC.has(first)) terms.push(first);
    for (const t of terms) out.push({ term: t, place, priority: 1 });
  }
  for (const s of data.shelters ?? []) {
    out.push({ term: normalize(s.name), place: { lat: s.lat, lng: s.lng, label: s.name }, priority: 1 });
  }
  return out.filter((c) => c.term.length >= 3);
}

/** Resolve um nome de lugar (ou procura um lugar conhecido dentro de uma frase). */
export function resolvePlace(query: string, data: MapData): Place | null {
  const q = normalize(query);
  if (!q) return null;
  const cs = candidates(data);
  const exact = cs.filter((c) => c.term === q).sort((a, b) => b.priority - a.priority)[0];
  if (exact) return exact.place;
  const padded = ` ${q} `;
  const hits = cs
    .filter((c) => padded.includes(` ${c.term} `) || (q.length >= 4 && c.term.includes(q)))
    .sort((a, b) => b.term.length - a.term.length || b.priority - a.priority);
  return hits[0]?.place ?? null;
}

export function knownPlaceNames(data: MapData): string[] {
  const names = new Set<string>(Object.values(NAMED_PLACES).map((p) => p.label));
  for (const l of data.landmarks ?? []) names.add(l.name);
  return [...names];
}

export function findRoute(snapshot: AppSnapshot, routeId?: unknown): Route | null {
  const routes = snapshot.routes ?? [];
  if (typeof routeId === 'string' && routeId.trim()) {
    const q = normalize(routeId);
    const r = routes.find((x) => x.id === routeId || x.profile === q || normalize(x.label) === q || normalize(x.id) === q);
    if (r) return r;
  }
  return routes.find((x) => x.id === snapshot.activeRouteId) ?? routes[0] ?? null;
}

function routeSummary(r: Route) {
  return {
    id: r.id,
    label: r.label,
    profile: r.profile,
    distanceKm: r1(r.distanceM / 1000),
    durationMin: Math.round(r.durationMin),
    o2BackAtBaseAfterRoundTripPct: Math.round(r.o2RemainingPct),
    batteryRemainingPct: Math.round(r.batteryRemainingPct),
    maxSlopeDeg: Math.round(r.maxSlopeDeg),
    criticalAlerts: r.alerts.filter((a) => a.severity === 'critical').length,
    warnings: r.alerts.filter((a) => a.severity === 'warning').length,
  };
}

/** Recomendada: margem de O₂ ok, menos alertas críticos, preferindo o perfil "safest". */
export function recommendRoute(routes: Route[], snapshot: AppSnapshot): Route | null {
  if (!routes.length) return null;
  const score = (r: Route) => {
    const ok = core.oxygenMargin(r, snapshot.suit).ok ? 0 : 1000;
    const crit = r.alerts.filter((a) => a.severity === 'critical').length * 10;
    return ok + crit + (r.profile === 'safest' ? 0 : 1);
  };
  return [...routes].sort((a, b) => score(a) - score(b))[0];
}

// ---------------------------------------------------------------- executores

type Executor = (args: Record<string, unknown>, ctx: ToolContext) => ToolResult;

const executors: Record<ToolName, Executor> = {
  plan_routes(args, ctx) {
    const { data, snapshot } = ctx;
    let to: Place | null = null;
    const lat = num(args.lat), lng = num(args.lng);
    if (lat !== undefined && lng !== undefined) to = { lat, lng, label: `${r1(lat)}N ${r1(lng)}E` };
    else if (typeof args.destination === 'string') to = resolvePlace(args.destination, data);
    if (!to) {
      return {
        summary: { error: 'unknown_destination', asked: args.destination ?? null, knownPlaces: knownPlaceNames(data) },
        actions: [],
      };
    }
    const routes = core.planRoutes(snapshot.position, to, data, snapshot.suit, snapshot.timeOfDay);
    if (!routes.length) return { summary: { error: 'no_route_found', destination: to.label }, actions: [] };
    const best = recommendRoute(routes, snapshot) ?? routes[0];
    ctx.snapshot = { ...snapshot, routes, activeRouteId: best.id };
    return {
      summary: {
        destination: to.label,
        recommendedId: best.id,
        recommendedLabel: best.label,
        routes: routes.map(routeSummary),
      },
      actions: [{ type: 'showRoutes', routes, selectId: best.id }],
    };
  },

  compare_routes(_args, ctx) {
    const routes = ctx.snapshot.routes ?? [];
    if (!routes.length) return { summary: { error: 'no_routes_visible' }, actions: [] };
    const best = recommendRoute(routes, ctx.snapshot)!;
    const fastest = [...routes].sort((a, b) => a.durationMin - b.durationMin)[0];
    ctx.snapshot = { ...ctx.snapshot, activeRouteId: best.id };
    return {
      summary: {
        recommendedId: best.id,
        recommendedLabel: best.label,
        fastestId: fastest.id,
        fastestLabel: fastest.label,
        minutesSavedByFastest: Math.round(best.durationMin - fastest.durationMin),
        routes: routes.map(routeSummary),
      },
      actions: [{ type: 'selectRoute', routeId: best.id }],
    };
  },

  oxygen_margin(args, ctx) {
    const { snapshot, data } = ctx;
    const route = findRoute(snapshot, args.route_id);
    if (!route) {
      const back = core.computeRescue(snapshot.position, snapshot.progressIdx, null, data, snapshot.suit, snapshot.timeOfDay);
      return {
        summary: {
          route: null,
          o2AvailablePct: Math.round(snapshot.suit.o2Pct),
          returnToShelter: back.shelter.name,
          o2NeededToReturnPct: Math.round(back.o2NeededPct),
          returnEtaMin: Math.round(back.etaMin),
          ok: back.ok,
        },
        actions: [],
      };
    }
    const m = core.oxygenMargin(route, snapshot.suit);
    const pnr = core.pointOfNoReturn(route, snapshot.suit);
    return {
      summary: {
        routeId: route.id,
        routeLabel: route.label,
        routeProfile: route.profile,
        o2AvailablePct: Math.round(m.o2AvailablePct),
        o2NeededRoundTripPct: Math.round(m.o2NeededRoundTripPct),
        marginPct: Math.round(m.marginPct),
        autonomyMin: Math.round(m.autonomyMin),
        ok: m.ok,
        pointOfNoReturnKm: pnr ? r1(pnr.distM / 1000) : null,
      },
      actions: [],
    };
  },

  explain_alerts(args, ctx) {
    const { snapshot, data } = ctx;
    const route = findRoute(snapshot, args.route_id);
    if (!route) return { summary: { error: 'no_route' }, actions: [] };
    const alerts = route.alerts.length ? route.alerts : core.evaluateRoute(route, data, snapshot.suit, snapshot.timeOfDay);
    const sorted = [...alerts].sort((a, b) => (a.severity === b.severity ? a.fromIdx - b.fromIdx : a.severity === 'critical' ? -1 : 1));
    const first = sorted[0];
    return {
      summary: {
        routeId: route.id,
        routeLabel: route.label,
        routeProfile: route.profile,
        count: alerts.length,
        alerts: sorted.slice(0, 5).map((a) => ({
          kind: a.kind,
          severity: a.severity,
          title: a.title,
          detail: a.detail,
          action: a.action,
          atKm: r1((route.points[a.fromIdx]?.distM ?? 0) / 1000),
        })),
      },
      actions: first ? [{ type: 'focusMap', at: first.at }] : [],
    };
  },

  start_rescue(_args, ctx) {
    const { snapshot, data } = ctx;
    const route = findRoute(snapshot);
    const plan = core.computeRescue(snapshot.position, snapshot.progressIdx, route, data, snapshot.suit, snapshot.timeOfDay);
    return {
      summary: {
        shelter: plan.shelter.name,
        distanceKm: r1(plan.returnRoute.distanceM / 1000),
        etaMin: Math.round(plan.etaMin),
        o2NeededPct: Math.round(plan.o2NeededPct),
        o2AvailablePct: Math.round(plan.o2AvailablePct),
        ok: plan.ok,
        passedPointOfNoReturn: plan.passedPointOfNoReturn,
        criticalAlerts: plan.returnRoute.alerts.filter((a) => a.severity === 'critical').length,
      },
      actions: [{ type: 'startRescue', plan }],
    };
  },

  nearest_photo(args, ctx) {
    const lat = num(args.lat), lng = num(args.lng);
    const at = lat !== undefined && lng !== undefined ? { lat, lng } : ctx.snapshot.position;
    const photo = core.nearestPhoto(at, ctx.data);
    if (!photo) return { summary: { error: 'no_photos' }, actions: [] };
    return {
      summary: {
        caption: photo.caption,
        sol: photo.sol,
        camera: photo.camera,
        distanceM: Math.round(core.distanceM(at, photo)),
        approximatePosition: photo.approximatePosition,
        credit: photo.credit,
      },
      actions: [{ type: 'showPhoto', photo }],
    };
  },

  set_time_of_day(args, ctx) {
    const t = normalize(String(args.time ?? ''));
    const timeOfDay: TimeOfDay = t === 'night' || t === 'noite' ? 'night' : 'day';
    ctx.snapshot = { ...ctx.snapshot, timeOfDay };
    return { summary: { timeOfDay }, actions: [{ type: 'setTimeOfDay', timeOfDay }] };
  },

  call_rover(args, ctx) {
    const roles: RoverRole[] = ['scout', 'rescue', 'carrier', 'relay'];
    const role = (roles as string[]).includes(String(args.role)) ? (args.role as RoverRole) : 'rescue';
    const reason = typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim().slice(0, 140) : role;
    const from = ctx.data.shelters?.[0] ?? BASE;
    const km = core.distanceM(from, ctx.snapshot.position) / 1000;
    const etaMin = Math.max(1, Math.round(ROVER_CONCEPT.dispatchMin + (km / ROVER_CONCEPT.speedKmh) * 60));
    return {
      summary: { role, etaMin, distanceKm: r1(km), needsConfirmation: true, concept: true },
      // NUNCA executa: só pede confirmação ao astronauta.
      actions: [{ type: 'confirmRoverCall', role, reason, etaMin }],
    };
  },

  focus_map(args, ctx) {
    const place = typeof args.place === 'string' ? resolvePlace(args.place, ctx.data) : null;
    if (!place) return { summary: { error: 'unknown_place', knownPlaces: knownPlaceNames(ctx.data) }, actions: [] };
    return { summary: { place: place.label, lat: place.lat, lng: place.lng }, actions: [{ type: 'focusMap', at: { lat: place.lat, lng: place.lng } }] };
  },
};

export const TOOL_NAMES = Object.keys(executors) as ToolName[];

/** Executa uma ferramenta. Nunca lança: erros viram `summary.error`. */
export function runTool(name: string, args: Record<string, unknown> | undefined, ctx: ToolContext): ToolResult {
  const exec = executors[name as ToolName];
  if (!exec) return { summary: { error: `unknown_tool:${name}` }, actions: [] };
  try {
    return exec(args ?? {}, ctx);
  } catch (e) {
    return { summary: { error: 'tool_failed', message: e instanceof Error ? e.message.slice(0, 200) : String(e) }, actions: [] };
  }
}
