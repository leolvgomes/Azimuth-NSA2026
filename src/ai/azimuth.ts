/**
 * Orquestração da Azimuth no SERVIDOR (usada pela rota /api/azimuth).
 * Não importe isto no cliente: lê process.env. O cliente usa offline.ts direto.
 */
import { GoogleGenAI, FunctionCallingConfigMode, type Content, type Part } from '@google/genai';
import { DEFAULT_LANG } from '@/config/i18n';
import { loadMapData } from '@/data/loadMapData';
import type { MapData } from '@/core/types';
import type { AppSnapshot, AzimuthAction, AzimuthRequest, AzimuthResponse, ChatMessage } from './contract';
import { detectIntent, offlineAnswer } from './offline';
import { buildSystemPrompt } from './prompt';
import { runTool, TOOL_DECLARATIONS, type ToolContext } from './tools';

export const DEFAULT_MODEL = 'gemini-3.5-flash';
/** Reserva: se o modelo escolhido estiver sobrecarregado (503), aposentado (404) ou sem cota (429), tenta o próximo. */
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
const MAX_ROUNDS = 4;
/** Tempo máximo de uma tentativa no Gemini; depois disso o plano B responde (o cliente desiste em 16 s). */
const TIMEOUT_MS = 12_000;
/** Só tenta o modelo reserva se ainda sobrar tempo: melhor o plano B rápido do que esperar 30 s. */
const RETRY_BUDGET_MS = 6_000;
/** Opções visíveis que o servidor aceita do cliente (cada rota traz todos os pontos). */
const MAX_ROUTES = 4;
const MAX_ROUTE_POINTS = 2_000;

export function modelChain(env: Record<string, string | undefined> = process.env): string[] {
  return [...new Set([(env.GEMINI_MODEL ?? '').trim() || DEFAULT_MODEL, ...FALLBACK_MODELS])];
}

/** Erros em que vale tentar outro modelo (não inclui timeout, para não estourar a espera). */
function isRetryableModelError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(503|404|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|no longer available|high demand|thinking/i.test(msg);
}
const MAX_MESSAGES = 12;
const MAX_TEXT = 2000;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida e normaliza o corpo. Retorna string com o motivo se inválido. */
export function parseRequest(body: unknown): AzimuthRequest | string {
  if (!isObj(body)) return 'body must be an object';
  if (!Array.isArray(body.messages)) return 'messages must be an array';
  const messages: ChatMessage[] = [];
  for (const m of body.messages) {
    if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') {
      return 'each message needs role (user|assistant) and text';
    }
    messages.push({ role: m.role, text: m.text.slice(0, MAX_TEXT) });
  }
  if (!messages.some((m) => m.role === 'user' && m.text.trim())) return 'no user message';
  const s = body.snapshot;
  if (!isObj(s)) return 'snapshot must be an object';
  const suit = s.suit, pos = s.position;
  if (!isObj(suit) || !isNum(suit.o2Pct) || !isNum(suit.batteryPct)) return 'snapshot.suit invalid';
  if (!isObj(pos) || !isNum(pos.lat) || !isNum(pos.lng)) return 'snapshot.position invalid';
  const snapshot: AppSnapshot = {
    suit: { o2Pct: suit.o2Pct, batteryPct: suit.batteryPct, suitTempC: isNum(suit.suitTempC) ? suit.suitTempC : 18 },
    timeOfDay: s.timeOfDay === 'night' ? 'night' : 'day',
    position: { lat: pos.lat, lng: pos.lng },
    mode: s.mode === 'walk' || s.mode === 'rescue' ? s.mode : 'plan',
    activeRouteId: typeof s.activeRouteId === 'string' ? s.activeRouteId : null,
    routes: Array.isArray(s.routes)
      ? (s.routes as AppSnapshot['routes'])
          .filter((r) => isObj(r) && Array.isArray(r.points) && r.points.length <= MAX_ROUTE_POINTS && Array.isArray(r.alerts))
          .slice(0, MAX_ROUTES)
      : [],
    progressIdx: isNum(s.progressIdx) ? Math.max(0, Math.floor(s.progressIdx)) : 0,
    lang: s.lang === 'pt' ? 'pt' : DEFAULT_LANG,
    ...(isNum(s.missionElapsedMin) ? { missionElapsedMin: Math.max(0, s.missionElapsedMin) } : {}),
  };
  return { messages: messages.slice(-MAX_MESSAGES), snapshot };
}

