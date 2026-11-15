'use client';
/**
 * Estado global do Azimuth (zustand).
 * Regra: TODA conta de rota/O₂/alerta/resgate/ciência passa por `core` (@/core), sempre com { lang }.
 * Aqui só orquestramos quando recalcular: idioma, suit, timeOfDay, rota ativa ou posição mudam → recompute().
 */
import { create } from 'zustand';
import { core } from '@/core';
import type {
  Alert, Dossier, LatLng, MapData, OxygenMargin, PlanOptions, PointOfNoReturn, RescuePlan, Route, RoverPhoto,
  ScienceStopOnRoute, SuitState, TimeOfDay,
} from '@/core/types';
import type { AzimuthAction, ChatMessage } from '@/ai/contract';
import { loadMapData } from '@/data/loadMapData';
import { BASE } from '@/config/mission';
import { initialSuitState, suitConfig, walkSim } from '@/config/suit';
import { DEFAULT_LANG, LOCALE, type Lang } from '@/config/i18n';
import { LAYER_GROUPS, type LayerGroupId } from '@/lib/layers';
import { fmtDist, setFormatLang } from '@/lib/format';
import { isLang, tr } from '@/lib/i18n';
import { buildTimeline, positionAt, type Timeline } from '@/lib/walkSim';
import { speak } from '@/lib/speech';

export type Mode = 'intro' | 'plan' | 'walk' | 'rescue';
export type RobotRole = 'scout' | 'rescue' | 'carrier' | 'relay';
export type PnrPrompt = 'ahead' | 'passed' | null;

export interface ReplyCard {
  id: number;
  text: string;
  actions: AzimuthAction[];
  source: 'gemini' | 'offline';
  error?: string;
  /** cartão proativo gerado pela UI (não pela IA) */
  kind?: 'pnr-ahead' | 'pnr-passed';
}

export interface PendingConfirm {
  role: RobotRole;
  reason: string;
  etaMin: number;
}

export interface RobotCall extends PendingConfirm {
  startedAt: number;
}

export type FocusTarget =
  | { kind: 'point'; at: LatLng; zoom?: number; n: number }
  | { kind: 'bounds'; points: LatLng[]; n: number };

/** De onde vieram as rotas visíveis (para recalcular quando idioma / traje / dia-noite / paradas mudam). */
type RouteSource =
  | { kind: 'none' }
  | { kind: 'plan'; from: LatLng; to: LatLng; viaIds: string[] }
  | { kind: 'manual'; points: LatLng[] };

export interface SimState {
  running: boolean;
  speed: number;
  elapsedMin: number;
  atStop: boolean;
  done: boolean;
  /** distância percorrida ao longo da rota (m), interpolada */
  distM: number;
}

export interface AzimuthState {
  lang: Lang;
  mapData: MapData | null;
  dataReady: boolean;

  mode: Mode;
  prevMode: 'plan' | 'walk';

  suit: SuitState;
  timeOfDay: TimeOfDay;
  layers: Record<LayerGroupId, boolean>;

  drawing: boolean;
  drawnPoints: LatLng[];
  drawnDistanceM: number;

  routeSource: RouteSource;
  routes: Route[];
  activeRouteId: string | null;
  routeAlerts: Record<string, Alert[]>;
  alerts: Alert[];
  dossier: Dossier | null;
  oxygen: OxygenMargin | null;
  pnr: PointOfNoReturn | null;

  /** alvos científicos perto da rota ativa (core.scienceAlongRoute) */
  scienceStops: ScienceStopOnRoute[];
  /** ids escolhidos como parada (via) */
  chosenStopIds: string[];
  /** ids destacados pela Azimuth (showScience) */
  highlightedScience: string[];

  /** ponto da rota sob o mouse no perfil de elevação */
  hoverIdx: number | null;

  rescuePlan: RescuePlan | null;
  rescueStartedAt: number | null;
  returning: boolean;
  arrived: boolean;

  progressIdx: number;
  position: LatLng;
  walking: boolean;
  sim: SimState;
  pnrPrompt: PnrPrompt;

