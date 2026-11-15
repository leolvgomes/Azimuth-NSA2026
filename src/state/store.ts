'use client';
/**
 * Estado global do Azimuth (zustand).
 * Regra: TODA conta de rota/O₂/alerta/resgate passa por `core` (@/core). Aqui só orquestramos
 * quando recalcular: suit, timeOfDay, rota ativa ou posição mudam → recompute().
 */
import { create } from 'zustand';
import { core } from '@/core';
import type {
  Alert, Dossier, LatLng, MapData, OxygenMargin, PointOfNoReturn, RescuePlan, Route, RoverPhoto,
  SuitState, TimeOfDay,
} from '@/core/types';
import type { AzimuthAction, ChatMessage } from '@/ai/contract';
import { loadMapData } from '@/data/loadMapData';
import { BASE } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import { LAYER_GROUPS, type LayerGroupId } from '@/lib/layers';

export type Mode = 'intro' | 'plan' | 'walk' | 'rescue';
export type RobotRole = 'scout' | 'rescue' | 'carrier' | 'relay';

export interface ReplyCard {
  id: number;
  text: string;
  actions: AzimuthAction[];
  source: 'gemini' | 'offline';
  error?: string;
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

/** De onde vieram as rotas visíveis (para recalcular quando o traje / dia-noite mudam). */
type RouteSource =
  | { kind: 'none' }
  | { kind: 'plan'; from: LatLng; to: LatLng }
  | { kind: 'manual'; points: LatLng[] };

export interface AzimuthState {
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

  rescuePlan: RescuePlan | null;
  rescueStartedAt: number | null;
  returning: boolean;
  arrived: boolean;

  progressIdx: number;
  position: LatLng;
  walking: boolean;

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