/** Plano B forçado (AZIMUTH_OFFLINE=true) ou sem chave. Não expõe a chave, só testa presença. */
export function shouldUseOffline(env: Record<string, string | undefined> = process.env): boolean {
  return env.AZIMUTH_OFFLINE === 'true' || !(env.GEMINI_API_KEY ?? '').trim();
}

export async function answer(body: unknown, opts: { forceOffline?: string } = {}): Promise<AzimuthResponse | { error: string }> {
  const req = parseRequest(body);
  if (typeof req === 'string') return { error: req };
  const data = await loadMapData();
  if (opts.forceOffline) return { ...(await offlineAnswer(req, data)), error: opts.forceOffline };
  if (shouldUseOffline()) return offlineAnswer(req, data);
  let lastError: unknown = null;
  const started = Date.now();
  for (const model of modelChain()) {
    if (lastError && Date.now() - started > RETRY_BUDGET_MS) break;
    try {
      const res = await withTimeout(geminiAnswer(req, data, process.env.GEMINI_API_KEY!.trim(), model), TIMEOUT_MS + 1000);
      // Rede de segurança: pedido de rover sem call_rover → o modelo inventou o ETA; usa o plano B (ETA do core).
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.text ?? '';
      if (detectIntent(lastUser) === 'rover' && !res.actions.some((a) => a.type === 'confirmRoverCall')) {
        return { ...(await offlineAnswer(req, data)), error: 'gemini skipped call_rover' };
      }
      return res;
    } catch (e) {
      lastError = e;
      if (!isRetryableModelError(e)) break;
    }
  }
  const fallback = await offlineAnswer(req, data);
  return { ...fallback, error: safeError(lastError) };
}

function safeError(e: unknown): string {
  let msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  if (key) msg = msg.split(key).join('***');
  return msg.replace(/key=[^&\s"]+/gi, 'key=***').slice(0, 300);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (err) => { clearTimeout(id); reject(err); });
  });
}

export async function geminiAnswer(req: AzimuthRequest, data: MapData, apiKey: string, modelOverride?: string): Promise<AzimuthResponse> {
  const ai = new GoogleGenAI({ apiKey });
  const model = modelOverride ?? ((process.env.GEMINI_MODEL ?? '').trim() || DEFAULT_MODEL);
  const ctx: ToolContext = { data, snapshot: req.snapshot };
  const actions: AzimuthAction[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Gemini exige que a conversa comece pelo usuário.
  const msgs = [...req.messages];
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const contents: Content[] = msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));

  try {
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const lastRound = round === MAX_ROUNDS;
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(ctx.snapshot),
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: lastRound ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO } },
          temperature: 0.3,
          maxOutputTokens: 400,
          // Sem "raciocínio" interno: o cálculo é do core; isso derruba a latência de ~25 s para ~3 s.
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: controller.signal,
        },
      });
      const calls = res.functionCalls ?? [];
      if (!calls.length || lastRound) {
        const text = (res.text ?? '').trim();
        if (!text) throw new Error('empty model response');
        return { text, actions: dedupe(actions), source: 'gemini' };
      }
      // Devolve o turno do modelo intacto (preserva thoughtSignature) e responde cada chamada.
      const modelContent = res.candidates?.[0]?.content;
      contents.push(modelContent?.parts?.length ? { role: 'model', parts: modelContent.parts } : { role: 'model', parts: calls.map((c) => ({ functionCall: c })) });
      const parts: Part[] = calls.map((c) => {
        const r = runTool(c.name ?? '', c.args, ctx);
        if (process.env.AZIMUTH_DEBUG === 'true') console.info('[azimuth] tool', c.name, JSON.stringify(c.args), '→', JSON.stringify(r.summary));
        actions.push(...r.actions);
        return { functionResponse: { id: c.id, name: c.name, response: r.summary } };
      });
      contents.push({ role: 'user', parts });
    }
    throw new Error('function calling loop exhausted');
  } finally {
    clearTimeout(timer);
  }
}

/** Ações de "estado" repetidas: fica só a última de cada tipo (showRoutes, setTimeOfDay, startRescue...). */
function dedupe(actions: AzimuthAction[]): AzimuthAction[] {
  const keepAll = new Set<AzimuthAction['type']>(['confirmRoverCall']);
  const out: AzimuthAction[] = [];
  const seen = new Set<string>();
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (keepAll.has(a.type) || !seen.has(a.type)) { out.unshift(a); seen.add(a.type); }
  }
  return out;
}