  selectedPhoto: RoverPhoto | null;
  photoPinned: boolean;

  chat: { messages: ChatMessage[]; card: ReplyCard | null; loading: boolean };
  pendingConfirm: PendingConfirm | null;
  robot: RobotCall | null;
  speakReplies: boolean;

  focus: FocusTarget | null;
  cursor: LatLng | null;
  zoom: number;

  // ações
  init(): void;
  setLang(l: Lang): void;
  setMode(m: Mode): void;
  setSuit(patch: Partial<SuitState>): void;
  setTimeOfDay(t: TimeOfDay): void;
  toggleLayer(id: LayerGroupId): void;

  setDrawing(on: boolean): void;
  addDrawnPoint(p: LatLng): void;
  undoDrawnPoint(): void;
  clearDrawing(): void;
  planToLastPoint(): void;
  useDrawnRoute(): void;
  planTo(to: LatLng): void;

  selectRoute(id: string): void;
  clearRoutes(): void;
  toggleScienceStop(targetId: string): void;
  setHoverIdx(i: number | null): void;

  startWalk(): void;
  advance(): void;
  setSimRunning(on: boolean): void;
  setSimSpeed(x: number): void;
  ackPnr(): void;

  enterRescue(): void;
  exitRescue(): void;
  startReturn(): void;

  selectPhoto(p: RoverPhoto | null, pinned?: boolean): void;
  photoNear(at: LatLng): void;

  applyAzimuthActions(actions: AzimuthAction[]): void;
  confirmRover(yes: boolean): void;
  setChat(patch: Partial<AzimuthState['chat']>): void;
  pushMessage(m: ChatMessage): void;
  dismissCard(): void;
  setSpeakReplies(on: boolean): void;

  focusOn(at: LatLng, zoom?: number): void;
  fitTo(points: LatLng[]): void;
  setCursor(c: LatLng | null): void;
  setZoom(z: number): void;

  activeRoute(): Route | null;
}

/** Executa uma chamada ao core sem derrubar a UI se o core (em construção) lançar erro. */
function safe<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    console.warn(`[azimuth] core.${label} falhou`, err);
    return fallback;
  }
}

