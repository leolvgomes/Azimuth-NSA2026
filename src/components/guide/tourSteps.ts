'use client';
/**
 * Passos do tutorial interativo. Textos em src/config/about.ts (tourCopy[lang].steps[id]).
 *
 * - target: valor de data-tour="..." do elemento destacado (sem target = cartão centralizado).
 * - done(state, snap): ação concluída? `snap` é o estado do app quando o passo abriu, para
 *   condições relativas ("mudou o zoom", "escolheu OUTRA rota"). Passos sem `done` são só leitura.
 * - assist: "faça por mim", executa a mesma ação pelo store (sempre pelo caminho normal do app).
 */
import { DEMO_TARGET } from '@/config/mission';
import { tourCopy } from '@/config/about';
import { askAzimuth } from '@/lib/azimuthClient';
import { useAzimuth, type AzimuthState } from '@/state/store';

export type Placement = 'auto' | 'center' | 'bottom';

export interface TourStep {
  id: string;
  target?: string;
  /** Painel onde o alvo mora: o tutorial o abre (coluna no desktop, gaveta no celular). */
  panel?: 'left' | 'right';
  placement?: Placement;
  /** Escurece o resto da tela (padrão: true quando há target). */
  dim?: boolean;
  done?: (s: AzimuthState, snap: AzimuthState) => boolean;
  assist?: () => void;
}

const app = () => useAzimuth.getState();

/** Garante uma rota até o delta (para passos que dependem dela quando o usuário pulou o anterior). */
function ensureRoute() {
  const s = app();
  if (!s.activeRoute() && s.dataReady) s.planTo(DEMO_TARGET);
}

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome', placement: 'center' },
  {
    id: 'map',
    placement: 'bottom',
    dim: false,
    done: (s, snap) => s.zoom !== snap.zoom,
  },
  {
    id: 'layers',
    target: 'layer-thermal',
    panel: 'left',
    done: (s) => s.layers.thermal,
    assist: () => {
      if (!app().layers.thermal) app().toggleLayer('thermal');
    },
  },
  {
    id: 'night',
    target: 'day-night',
    panel: 'left',
    done: (s) => s.timeOfDay === 'night',
    assist: () => app().setTimeOfDay('night'),
  },
  {
    id: 'ask',
    target: 'azimuth-bar',
    done: (s) => s.routes.length > 0,
    assist: () => {
      const s = app();
      if (s.chat.loading) return;
      void askAzimuth(tourCopy[s.lang].askPhrase);
    },
  },
  {
    id: 'options',
    target: 'route-options',
    panel: 'right',
    done: (s, snap) => !!s.activeRouteId && s.activeRouteId !== snap.activeRouteId,
    assist: () => {
      const before = app().activeRouteId;
      ensureRoute();
      const s = app();
      const other = s.routes.find((r) => r.id !== before);
      if (other) s.selectRoute(other.id);
    },
  },
  { id: 'alerts', target: 'alerts' },
  { id: 'dossier', target: 'route-panel', panel: 'right' },
  {
    id: 'suit',
    target: 'suit-o2',
    done: (s, snap) => Math.abs(s.suit.o2Pct - snap.suit.o2Pct) >= 3,
    assist: () => {
      const s = app();
      s.setSuit({ o2Pct: Math.max(25, Math.round(s.suit.o2Pct - 20)) });
    },
  },
  {
    id: 'walk',
    target: 'walk-btn',
    panel: 'right',
    done: (s) => s.mode === 'walk',
    assist: () => {
      ensureRoute();
      if (app().activeRoute()) app().setMode('walk');
    },
  },
  {
    id: 'clock',
    target: 'walk-controls',
    panel: 'left',
    done: (s) => s.sim.running || s.sim.elapsedMin > 0,
    assist: () => {
      const s = app();
      if (s.mode !== 'walk') return;
      s.setSimSpeed(16);
      s.setSimRunning(true);
    },
  },
  {
    id: 'rescue',
    target: 'rescue-btn',
    done: (s) => s.mode === 'rescue',
    assist: () => app().enterRescue(),
  },
  { id: 'home', target: 'rescue-panel', panel: 'left' },
  { id: 'robots', target: 'robots', panel: 'right' },
  { id: 'done', placement: 'center' },
];
