'use client';
/**
 * Layout responsivo do app: colunas laterais recolhíveis (telas médias) e "gaveta" inferior (celular).
 * Fica separado do store principal (não é estado da missão). O tutorial usa reveal() para abrir o
 * painel do passo atual em qualquer tamanho de tela.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';

export type Side = 'left' | 'right';
/** Abaixo disto: layout de celular (gaveta). */
export const MOBILE_MAX = 900;
/** Abaixo disto (e acima do celular): coluna esquerda começa recolhida. */
export const WIDE_MIN = 1280;

export interface LayoutState {
  leftOpen: boolean;
  rightOpen: boolean;
  /** Painel aberto na gaveta do celular. */
  sheet: Side | null;
  setOpen(side: Side, open: boolean): void;
  setSheet(side: Side | null): void;
  /** Garante que o painel do lado esteja visível (coluna no desktop, gaveta no celular). */
  reveal(side: Side | null): void;
  /** Ajusta os padrões quando a classe de tela muda (celular / médio / largo). */
  applyDefaults(width: number): void;
}

const isMobile = (w: number) => w > 0 && w < MOBILE_MAX;

export const useLayout = create<LayoutState>()((set) => ({
  leftOpen: true,
  rightOpen: true,
  sheet: null,
  setOpen(side, open) {
    set(side === 'left' ? { leftOpen: open } : { rightOpen: open });
  },
  setSheet(sheet) {
    set({ sheet });
  },
  reveal(side) {
    if (typeof window !== 'undefined' && isMobile(window.innerWidth)) {
      set({ sheet: side });
      return;
    }
    if (side === 'left') set({ leftOpen: true });
    if (side === 'right') set({ rightOpen: true });
  },
  applyDefaults(width) {
    if (isMobile(width)) set({ sheet: null });
    else set({ leftOpen: width >= WIDE_MIN, rightOpen: true, sheet: null });
  },
}));

/** Largura/altura da janela (0 no servidor). Ao mudar de classe de tela, reaplica os padrões do layout. */
export function useViewport() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    let cls = '';
    const upd = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setSize({ w, h });
      const next = isMobile(w) ? 'm' : w < WIDE_MIN ? 'md' : 'lg';
      if (next !== cls) {
        cls = next;
        useLayout.getState().applyDefaults(w);
      }
    };
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);
  return { ...size, mobile: isMobile(size.w) };
}
