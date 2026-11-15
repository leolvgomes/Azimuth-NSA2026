'use client';
/**
 * Estado da tela "Sobre" e do tutorial interativo (separado do store principal para não misturar).
 * O tutorial roda sobre o app de verdade: cada passo observa o store principal (useAzimuth) e
 * avança sozinho quando o usuário faz a ação pedida (ver src/components/guide/tourSteps.ts).
 */
import { create } from 'zustand';
import { initialSuitState } from '@/config/suit';
import { useAzimuth } from './store';
import { TOUR_STEPS } from '@/components/guide/tourSteps';

export interface GuideState {
  aboutOpen: boolean;
  /** Seção aberta na tela Sobre. */
  aboutSection: number;
  /** Passo atual do tutorial (null = fechado). */
  tourStep: number | null;

  openAbout(section?: number): void;
  closeAbout(): void;
  setAboutSection(i: number): void;
  startTour(): void;
  nextStep(): void;
  prevStep(): void;
  endTour(): void;
}

/** Deixa o app num estado limpo e previsível para o tutorial (modo Planejar, sem rota, dia). */
function resetAppForTour() {
  let a = useAzimuth.getState();
  if (a.mode === 'rescue') a.exitRescue();
  a = useAzimuth.getState();
  if (a.mode !== 'plan') a.setMode('plan');
  a = useAzimuth.getState();
  a.clearDrawing();
  a.setDrawing(false);
  a.clearRoutes();
  a.dismissCard();
  if (a.timeOfDay !== 'day') a.setTimeOfDay('day');
  if (a.layers.thermal) a.toggleLayer('thermal');
  a.setSuit({ ...initialSuitState });
}

export const useGuide = create<GuideState>()((set, get) => ({
  aboutOpen: false,
  aboutSection: 0,
  tourStep: null,

  openAbout(section = 0) {
    set({ aboutOpen: true, aboutSection: section });
  },
  closeAbout() {
    set({ aboutOpen: false });
  },
  setAboutSection(i) {
    set({ aboutSection: i });
  },
  startTour() {
    resetAppForTour();
    set({ aboutOpen: false, tourStep: 0 });
  },
  nextStep() {
    const s = get().tourStep;
    if (s == null) return;
    set({ tourStep: s + 1 >= TOUR_STEPS.length ? null : s + 1 });
  },
  prevStep() {
    const s = get().tourStep;
    if (s == null || s === 0) return;
    set({ tourStep: s - 1 });
  },
  endTour() {
    set({ tourStep: null });
  },
}));
