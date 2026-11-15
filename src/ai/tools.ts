/**
 * Ferramentas da Azimuth: declarações (function calling do Gemini) + executores.
 * Os executores SÓ calculam via `core` (src/core) com o MapData e o AppSnapshot.
 * Usado no servidor (rota /api/azimuth) e no cliente (plano B offline): sem segredos, sem fs.
 */
import type { FunctionDeclaration } from '@google/genai';
import { DEFAULT_LANG, localized, type Lang } from '@/config/i18n';
import { BASE, DEMO_TARGET, NAMED_PLACES } from '@/config/mission';
import { core } from '@/core';
import type { LatLng, MapData, PlanOptions, Route, ScienceStopOnRoute, ScienceTarget, TimeOfDay } from '@/core/types';
import type { AppSnapshot, AzimuthAction } from './contract';

/** Robôs de apoio = CONCEITO. Velocidade usada só para estimar a chegada (rotulado como conceito). */
export const ROVER_CONCEPT = { speedKmh: 6, dispatchMin: 2 } as const;

export type RoverRole = 'scout' | 'rescue' | 'carrier' | 'relay';
export type ToolName =
  | 'plan_routes' | 'compare_routes' | 'oxygen_margin' | 'explain_alerts' | 'start_rescue'
  | 'nearest_photo' | 'set_time_of_day' | 'call_rover' | 'focus_map' | 'science_stops' | 'add_science_stop';

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
      'Plans 3 routes (safest, balanced, fastest) from the astronaut position to a destination and draws them on the map. ' +
      'Use a place name (e.g. "delta", "base", "Seitah", "Belva", "Three Forks") or lat/lng.',
    parametersJsonSchema: obj({
      destination: { type: 'string', description: 'Place name (e.g. "delta", "base").' },
      lat: { type: 'number' },
      lng: { type: 'number' },
    }),
  },
  {
    name: 'compare_routes',
    description: 'Compares the visible routes (distance, time, O2 back at base, slope, alerts) and selects the recommended one.',
    parametersJsonSchema: obj({}),
  },
  {
    name: 'oxygen_margin',
    description: 'O2 margin for the round trip on a route (default: active route). Without a route, computes going straight back to base.',
    parametersJsonSchema: obj({ route_id: { type: 'string' } }),
  },
  {
    name: 'explain_alerts',
    description: 'Lists the alerts on a route (default: active route) with what to do for each.',
    parametersJsonSchema: obj({ route_id: { type: 'string' } }),
  },
  {
    name: 'start_rescue',
    description: 'Starts rescue mode: route back to the nearest shelter, ETA, O2 needed and point of no return.',
    parametersJsonSchema: obj({}),
  },
  {
    name: 'nearest_photo',
    description: 'Shows the nearest real rover photo (NASA/JPL-Caltech) to a point (default: current position).',
    parametersJsonSchema: obj({ lat: { type: 'number' }, lng: { type: 'number' } }),
  },
  {
    name: 'set_time_of_day',
    description: 'Switches the map to day or night (changes temperatures and alerts).',
    parametersJsonSchema: obj({ time: { type: 'string', enum: ['day', 'night'] } }, ['time']),
  },
  {
    name: 'call_rover',
    description:
      'PROPOSES calling a support robot (concept). It does not execute: the UI asks the astronaut to confirm. ' +
      'scout = checks the path ahead, rescue = rescue, carrier = cargo/samples, relay = radio relay.',
    parametersJsonSchema: obj({
      role: { type: 'string', enum: ['scout', 'rescue', 'carrier', 'relay'] },
      reason: { type: 'string' },
    }, ['role', 'reason']),
  },
  {
    name: 'focus_map',
    description: 'Centers the map on a place by name.',
    parametersJsonSchema: obj({ place: { type: 'string' } }, ['place']),
  },
  {
    name: 'science_stops',
    description:
      'Lists the science targets (carbonates, clays, sample sites...) along a route (default: active route): why they matter, ' +
      'the task, distance along the route and detour; highlights them on the map.',
    parametersJsonSchema: obj({ route_id: { type: 'string' } }),
  },
  {
    name: 'add_science_stop',
    description:
      'Replans the routes to pass through one or more science targets (name or id, e.g. "carbonates", "Wildcat Ridge", "sample depot") ' +
      'before the destination (default: end of the active route). Work time at each stop is added to time and O2.',
    parametersJsonSchema: obj({
      targets: { type: 'array', items: { type: 'string' }, description: 'Target names or ids, in visiting order.' },
      destination: { type: 'string', description: 'Optional final destination; default = end of the active route.' },
    }, ['targets']),
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

export interface Place extends LatLng { label: string; labelEn?: string }

/** Nomes em inglês dos NAMED_PLACES (o config só tem o rótulo PT). */
const PLACE_EN: Record<string, string> = {
  base: 'Base', delta: 'Delta front', belva: 'Belva crater', seitah: 'Séítah',
  'three-forks': 'Three Forks', 'enchanted-lake': 'Enchanted Lake', kodiak: 'Kodiak',
};

export const langOf = (s: { lang?: Lang }): Lang => (s.lang === 'pt' || s.lang === 'en' ? s.lang : DEFAULT_LANG);
export const placeName = (p: Place, lang: Lang) => localized(p.label, p.labelEn, lang);
const opts = (ctx: ToolContext, extra: PlanOptions = {}): PlanOptions => ({ lang: langOf(ctx.snapshot), ...extra });

const ALIASES: Record<string, string[]> = {
  base: ['base', 'home', 'casa', 'abrigo', 'shelter', 'pouso', 'landing', 'octavia', 'butler'],
  delta: ['delta', 'frente do delta', 'delta front', 'western delta', 'delta oeste'],
};
const GENERIC = new Set(['cratera', 'crater', 'canal', 'channel', 'frente', 'front', 'unidade', 'unit', 'monte', 'mount', 'ponto', 'point']);

interface Candidate { term: string; place: Place; priority: number }

function candidates(data: MapData): Candidate[] {
  const out: Candidate[] = [];
  for (const [key, p] of Object.entries(NAMED_PLACES)) {
    const place = { lat: p.lat, lng: p.lng, label: p.label, labelEn: PLACE_EN[key] };
    for (const t of [key, p.label, PLACE_EN[key] ?? key, ...(ALIASES[key] ?? [])]) out.push({ term: normalize(t), place, priority: 2 });
  }
  for (const l of data.landmarks ?? []) {
    const place = { lat: l.lat, lng: l.lng, label: l.name, labelEn: l.nameEn };
    const name = normalize(l.name);
    const terms = [name, normalize(l.id.replace(/[-_]/g, ' ')), ...(l.nameEn ? [normalize(l.nameEn)] : [])];
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

export function knownPlaceNames(data: MapData, lang: Lang = DEFAULT_LANG): string[] {
  const names = new Set<string>(Object.entries(NAMED_PLACES).map(([k, p]) => localized(p.label, PLACE_EN[k], lang)));
  for (const l of data.landmarks ?? []) names.add(localized(l.name, l.nameEn, lang));
  return [...names];
}

// ---------------------------------------------------------------- alvos científicos

export const targetName = (t: ScienceTarget, lang: Lang) => localized(t.name, t.nameEn, lang);

const KIND_WORDS: Record<ScienceTarget['kind'], string[]> = {
  carbonate: ['carbonate', 'carbonates', 'carbonato', 'carbonatos'],
  clay: ['clay', 'clays', 'argila', 'argilas', 'smectite'],
  olivine: ['olivine', 'olivina'],
  'sample-site': ['sample', 'samples', 'amostra', 'amostras', 'organic', 'organics', 'organico', 'organicos', 'organica', 'organicas', 'core', 'cores'],
  stratigraphy: ['layers', 'layer', 'camadas', 'camada', 'stratigraphy', 'estratigrafia', 'outcrop', 'outcrops', 'afloramento', 'strata'],
  boulder: ['boulder', 'boulders', 'rocha', 'rochas', 'pedra', 'pedras', 'conglomerate', 'conglomerates'],
  other: [],
};
const KIND_OF_WORD = new Map<string, ScienceTarget['kind']>(
  Object.entries(KIND_WORDS).flatMap(([k, ws]) => ws.map((w) => [w, k as ScienceTarget['kind']] as const)),
);
const SCI_STOP = new Set([
  'the', 'stop', 'stops', 'site', 'sites', 'parada', 'paradas', 'ponto', 'add', 'adicione', 'adicionar', 'inclua', 'incluir', 'include',
  'with', 'com', 'pass', 'passar', 'passe', 'pelo', 'pela', 'route', 'rota', 'please', 'por', 'favor', 'dos', 'das', 'nos', 'nas',
  'azimuth', 'also', 'tambem', 'some', 'uma', 'one', 'that', 'this', 'esse', 'essa', 'visit', 'visitar', 'collect', 'coletar', 'way', 'caminho',
]);

/** Alvos científicos a até esta distância do corredor contam como "perto" para pedidos genéricos ("carbonates"). */
export const SCIENCE_NEAR_M = 1500;

export interface ScienceMatch {
  target: ScienceTarget;
  /** true = o usuário nomeou o alvo (nome/id); false = pediu um tipo ("carbonates") e escolhemos o mais perto. */
  specific: boolean;
  /** Distância do alvo ao corredor (rota ativa ou linha posição→destino), m. null sem corredor. */
  offRouteM: number | null;
}

/** Distância mínima de um ponto a uma polilinha (amostrada; bom o bastante para ranquear). */
export function distanceToCorridor(p: LatLng, corridor: LatLng[]): number | null {
  if (!corridor.length) return null;
  if (corridor.length === 1) return core.distanceM(p, corridor[0]);
  let best = Infinity;
  for (let i = 1; i < corridor.length; i++) {
    const a = corridor[i - 1], b = corridor[i];
    const n = Math.max(1, Math.ceil(core.distanceM(a, b) / 100));
    for (let k = 0; k <= n; k++) {
      const q = { lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n };
      best = Math.min(best, core.distanceM(p, q));
    }
  }
  return best;
}

const stem = (w: string) => w.replace(/s$/, '');

/**
 * Resolve um alvo científico. Nome/id → esse alvo (mesmo longe). Só tipo ("carbonate", "olivine", "sample",
 * "layers") → o alvo desse tipo mais perto do corredor (desempate por prioridade).
 */
export function matchScienceTarget(query: string, data: MapData, corridor: LatLng[] = []): ScienceMatch | null {
  const q = normalize(query);
  const targets = data.scienceTargets ?? [];
  if (!q || !targets.length) return null;
  const off = (t: ScienceTarget) => distanceToCorridor(t, corridor);
  const specific = (t: ScienceTarget): ScienceMatch => ({ target: t, specific: true, offRouteM: off(t) });
  const terms = (t: ScienceTarget) =>
    [t.id, t.id.replace(/[-_]/g, ' '), t.name, t.nameEn ?? ''].map(normalize).filter((x) => x.length >= 3);
  const words = q.split(' ').filter((w) => w.length >= 3 && !SCI_STOP.has(w));
  const kindWords = words.filter((w) => KIND_OF_WORD.has(w));
  const properWords = words.filter((w) => !KIND_OF_WORD.has(w) && w.length >= 4).map(stem);

  // 1) Nome/id exato ou contido na frase (só se houver algo além de palavras de tipo).
  //    O nome inteiro na frase sempre vale ("add the margin carbonates"); pedaço do nome só com palavra própria.
  {
    const exact = targets.find((t) => terms(t).includes(q));
    if (exact) return specific(exact);
    const padded = ` ${q} `;
    const partialOk = properWords.length > 0 || !kindWords.length;
    const named = targets
      .map((t) => ({ t, len: Math.max(0, ...terms(t).filter((x) => padded.includes(` ${x} `) || (partialOk && q.length >= 4 && x.includes(q))).map((x) => x.length)) }))
      .filter((x) => x.len > 0)
      .sort((a, b) => b.len - a.len || a.t.priority - b.t.priority)[0];
    if (named) return specific(named.t);
  }
  // 2) Palavras próprias em comum com o nome ("wildcat" → Wildcat Ridge, "depot" → Three Forks sample depot).
  if (properWords.length) {
    const scored = targets
      .map((t) => {
        const tw = new Set(terms(t).flatMap((x) => x.split(' ')).map(stem));
        return { t, score: properWords.filter((w) => tw.has(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.t.priority - b.t.priority)[0];
    if (scored) return specific(scored.t);
  }
  // 3) Só tipo: candidatos desse tipo (ou com a palavra no nome) → o mais perto do corredor.
  if (kindWords.length) {
    const kinds = new Set(kindWords.map((w) => KIND_OF_WORD.get(w)!));
    const kw = new Set(kindWords.map(stem));
    const cands = targets.filter((t) => kinds.has(t.kind) || terms(t).some((x) => x.split(' ').some((xw) => kw.has(stem(xw)))));
    if (!cands.length) return null;
    const ranked = cands
      .map((t) => ({ t, d: off(t) }))
      .sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || a.t.priority - b.t.priority);
    return { target: ranked[0].t, specific: false, offRouteM: ranked[0].d };
  }
  return null;
}

/** Atalho: só o alvo. */
export function resolveScienceTarget(query: string, data: MapData, corridor: LatLng[] = []): ScienceTarget | null {
  return matchScienceTarget(query, data, corridor)?.target ?? null;
}

/**
 * Sugestão no lugar de um alvo distante: entre os alvos perto do corredor (≤ SCIENCE_NEAR_M), o de maior
 * prioridade (desempate: mais perto); se nenhum estiver perto, o mais perto de todos.
 */
export function nearestScienceTarget(data: MapData, corridor: LatLng[], exclude: string[] = []): { target: ScienceTarget; offRouteM: number } | null {
  const all = (data.scienceTargets ?? [])
    .filter((t) => !exclude.includes(t.id))
    .map((t) => ({ target: t, offRouteM: distanceToCorridor(t, corridor) }))
    .filter((x): x is { target: ScienceTarget; offRouteM: number } => x.offRouteM !== null);
  const near = all.filter((x) => x.offRouteM <= SCIENCE_NEAR_M).sort((a, b) => a.target.priority - b.target.priority || a.offRouteM - b.offRouteM);
  return near[0] ?? all.sort((a, b) => a.offRouteM - b.offRouteM)[0] ?? null;
}

export function scienceStopSummary(st: ScienceStopOnRoute, lang: Lang) {
  const t = st.target;
  return {
    id: t.id,
    name: targetName(t, lang),
    kind: t.kind,
    priority: t.priority,
    why: localized(t.why, t.whyEn, lang),
    task: localized(t.task, t.taskEn, lang),
    workMin: t.workMin,
    alongKm: r1(st.alongM / 1000),
    detourM: Math.round(st.offsetM),
  };
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

/** "Navcam esquerda" → "left Navcam" (EN); PT fica como está. */
export function cameraLabel(camera: string, lang: Lang): string {
  if (lang !== 'en') return camera;
  const sides: [RegExp, string][] = [[/\s+(esquerda|esq\.?)$/i, 'left'], [/\s+(direita|dir\.?)$/i, 'right']];
  for (const [re, side] of sides) if (re.test(camera)) return `${side} ${camera.replace(re, '')}`;
  return camera.replace(/\bfrontal\b/i, 'front').replace(/\btraseira\b/i, 'rear');
}

// ---------------------------------------------------------------- executores

type Executor = (args: Record<string, unknown>, ctx: ToolContext) => ToolResult;

const executors: Record<ToolName, Executor> = {
  plan_routes(args, ctx) {
    const { data, snapshot } = ctx;
    let to: Place | null = null;
    const lat = num(args.lat), lng = num(args.lng);
    if (lat !== undefined && lng !== undefined) to = { lat, lng, label: `${Math.round(lat * 1e3) / 1e3}N ${Math.round(lng * 1e3) / 1e3}E` };
    else if (typeof args.destination === 'string') to = resolvePlace(args.destination, data);
    if (!to) {
      return {
        summary: { error: 'unknown_destination', asked: args.destination ?? null, knownPlaces: knownPlaceNames(data, langOf(snapshot)) },
        actions: [],
      };
    }
    const routes = core.planRoutes(snapshot.position, to, data, snapshot.suit, snapshot.timeOfDay, opts(ctx));
    const dest = placeName(to, langOf(snapshot));
    if (!routes.length) return { summary: { error: 'no_route_found', destination: dest }, actions: [] };
    const best = recommendRoute(routes, snapshot) ?? routes[0];
    ctx.snapshot = { ...snapshot, routes, activeRouteId: best.id };
    return {
      summary: {
        destination: dest,
        scienceStopsAlongRecommended: core.scienceAlongRoute(best, data).length,
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
      const back = core.computeRescue(snapshot.position, snapshot.progressIdx, null, data, snapshot.suit, snapshot.timeOfDay, opts(ctx));
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
    const alerts = route.alerts.length ? route.alerts : core.evaluateRoute(route, data, snapshot.suit, snapshot.timeOfDay, opts(ctx));
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
    const plan = core.computeRescue(snapshot.position, snapshot.progressIdx, route, data, snapshot.suit, snapshot.timeOfDay, opts(ctx));
    return {
      summary: {
        shelter: plan.shelter.name,
        distanceKm: r1(plan.returnRoute.distanceM / 1000),
        etaMin: Math.round(plan.etaMin),
        o2NeededPct: Math.round(plan.o2NeededPct),
        o2AvailablePct: Math.round(plan.o2AvailablePct),
        /** O₂ que sobra ao chegar ao abrigo (disponível − necessário com margem). */
        o2LeftAtShelterPct: Math.round(plan.o2AvailablePct - plan.o2NeededPct),
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
        caption: localized(photo.caption, photo.captionEn, langOf(ctx.snapshot)),
        sol: photo.sol,
        camera: cameraLabel(photo.camera, langOf(ctx.snapshot)),
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
    if (!place) return { summary: { error: 'unknown_place', knownPlaces: knownPlaceNames(ctx.data, langOf(ctx.snapshot)) }, actions: [] };
    return { summary: { place: placeName(place, langOf(ctx.snapshot)), lat: place.lat, lng: place.lng }, actions: [{ type: 'focusMap', at: { lat: place.lat, lng: place.lng } }] };
  },

  science_stops(args, ctx) {
    const { snapshot, data } = ctx;
    const lang = langOf(snapshot);
    const route = findRoute(snapshot, args.route_id);
    if (!route) return { summary: { error: 'no_route' }, actions: [] };
    const stops = core.scienceAlongRoute(route, data);
    if (!stops.length) {
      const others = [...(data.scienceTargets ?? [])].sort((a, b) => a.priority - b.priority).slice(0, 3);
      return {
        summary: {
          routeId: route.id,
          count: 0,
          otherTargets: others.map((t) => ({
            id: t.id, name: targetName(t, lang), kind: t.kind,
            offRouteKm: r1(Math.min(...route.points.map((p) => core.distanceM(p, t))) / 1000),
          })),
        },
        actions: [],
      };
    }
    return {
      summary: {
        routeId: route.id, routeLabel: route.label, routeProfile: route.profile,
        count: stops.length, stops: stops.slice(0, 5).map((s) => scienceStopSummary(s, lang)),
      },
      actions: [{ type: 'showScience', stops }],
    };
  },

  add_science_stop(args, ctx) {
    const { snapshot, data } = ctx;
    const lang = langOf(snapshot);
    const raw = Array.isArray(args.targets)
      ? args.targets.map(String)
      : typeof args.targets === 'string' ? args.targets.split(/,|\band\b|\be\b/) : [];
    const active = findRoute(snapshot);
    let to: Place | null = typeof args.destination === 'string' ? resolvePlace(args.destination, data) : null;
    if (!to && active?.points.length) {
      const end = active.points[active.points.length - 1];
      to = { lat: end.lat, lng: end.lng, label: active.label };
    }
    if (!to) to = { lat: DEMO_TARGET.lat, lng: DEMO_TARGET.lng, label: NAMED_PLACES.delta.label, labelEn: PLACE_EN.delta };
    // Corredor: a rota ativa (se ela vai ao mesmo destino) ou a linha posição → destino.
    const corridor: LatLng[] = active?.points.length && !args.destination ? active.points : [snapshot.position, to];
    const found: ScienceTarget[] = [];
    const unknown: string[] = [];
    const far: { asked: string; target: ScienceTarget; offRouteM: number }[] = [];
    for (const q of raw.map((x) => x.trim()).filter(Boolean)) {
      const m = matchScienceTarget(q, data, corridor);
      if (!m) unknown.push(q);
      else if (!m.specific && (m.offRouteM ?? 0) > SCIENCE_NEAR_M) far.push({ asked: q, target: m.target, offRouteM: m.offRouteM ?? 0 });
      else if (!found.some((f) => f.id === m.target.id)) found.push(m.target);
    }
    if (!found.length) {
      if (far.length) {
        // Pedido genérico ("carbonates") sem alvo desse tipo por perto: não desvia quilômetros, sugere o mais perto.
        const f = far[0];
        const near = nearestScienceTarget(data, corridor, [f.target.id]);
        return {
          summary: {
            error: 'no_nearby_target',
            asked: f.asked,
            kind: f.target.kind,
            nearestOfKind: { id: f.target.id, name: targetName(f.target, lang), offRouteKm: r1(f.offRouteM / 1000) },
            suggestion: near ? { id: near.target.id, name: targetName(near.target, lang), offRouteKm: r1(near.offRouteM / 1000) } : null,
            hint: 'Name the far target explicitly to add it anyway.',
          },
          actions: [],
        };
      }
      return {
        summary: { error: 'unknown_science_target', asked: raw, knownTargets: (data.scienceTargets ?? []).map((t) => targetName(t, lang)) },
        actions: [],
      };
    }
    const routes = core.planRoutes(snapshot.position, to, data, snapshot.suit, snapshot.timeOfDay, opts(ctx, {
      via: found.map((t) => ({ lat: t.lat, lng: t.lng })),
      viaWorkMin: found.map((t) => t.workMin),
      viaTargetIds: found.map((t) => t.id),
    }));
    if (!routes.length) return { summary: { error: 'no_route_found' }, actions: [] };
    const best = recommendRoute(routes, snapshot) ?? routes[0];
    const before = active ? routeSummary(active) : null;
    const after = routeSummary(best);
    ctx.snapshot = { ...snapshot, routes, activeRouteId: best.id };
    return {
      summary: {
        added: found.map((t) => ({
          id: t.id, name: targetName(t, lang), workMin: t.workMin, task: localized(t.task, t.taskEn, lang),
          offRouteKm: r1((distanceToCorridor(t, corridor) ?? 0) / 1000),
        })),
        unknown,
        skippedFar: far.map((f) => targetName(f.target, lang)),
        recommendedId: best.id,
        recommended: after,
        extraMinutesVsPrevious: before ? after.durationMin - before.durationMin : null,
        extraO2VsPreviousPct: before ? before.o2BackAtBaseAfterRoundTripPct - after.o2BackAtBaseAfterRoundTripPct : null,
        o2MarginOk: core.oxygenMargin(best, snapshot.suit).ok,
      },
      actions: [{ type: 'addScienceStops', targetIds: found.map((t) => t.id), routes, selectId: best.id }],
    };
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