  startWalk(): void;
  advance(): void;

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

function mergeAlerts(a: Alert[], b: Alert[]): Alert[] {
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const al of [...a, ...b]) {
    const k = `${al.kind}:${al.fromIdx}:${al.toIdx}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(al);
  }
  return out.sort((x, y) => (x.severity === y.severity ? x.fromIdx - y.fromIdx : x.severity === 'critical' ? -1 : 1));
}

const initialLayers = Object.fromEntries(LAYER_GROUPS.map((g) => [g.id, g.defaultOn])) as Record<LayerGroupId, boolean>;

let walkTimer: ReturnType<typeof setInterval> | null = null;
let returnTimer: ReturnType<typeof setInterval> | null = null;
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
let focusN = 0;
let cardN = 0;

function stopTimers() {
  if (walkTimer) clearInterval(walkTimer);
  if (returnTimer) clearInterval(returnTimer);
  walkTimer = null;
  returnTimer = null;
}

export const useAzimuth = create<AzimuthState>()((set, get) => {
  /** Recalcula rotas (se a origem permite), alertas, dossiê, O₂, ponto sem retorno e plano de resgate. */
  function recompute(opts: { replan?: boolean } = {}) {
    const s = get();
    const data = s.mapData;
    if (!data) return;
    const { suit, timeOfDay: tod } = s;

    let routes = s.routes;
    let activeRouteId = s.activeRouteId;
    if (opts.replan && s.mode === 'plan' && s.routeSource.kind !== 'none') {
      const prevProfile = routes.find((r) => r.id === activeRouteId)?.profile;
      const src = s.routeSource;
      const next =
        src.kind === 'plan'
          ? safe('planRoutes', () => core.planRoutes(src.from, src.to, data, suit, tod), routes)
          : [safe('routeFromPolyline', () => core.routeFromPolyline(src.points, data, suit, tod), routes[0])].filter(Boolean);
      if (next.length) {
        routes = next;
        activeRouteId = (next.find((r) => r.profile === prevProfile) ?? next[0]).id;
      }
    }

    const routeAlerts: Record<string, Alert[]> = {};
    for (const r of routes) {
      routeAlerts[r.id] = mergeAlerts(r.alerts ?? [], safe('evaluateRoute', () => core.evaluateRoute(r, data, suit, tod), []));
    }
    const active = routes.find((r) => r.id === activeRouteId) ?? null;
    const here = s.position;
    const stillRoute = safe('routeFromPolyline', () => core.routeFromPolyline([here, here], data, suit, tod), null as Route | null);

    const patch: Partial<AzimuthState> = {
      routes,
      activeRouteId: active?.id ?? null,
      routeAlerts,
      alerts: active ? routeAlerts[active.id] ?? [] : [],
      dossier: active ? safe('buildDossier', () => core.buildDossier(active, data, tod), null) : null,
      oxygen: active || stillRoute ? safe('oxygenMargin', () => core.oxygenMargin((active ?? stillRoute)!, suit), null) : null,
      pnr: active ? safe('pointOfNoReturn', () => core.pointOfNoReturn(active, suit), null) : null,
    };
    if (!s.returning) {
      patch.rescuePlan = safe(
        'computeRescue',
        () => core.computeRescue(here, s.progressIdx, s.mode === 'walk' || s.mode === 'rescue' ? active : null, data, suit, tod),
        s.rescuePlan,
      );
    }
    set(patch);
  }

  function scheduleRecompute(replan: boolean) {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => recompute({ replan }), 220);
  }

  function setRoutes(routes: Route[], selectId: string | null, source: RouteSource) {
    set({ routes, activeRouteId: selectId ?? routes[0]?.id ?? null, routeSource: source, progressIdx: 0 });
    recompute();
    const active = get().activeRoute();
    if (active) get().fitTo(active.points);
    const last = active?.points[active.points.length - 1];
    if (last && !get().photoPinned) get().photoNear(active!.points[Math.floor(active!.points.length / 2)] ?? last);
  }

  return {
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
    rescuePlan: null,
    rescueStartedAt: null,
    returning: false,
    arrived: false,
    progressIdx: 0,
    position: { lat: BASE.lat, lng: BASE.lng },
    walking: false,
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
      if (get().dataReady) return;
      loadMapData()
        .then((data) => {
          set({ mapData: data, dataReady: true });
          recompute();
        })
        .catch((err) => console.error('[azimuth] loadMapData falhou', err));
    },

    setMode(m) {
      const s = get();
      if (m === s.mode) return;
      if (m === 'rescue') return get().enterRescue();
      if (m === 'walk') return get().startWalk();
      if (s.mode === 'rescue') stopTimers();
      if (m === 'plan' && s.mode === 'walk') {
        stopTimers();
        set({ walking: false });
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
      set({ drawnPoints: [] , drawnDistanceM: 0 });
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
      const r = safe('routeFromPolyline', () => core.routeFromPolyline(points, s.mapData!, s.suit, s.timeOfDay), null as Route | null);
      if (!r) return;
      setRoutes([r], r.id, { kind: 'manual', points });
      set({ drawing: false, drawnPoints: [], drawnDistanceM: 0 });
    },

    planTo(to) {
      const s = get();
      if (!s.mapData) return;
      const from = s.position;
      const routes = safe('planRoutes', () => core.planRoutes(from, to, s.mapData!, s.suit, s.timeOfDay), [] as Route[]);
      if (!routes.length) return;
      setRoutes(routes, routes[0].id, { kind: 'plan', from, to });
    },

    selectRoute(id) {
      if (!get().routes.some((r) => r.id === id)) return;
      set({ activeRouteId: id, progressIdx: 0 });
      recompute();
    },

    clearRoutes() {
      set({ routes: [], activeRouteId: null, routeSource: { kind: 'none' }, progressIdx: 0 });
      recompute();
    },

    startWalk() {
      const route = get().activeRoute();
      if (!route || !route.points.length) return;
      stopTimers();
      const p0 = route.points[0];
      set({ mode: 'walk', prevMode: 'walk', progressIdx: 0, position: { lat: p0.lat, lng: p0.lng }, walking: false, returning: false, arrived: false });
      recompute();
      get().focusOn(p0, 13);
      get().photoNear(route.points[Math.min(route.points.length - 1, 3)]);
    },

    advance() {
      const s = get();
      const route = s.activeRoute();
      if (!route || s.walking) return;
      const pts = route.points;
      const cur = s.progressIdx;
      if (cur >= pts.length - 1) return;
      const step = Math.max(300, route.distanceM / 8);
      const targetDist = pts[cur].distM + step;
      let target = cur + 1;
      while (target < pts.length - 1 && pts[target].distM < targetDist) target++;
      set({ walking: true });
      const frames = 18;
      let f = 0;
      walkTimer = setInterval(() => {
        f++;
        const idx = Math.round(cur + ((target - cur) * f) / frames);
        const p = pts[Math.min(idx, pts.length - 1)];
        set({ progressIdx: idx, position: { lat: p.lat, lng: p.lng } });
        if (f >= frames) {
          if (walkTimer) clearInterval(walkTimer);
          walkTimer = null;
          set({ walking: false });
          recompute();
          get().focusOn(p);
          const ahead = pts[Math.min(pts.length - 1, idx + 3)];
          if (!get().photoPinned) get().photoNear(ahead);
        }
      }, 50);
    },

    enterRescue() {
      const s = get();
      if (s.mode === 'rescue') return;
      if (walkTimer) clearInterval(walkTimer);
      walkTimer = null;
      set({
        prevMode: s.mode === 'walk' ? 'walk' : 'plan',
        mode: 'rescue',
        walking: false,
        rescueStartedAt: Date.now(),
        returning: false,
        arrived: false,
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
        set({ position: { lat: s.rescuePlan?.shelter.lat ?? BASE.lat, lng: s.rescuePlan?.shelter.lng ?? BASE.lng }, progressIdx: 0, arrived: false });
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
            const first = a.routes[0].points[0];
            const lastPts = a.routes[0].points;
            const last = lastPts[lastPts.length - 1];
            if (get().mode !== 'plan') set({ mode: 'plan' });
            setRoutes(a.routes, a.selectId, first && last ? { kind: 'plan', from: first, to: last } : { kind: 'none' });
            break;
          }
          case 'selectRoute':
            get().selectRoute(a.routeId);
            break;
          case 'startRescue': {
            const s = get();
            if (s.mode !== 'rescue') {
              if (walkTimer) clearInterval(walkTimer);
              walkTimer = null;
              set({ prevMode: s.mode === 'walk' ? 'walk' : 'plan', mode: 'rescue', walking: false, rescueStartedAt: Date.now(), returning: false, arrived: false });
            }
            set({ rescuePlan: a.plan });
            get().fitTo([a.plan.from, a.plan.shelter, ...a.plan.returnRoute.points]);
            break;
          }
          case 'showPhoto':
            set({ selectedPhoto: a.photo, photoPinned: true });
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
      get().pushMessage({ role: 'user', text: yes ? `Confirmo: chamar robô (${p.role}).` : 'Não chamar o robô agora.' });
    },

    setChat(patch) {
      set({ chat: { ...get().chat, ...patch } });
    },

    pushMessage(m) {
      const chat = get().chat;
      set({ chat: { ...chat, messages: [...chat.messages, m].slice(-20) } });
    },

    dismissCard() {
      set({ chat: { ...get().chat, card: null } });
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
