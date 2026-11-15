'use client';
/**
 * Fala com a assistente: POST /api/azimuth → se falhar (rede, rota ainda não existe, erro),
 * usa o plano B `offlineAnswer` de @/ai/offline no próprio navegador → se nem isso existir,
 * mostra "assistente offline".
 */
import type { AppSnapshot, AzimuthRequest, AzimuthResponse, ChatMessage } from '@/ai/contract';
import { loadMapData } from '@/data/loadMapData';
import { loadOfflineAnswer } from '@/lib/optionalModules';
import { nextCardId, useAzimuth } from '@/state/store';
import { speak } from '@/lib/speech';

function snapshot(): AppSnapshot {
  const s = useAzimuth.getState();
  return {
    suit: s.suit,
    timeOfDay: s.timeOfDay,
    position: s.position,
    mode: s.mode === 'intro' ? 'plan' : s.mode,
    activeRouteId: s.activeRouteId,
    routes: s.routes,
    progressIdx: s.progressIdx,
  };
}

async function viaServer(req: AzimuthRequest): Promise<AzimuthResponse | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch('/api/azimuth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const json = (await r.json()) as AzimuthResponse;
    if (!json || typeof json.text !== 'string') return null;
    return { ...json, actions: Array.isArray(json.actions) ? json.actions : [] };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function viaOffline(req: AzimuthRequest): Promise<AzimuthResponse> {
  const fn = await loadOfflineAnswer();
  if (!fn) {
    return {
      text: 'Assistente offline no momento. Você ainda pode traçar rotas, ver alertas e entrar no modo Resgate pelos botões.',
      actions: [],
      source: 'offline',
      error: 'offline-module-missing',
    };
  }
  try {
    const data = useAzimuth.getState().mapData ?? (await loadMapData());
    return await fn(req, data);
  } catch (err) {
    return {
      text: 'Não consegui responder agora. Tente de novo ou use os botões do painel.',
      actions: [],
      source: 'offline',
      error: String(err),
    };
  }
}

export async function askAzimuth(text: string): Promise<void> {
  const q = text.trim();
  const store = useAzimuth.getState();
  if (!q || store.chat.loading) return;
  const userMsg: ChatMessage = { role: 'user', text: q };
  store.pushMessage(userMsg);
  store.setChat({ loading: true });

  const req: AzimuthRequest = { messages: useAzimuth.getState().chat.messages, snapshot: snapshot() };
  const res = (await viaServer(req)) ?? (await viaOffline(req));

  const s = useAzimuth.getState();
  s.pushMessage({ role: 'assistant', text: res.text });
  s.setChat({
    loading: false,
    card: { id: nextCardId(), text: res.text, actions: res.actions, source: res.source, error: res.error },
  });
  s.applyAzimuthActions(res.actions);
  if (useAzimuth.getState().speakReplies) speak(res.text);
}