/** Junta alertas sem duplicar: os do evaluateRoute (no idioma atual) vêm primeiro. */
function mergeAlerts(first: Alert[], second: Alert[]): Alert[] {
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const al of [...first, ...second]) {
    const k = `${al.kind}:${al.fromIdx}:${al.toIdx}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(al);
  }
  return out.sort((x, y) => (x.severity === y.severity ? x.fromIdx - y.fromIdx : x.severity === 'critical' ? -1 : 1));
}

const initialLayers = Object.fromEntries(LAYER_GROUPS.map((g) => [g.id, g.defaultOn])) as Record<LayerGroupId, boolean>;
const LANG_KEY = 'azimuth.lang';

let walkTimer: ReturnType<typeof setInterval> | null = null;
let returnTimer: ReturnType<typeof setInterval> | null = null;
let simTimer: ReturnType<typeof setInterval> | null = null;
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
let timeline: Timeline | null = null;
let simLast = 0;
let simLastRecompute = 0;
let pnrAckAhead = false;
let pnrAckPassed = false;
/** Caminhada: foto escolhida à mão vale até andar mais 300 m; depois a foto volta a seguir o astronauta. */
let pinnedAtDist: number | null = null;
let lastPhotoIdx = -1;
const PHOTO_AHEAD_M = 300;
let focusN = 0;
let cardN = 0;

function stopTimers() {
  if (walkTimer) clearInterval(walkTimer);
  if (returnTimer) clearInterval(returnTimer);
  if (simTimer) clearInterval(simTimer);
  walkTimer = null;
  returnTimer = null;
  simTimer = null;
}

const idleSim: SimState = { running: false, speed: 1, elapsedMin: 0, atStop: false, done: false, distM: 0 };

export const useAzimuth = create<AzimuthState>()((set, get) => {
  const langOpts = (): PlanOptions => ({ lang: get().lang });

  /** Paradas escolhidas → { via, viaWorkMin } na ordem dada. */
  function viaOpts(ids: string[]): PlanOptions {
    const data = get().mapData;
    const targets = ids.map((id) => data?.scienceTargets?.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
    if (!targets.length) return langOpts();
    return { lang: get().lang, via: targets.map((t) => ({ lat: t.lat, lng: t.lng })), viaWorkMin: targets.map((t) => t.workMin), viaTargetIds: targets.map((t) => t.id) };
  }

  /** Recalcula rotas (se a origem permite), alertas, dossiê, O₂, ponto sem retorno, ciência e resgate. */
  function recompute(opts: { replan?: boolean } = {}) {
    const s = get();
    const data = s.mapData;
    if (!data) return;
    const { suit, timeOfDay: tod } = s;
    const lo = langOpts();

    let routes = s.routes;
    let activeRouteId = s.activeRouteId;
    if (opts.replan && s.mode === 'plan' && s.routeSource.kind !== 'none') {
      const prevProfile = routes.find((r) => r.id === activeRouteId)?.profile;
      const src = s.routeSource;
      const next =
        src.kind === 'plan'
          ? safe('planRoutes', () => core.planRoutes(src.from, src.to, data, suit, tod, viaOpts(src.viaIds)), routes)
          : [safe('routeFromPolyline', () => core.routeFromPolyline(src.points, data, suit, tod, lo), routes[0])].filter(Boolean);
      if (next.length) {
        routes = next;
        activeRouteId = (next.find((r) => r.profile === prevProfile) ?? next[0]).id;
      }
    }

    const routeAlerts: Record<string, Alert[]> = {};
    for (const r of routes) {
      routeAlerts[r.id] = mergeAlerts(safe('evaluateRoute', () => core.evaluateRoute(r, data, suit, tod, lo), []), r.alerts ?? []);
    }
    const active = routes.find((r) => r.id === activeRouteId) ?? null;
    const here = s.position;
    const stillRoute = safe('routeFromPolyline', () => core.routeFromPolyline([here, here], data, suit, tod, lo), null as Route | null);
    const forO2 = active ?? stillRoute;

    const patch: Partial<AzimuthState> = {
      routes,
      activeRouteId: active?.id ?? null,
      routeAlerts,
      alerts: active ? routeAlerts[active.id] ?? [] : [],
      dossier: active ? safe('buildDossier', () => core.buildDossier(active, data, tod, lo), null) : null,
      oxygen: forO2 ? safe('oxygenMargin', () => core.oxygenMargin(forO2, suit), null) : null,
      pnr: active ? safe('pointOfNoReturn', () => core.pointOfNoReturn(active, suit), null) : null,
      scienceStops: active && data.scienceTargets?.length ? safe('scienceAlongRoute', () => core.scienceAlongRoute(active, data), [] as ScienceStopOnRoute[]) : [],
    };
    if (!s.returning) {
      patch.rescuePlan = safe(
        'computeRescue',
        () => core.computeRescue(here, s.progressIdx, s.mode === 'walk' || s.mode === 'rescue' ? active : null, data, suit, tod, lo),
        s.rescuePlan,
      );
    }
    set(patch);
  }

  function scheduleRecompute(replan: boolean) {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => recompute({ replan }), 220);
  }

  function setRoutes(routes: Route[], selectId: string | null, source: RouteSource, fit = true) {
    set({
      routes,
      activeRouteId: (selectId && routes.some((r) => r.id === selectId) ? selectId : routes[0]?.id) ?? null,
      routeSource: source,
      progressIdx: 0,
      chosenStopIds: source.kind === 'plan' ? source.viaIds : [],
      hoverIdx: null,
    });
    recompute();
    const active = get().activeRoute();
    if (active && fit) get().fitTo(active.points);
    if (active && !get().photoPinned) get().photoNear(active.points[Math.floor(active.points.length / 2)] ?? active.points[0]);
  }

  /** Cartão proativo da Azimuth (sem rede): ponto sem retorno. */
  function proactiveCard(kind: 'pnr-ahead' | 'pnr-passed', text: string) {
    const chat = get().chat;
    set({
      chat: { ...chat, messages: [...chat.messages, { role: 'assistant' as const, text }].slice(-20), card: { id: ++cardN, text, actions: [], source: 'offline', kind } },
    });
    if (get().speakReplies) speak(text, LOCALE[get().lang]);
  }

  /** Aplica um instante da caminhada simulada (posição pelo tempo da rota). */
  function applyElapsed(route: Route, elapsed: number, dtMin: number) {
    if (!timeline || timeline.routeId !== route.id) timeline = buildTimeline(route);
    const pos = positionAt(route, timeline, elapsed);
    const s = get();
    // consumo do traje (taxas do suitConfig); os sliders continuam podendo sobrescrever
    const suit = dtMin > 0
      ? {
          ...s.suit,
          o2Pct: Math.max(0, s.suit.o2Pct - (suitConfig.o2PctPerHour * dtMin) / 60),
          batteryPct: Math.max(0, s.suit.batteryPct - (suitConfig.batteryPctPerHour * dtMin) / 60),
        }
      : s.suit;
    set({
      suit,
      progressIdx: pos.idx,
      position: { lat: pos.lat, lng: pos.lng },
      sim: { ...s.sim, elapsedMin: elapsed, atStop: pos.atStop, done: pos.done, distM: pos.distM, running: pos.done ? false : s.sim.running },
    });
    followPhoto(route, pos.idx, pos.distM);
    return pos;
  }

  /** Foto do rover mais próxima de ~300 m à frente; só troca quando o ponto da rota muda. */
  function followPhoto(route: Route, idx: number, distM: number) {
    if (get().photoPinned) {
      if (pinnedAtDist == null) pinnedAtDist = distM;
      if (distM - pinnedAtDist < PHOTO_AHEAD_M) return;
      pinnedAtDist = null;
      set({ photoPinned: false });
      lastPhotoIdx = -1;
    }
    if (idx === lastPhotoIdx) return;
    lastPhotoIdx = idx;
    const pts = route.points;
    let k = idx;
    while (k < pts.length - 1 && pts[k].distM < distM + PHOTO_AHEAD_M) k++;
    get().photoNear(pts[k] ?? pts[idx]);
  }

  function checkPnr(distM: number) {
    const s = get();
    const pnr = s.pnr;
    if (!pnr) return;
    const toPnr = pnr.distM - distM;
    if (!pnrAckAhead && toPnr > 0 && toPnr <= walkSim.pnrWarnAheadM) {
      pnrAckAhead = true;
      stopSim();
      set({ pnrPrompt: 'ahead' });
      proactiveCard('pnr-ahead', tr(s.lang, 'pnrAheadText', { d: fmtDist(toPnr) }));
      return;
    }
    const short = s.oxygen?.ok === false || s.rescuePlan?.ok === false;
    if (!pnrAckPassed && toPnr <= 0 && short) {
      pnrAckPassed = true;
      stopSim();
      set({ pnrPrompt: 'passed' });
      proactiveCard('pnr-passed', tr(s.lang, 'pnrPassedText'));
    }
  }

  function stopSim() {
    if (simTimer) clearInterval(simTimer);
    simTimer = null;
    set({ sim: { ...get().sim, running: false } });
  }

  function simTick() {
    const s = get();
    const route = s.activeRoute();
    if (!route || s.mode !== 'walk' || !s.sim.running) return stopSim();
    const now = performance.now();
    const dtReal = Math.min(0.5, (now - simLast) / 1000);
    simLast = now;
    const dtMin = dtReal * walkSim.missionMinutesPerSecond * s.sim.speed;
    const pos = applyElapsed(route, s.sim.elapsedMin + dtMin, dtMin);
    if (now - simLastRecompute > 900 || pos.done) {
      simLastRecompute = now;
      recompute();
      if (pos.done) stopSim();
    }
    checkPnr(pos.distM);
  }

  return {
    lang: DEFAULT_LANG,
    mapData: null,
    dataReady: false,
    mode: 'intro',
    prevMode: 'plan',
    suit: { ...initialSuitState },
    timeOfDay: 'day',
    layers: initialLayers,
    drawing: false,
    drawnPoints: [],
    drawnDistanceM: 0,
    routeSource: { kind: 'none' },
    routes: [],
    activeRouteId: null,
    routeAlerts: {},
    alerts: [],
    dossier: null,
    oxygen: null,
    pnr: null,
    scienceStops: [],
    chosenStopIds: [],
    highlightedScience: [],
    hoverIdx: null,
    rescuePlan: null,
    rescueStartedAt: null,
    returning: false,
    arrived: false,
    progressIdx: 0,
    position: { lat: BASE.lat, lng: BASE.lng },
    walking: false,
    sim: idleSim,
    pnrPrompt: null,
    selectedPhoto: null,
    photoPinned: false,
    chat: { messages: [], card: null, loading: false },
    pendingConfirm: null,
    robot: null,
    speakReplies: false,
    focus: null,
    cursor: null,
    zoom: 11,

    init() {
      try {
        const saved = window.localStorage.getItem(LANG_KEY);
        if (isLang(saved) && saved !== get().lang) get().setLang(saved);
        else document.documentElement.lang = get().lang;
      } catch {
        /* sem localStorage: fica no padrão */
      }
      if (get().dataReady) return;
      loadMapData()
        .then((data) => {
          set({ mapData: data, dataReady: true });
          recompute();
        })
        .catch((err) => console.error('[azimuth] loadMapData falhou', err));
    },

    setLang(l) {
      setFormatLang(l);
      set({ lang: l });
      try {
        window.localStorage.setItem(LANG_KEY, l);
      } catch {
        /* ok */
      }
      try {
        document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en';
      } catch {
        /* ok */
      }
      // textos de alertas/dossiê vêm do core no idioma pedido
      recompute({ replan: true });
    },

    setMode(m) {
      const s = get();
      if (m === s.mode) return;
      if (m === 'rescue') return get().enterRescue();
      if (m === 'walk') return get().startWalk();
      if (s.mode === 'rescue' || s.mode === 'walk') stopTimers();
      if (m === 'plan' && s.mode === 'walk') {
        set({ walking: false, sim: idleSim, pnrPrompt: null, position: { lat: s.activeRoute()?.points[0]?.lat ?? BASE.lat, lng: s.activeRoute()?.points[0]?.lng ?? BASE.lng }, progressIdx: 0 });
      }
      set({ mode: m, returning: false });
      if (m === 'plan') recompute();
    },

    setSuit(patch) {
      set({ suit: { ...get().suit, ...patch } });
      scheduleRecompute(true);
    },

    setTimeOfDay(t) {
      if (t === get().timeOfDay) return;
      set({ timeOfDay: t });
      recompute({ replan: true });
    },

    toggleLayer(id) {
      set({ layers: { ...get().layers, [id]: !get().layers[id] } });
    },

    setDrawing(on) {
      set({ drawing: on });
    },

    addDrawnPoint(p) {
      const pts = [...get().drawnPoints, p];
      const chain = [get().position, ...pts];
      let d = 0;
      for (let i = 1; i < chain.length; i++) d += safe('distanceM', () => core.distanceM(chain[i - 1], chain[i]), 0);
      set({ drawnPoints: pts, drawnDistanceM: d });
    },

    undoDrawnPoint() {
      const pts = get().drawnPoints.slice(0, -1);
      set({ drawnPoints: [], drawnDistanceM: 0 });
      pts.forEach((p) => get().addDrawnPoint(p));
    },

    clearDrawing() {
      set({ drawnPoints: [], drawnDistanceM: 0 });
    },

    planToLastPoint() {
      const pts = get().drawnPoints;
      const last = pts[pts.length - 1];
      if (!last) return;
      get().planTo(last);
      set({ drawing: false, drawnPoints: [], drawnDistanceM: 0 });
    },

    useDrawnRoute() {
      const s = get();
      if (!s.mapData || !s.drawnPoints.length) return;
      const points = [s.position, ...s.drawnPoints];
      const r = safe('routeFromPolyline', () => core.routeFromPolyline(points, s.mapData!, s.suit, s.timeOfDay, langOpts()), null as Route | null);
      if (!r) return;
      setRoutes([r], r.id, { kind: 'manual', points });
      set({ drawing: false, drawnPoints: [], drawnDistanceM: 0 });
    },

    planTo(to) {
      const s = get();
      if (!s.mapData) return;
      const from = s.position;
      const routes = safe('planRoutes', () => core.planRoutes(from, to, s.mapData!, s.suit, s.timeOfDay, langOpts()), [] as Route[]);
      if (!routes.length) return;
      setRoutes(routes, routes[0].id, { kind: 'plan', from, to, viaIds: [] });
    },

    selectRoute(id) {
      if (!get().routes.some((r) => r.id === id)) return;
      set({ activeRouteId: id, progressIdx: 0, hoverIdx: null });
      timeline = null;
      recompute();
    },

    clearRoutes() {
      set({ routes: [], activeRouteId: null, routeSource: { kind: 'none' }, progressIdx: 0, chosenStopIds: [], highlightedScience: [], scienceStops: [], hoverIdx: null });
      recompute();
    },

    toggleScienceStop(targetId) {
      const s = get();
      const src = s.routeSource;
      if (!s.mapData || src.kind !== 'plan') return;
      const chosen = s.chosenStopIds.includes(targetId) ? s.chosenStopIds.filter((x) => x !== targetId) : [...s.chosenStopIds, targetId];
      // ordena as paradas ao longo da rota atual (alongM); as desconhecidas pela distância da origem
      const along = new Map(s.scienceStops.map((st) => [st.target.id, st.alongM]));
      const order = (id: string) => {
        if (along.has(id)) return along.get(id)!;
        const t = s.mapData!.scienceTargets.find((x) => x.id === id);
        return t ? safe('distanceM', () => core.distanceM(src.from, t), 0) : 0;
      };
      const viaIds = [...chosen].sort((a, b) => order(a) - order(b));
      const routes = safe('planRoutes', () => core.planRoutes(src.from, src.to, s.mapData!, s.suit, s.timeOfDay, viaOpts(viaIds)), [] as Route[]);
      if (!routes.length) return;
      const prevProfile = s.activeRoute()?.profile;
      const keep = routes.find((r) => r.profile === prevProfile) ?? routes[0];
      setRoutes(routes, keep.id, { kind: 'plan', from: src.from, to: src.to, viaIds }, false);
    },

    setHoverIdx(i) {
      if (i !== get().hoverIdx) set({ hoverIdx: i });
    },

    startWalk() {
      const route = get().activeRoute();
      if (!route || !route.points.length) return;
      stopTimers();
      timeline = buildTimeline(route);
      pnrAckAhead = false;
      pnrAckPassed = false;
      const p0 = route.points[0];
      set({
        mode: 'walk', prevMode: 'walk', progressIdx: 0, position: { lat: p0.lat, lng: p0.lng }, walking: false,
        returning: false, arrived: false, sim: { ...idleSim, speed: get().sim.speed }, pnrPrompt: null, hoverIdx: null,
      });
      recompute();
      get().focusOn(p0, 13);
      pinnedAtDist = null;
      lastPhotoIdx = -1;
      set({ photoPinned: false });
      followPhoto(route, 0, 0);
    },

    /** Passo manual: anda ~1/8 da rota (ou 300 m) pelo relógio da missão, animado. */
    advance() {
      const s = get();
      const route = s.activeRoute();
      if (!route || s.walking || s.sim.running) return;
      if (!timeline || timeline.routeId !== route.id) timeline = buildTimeline(route);
      const pts = route.points;
      const cur = s.progressIdx;
      if (cur >= pts.length - 1) return;
      const targetDist = (pts[cur]?.distM ?? 0) + Math.max(300, route.distanceM / 8);
      let target = cur + 1;
      while (target < pts.length - 1 && pts[target].distM < targetDist) target++;
      const t0 = s.sim.elapsedMin;
      const t1 = Math.max(t0, timeline.depart[target] ?? timeline.total);
      set({ walking: true });
      const frames = 18;
      let f = 0;
      let lastT = t0;
      walkTimer = setInterval(() => {
        f++;
        const t = t0 + ((t1 - t0) * f) / frames;
        const pos = applyElapsed(route, t, t - lastT);
        lastT = t;
        if (f >= frames) {
          if (walkTimer) clearInterval(walkTimer);
          walkTimer = null;
          set({ walking: false });
          recompute();
          get().focusOn(pos);
          checkPnr(pos.distM);
        }
      }, 50);
    },

    setSimRunning(on) {
      const s = get();
      if (!on) return stopSim();
      if (s.mode !== 'walk' || !s.activeRoute() || s.sim.done) return;
      set({ sim: { ...s.sim, running: true }, pnrPrompt: null });
      simLast = performance.now();
      simLastRecompute = simLast;
      if (simTimer) clearInterval(simTimer);
      simTimer = setInterval(simTick, 100);
    },

    setSimSpeed(x) {
      set({ sim: { ...get().sim, speed: x } });
    },

    /** "Continuar" depois do aviso de ponto sem retorno. */
    ackPnr() {
      set({ pnrPrompt: null, chat: { ...get().chat, card: null } });
      get().setSimRunning(true);
    },

    enterRescue() {
      const s = get();
      if (s.mode === 'rescue') return;
      if (walkTimer) clearInterval(walkTimer);
      walkTimer = null;
      if (simTimer) clearInterval(simTimer);
      simTimer = null;
      set({
        prevMode: s.mode === 'walk' ? 'walk' : 'plan',
        mode: 'rescue',
        walking: false,
        sim: { ...s.sim, running: false },
        pnrPrompt: null,
        rescueStartedAt: Date.now(),
        returning: false,
        arrived: false,
        // o cartão proativo de ponto sem retorno já cumpriu o papel
        chat: s.chat.card?.kind ? { ...s.chat, card: null } : s.chat,
      });
      recompute();
      const plan = get().rescuePlan;
      if (plan) get().fitTo([plan.from, plan.shelter, ...plan.returnRoute.points]);
    },

    exitRescue() {
      stopTimers();
      const s = get();
      const back = s.prevMode === 'walk' && s.activeRoute() && !s.arrived ? 'walk' : 'plan';
      set({ mode: back, returning: false, rescueStartedAt: null });
      if (s.arrived) {
        set({ position: { lat: s.rescuePlan?.shelter.lat ?? BASE.lat, lng: s.rescuePlan?.shelter.lng ?? BASE.lng }, progressIdx: 0, arrived: false, sim: idleSim });
      }
      recompute();
    },

    startReturn() {
      const plan = get().rescuePlan;
      if (!plan || get().returning) return;
      const pts = plan.returnRoute.points;
      if (!pts.length) return;
      set({ returning: true, arrived: false });
      let i = 0;
      const stepN = Math.max(1, Math.ceil(pts.length / 60));
      returnTimer = setInterval(() => {
        i = Math.min(pts.length - 1, i + stepN);
        const p = pts[i];
        set({ position: { lat: p.lat, lng: p.lng } });
        if (i >= pts.length - 1) {
          if (returnTimer) clearInterval(returnTimer);
          returnTimer = null;
          set({ returning: false, arrived: true });
        }
      }, 80);
    },

    selectPhoto(p, pinned = false) {
      set({ selectedPhoto: p, photoPinned: p ? pinned : false });
      pinnedAtDist = p && pinned && get().mode === 'walk' ? get().sim.distM : null;
    },

    photoNear(at) {
      const data = get().mapData;
      if (!data) return;
      const p = safe('nearestPhoto', () => core.nearestPhoto(at, data), null);
      if (p) set({ selectedPhoto: p });
    },

    applyAzimuthActions(actions) {
      for (const a of actions) {
        switch (a.type) {
          case 'showRoutes': {
            if (!a.routes?.length) break;
            const pts = a.routes[0].points;
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (get().mode !== 'plan') set({ mode: 'plan', sim: idleSim });
            setRoutes(a.routes, a.selectId, first && last ? { kind: 'plan', from: first, to: last, viaIds: [] } : { kind: 'none' });
            break;
          }
          case 'addScienceStops': {
            if (!a.routes?.length) break;
            const pts = a.routes[0].points;
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (get().mode !== 'plan') set({ mode: 'plan', sim: idleSim });
            setRoutes(a.routes, a.selectId, first && last ? { kind: 'plan', from: first, to: last, viaIds: a.targetIds } : { kind: 'none' });
            set({ chosenStopIds: a.targetIds, highlightedScience: a.targetIds });
            break;
          }
          case 'showScience': {
            const ids = a.stops.map((st) => st.target.id);
            set({ highlightedScience: ids });
            if (a.stops.length) get().fitTo(a.stops.map((st) => st.target));
            break;
          }
          case 'selectRoute':
            get().selectRoute(a.routeId);
            break;
          case 'startRescue': {
            const s = get();
            if (s.mode !== 'rescue') {
              stopTimers();
              set({ prevMode: s.mode === 'walk' ? 'walk' : 'plan', mode: 'rescue', walking: false, sim: { ...s.sim, running: false }, pnrPrompt: null, rescueStartedAt: Date.now(), returning: false, arrived: false });
            }
            set({ rescuePlan: a.plan });
            get().fitTo([a.plan.from, a.plan.shelter, ...a.plan.returnRoute.points]);
            break;
          }
          case 'showPhoto':
            set({ selectedPhoto: a.photo, photoPinned: true });
            pinnedAtDist = get().mode === 'walk' ? get().sim.distM : null;
            get().focusOn(a.photo, 13);
            break;
          case 'focusMap':
            get().focusOn(a.at, a.zoom);
            break;
          case 'setTimeOfDay':
            get().setTimeOfDay(a.timeOfDay);
            break;
          case 'confirmRoverCall':
            // nunca executa sozinho: o astronauta precisa clicar em "Chamar"
            set({ pendingConfirm: { role: a.role, reason: a.reason, etaMin: a.etaMin } });
            break;
        }
      }
    },

    confirmRover(yes) {
      const p = get().pendingConfirm;
      if (!p) return;
      set({ pendingConfirm: null, robot: yes ? { ...p, startedAt: Date.now() } : get().robot });
      const lang = get().lang;
      get().pushMessage({ role: 'user', text: yes ? tr(lang, 'confirmYes', { role: p.role }) : tr(lang, 'confirmNo') });
    },

    setChat(patch) {
      set({ chat: { ...get().chat, ...patch } });
    },

    pushMessage(m) {
      const chat = get().chat;
      set({ chat: { ...chat, messages: [...chat.messages, m].slice(-20) } });
    },

    dismissCard() {
      set({ chat: { ...get().chat, card: null }, pnrPrompt: null });
    },

    setSpeakReplies(on) {
      set({ speakReplies: on });
    },

    focusOn(at, zoom) {
      set({ focus: { kind: 'point', at: { lat: at.lat, lng: at.lng }, zoom, n: ++focusN } });
    },

    fitTo(points) {
      if (points.length) set({ focus: { kind: 'bounds', points: points.map((p) => ({ lat: p.lat, lng: p.lng })), n: ++focusN } });
    },

    setCursor(c) {
      set({ cursor: c });
    },

    setZoom(z) {
      set({ zoom: z });
    },

    activeRoute() {
      const s = get();
      return s.routes.find((r) => r.id === s.activeRouteId) ?? null;
    },
  };
});

export function nextCardId(): number {
  return ++cardN;
}
