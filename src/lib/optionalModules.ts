/**
 * Carrega módulos de outros agentes que podem ainda não existir no repositório
 * (src/components/globe/MarsIntro.tsx e src/ai/offline.ts).
 *
 * `require.context` com regex exata: se o arquivo não existir, o contexto fica vazio e o
 * build continua passando; quando o arquivo aparecer, o webpack o inclui (inclusive no dev, com HMR).
 * Modo 'lazy' = chunk separado (o three.js do globo só baixa quando a intro abre).
 * Os contextos só são criados no navegador (no prerender do servidor o webpack não tem esses chunks).
 */
import type { ComponentType } from 'react';
import type { AzimuthRequest, AzimuthResponse } from '@/ai/contract';
import type { Lang, MapData } from '@/core/types';

export type MarsIntroComponent = ComponentType<{ onEnter: () => void; lang?: Lang }>;
export type OfflineAnswerFn = (req: AzimuthRequest, data: MapData) => Promise<AzimuthResponse>;

function safeContext(make: () => AzimuthRequireContext): AzimuthRequireContext | null {
  try {
    return make();
  } catch {
    return null;
  }
}

const globeCtx = () =>
  typeof window === 'undefined' ? null : safeContext(() => require.context('../components', true, /^\.\/globe\/MarsIntro\.(tsx|ts|jsx|js)$/, 'lazy'));
const aiCtx = () =>
  typeof window === 'undefined' ? null : safeContext(() => require.context('../ai', false, /^\.\/offline\.(ts|tsx|js)$/, 'lazy'));

async function loadFrom<T>(ctx: AzimuthRequireContext | null, pick: (mod: Record<string, unknown>) => T | undefined) {
  if (!ctx) return null;
  const key = ctx.keys()[0];
  if (!key) return null;
  try {
    const mod = (await ctx(key)) as Record<string, unknown>;
    return pick(mod) ?? null;
  } catch (err) {
    console.warn('[azimuth] módulo opcional falhou ao carregar', key, err);
    return null;
  }
}

export function loadMarsIntro(): Promise<MarsIntroComponent | null> {
  return loadFrom(globeCtx(), (m) => (m.default ?? m.MarsIntro) as MarsIntroComponent | undefined);
}

export function loadOfflineAnswer(): Promise<OfflineAnswerFn | null> {
  return loadFrom(aiCtx(), (m) => (m.offlineAnswer ?? m.default) as OfflineAnswerFn | undefined);
}
