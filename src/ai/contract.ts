/**
 * CONTRATO entre a rota /api/azimuth (servidor), o plano B (cliente) e a UI.
 * A IA nunca devolve números inventados: devolve texto + AÇÕES que a UI aplica.
 * Só o orquestrador altera este arquivo.
 */
import type { Lang, LatLng, RescuePlan, Route, RoverPhoto, ScienceStopOnRoute, SuitState, TimeOfDay } from '@/core/types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Snapshot do app enviado a cada pergunta (a IA não tem outro acesso ao estado). */
export interface AppSnapshot {
  suit: SuitState;
  timeOfDay: TimeOfDay;
  position: LatLng; // posição atual do astronauta
  mode: 'plan' | 'walk' | 'rescue';
  activeRouteId: string | null;
  routes: Route[]; // opções visíveis no momento
  progressIdx: number; // índice do ponto atual na rota ativa (modo walk)
  /** Idioma da interface; a Azimuth responde nele. Padrão 'en'. */
  lang?: Lang;
  /** Minutos de missão decorridos na caminhada (modo walk). */
  missionElapsedMin?: number;
}

export interface AzimuthRequest {
  messages: ChatMessage[];
  snapshot: AppSnapshot;
}

export type AzimuthAction =
  | { type: 'showRoutes'; routes: Route[]; selectId: string }
  | { type: 'selectRoute'; routeId: string }
  | { type: 'startRescue'; plan: RescuePlan }
  | { type: 'showPhoto'; photo: RoverPhoto }
  | { type: 'focusMap'; at: LatLng; zoom?: number }
  | { type: 'setTimeOfDay'; timeOfDay: TimeOfDay }
  /** Destaca paradas científicas ao longo da rota (painel + mapa). */
  | { type: 'showScience'; stops: ScienceStopOnRoute[] }
  /** Replaneja as rotas passando pelos alvos (ids de science-targets.json), na ordem. */
  | { type: 'addScienceStops'; targetIds: string[]; routes: Route[]; selectId: string }
  /** Ações físicas (chamar rover) SEMPRE pedem confirmação do astronauta. */
  | { type: 'confirmRoverCall'; role: 'scout' | 'rescue' | 'carrier' | 'relay'; reason: string; etaMin: number };

export interface AzimuthResponse {
  text: string; // resposta curta (cartão sobre o mapa)
  actions: AzimuthAction[];
  source: 'gemini' | 'offline'; // offline = plano B
  error?: string;
}
