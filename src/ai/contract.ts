/**
 * CONTRATO entre a rota /api/azimuth (servidor), o plano B (cliente) e a UI.
 * A IA nunca devolve números inventados: devolve texto + AÇÕES que a UI aplica.
 * Só o orquestrador altera este arquivo.
 */
import type { LatLng, RescuePlan, Route, RoverPhoto, SuitState, TimeOfDay } from '@/core/types';

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
  /** Ações físicas (chamar rover) SEMPRE pedem confirmação do astronauta. */
  | { type: 'confirmRoverCall'; role: 'scout' | 'rescue' | 'carrier' | 'relay'; reason: string; etaMin: number };

export interface AzimuthResponse {
  text: string; // resposta curta (cartão sobre o mapa)
  actions: AzimuthAction[];
  source: 'gemini' | 'offline'; // offline = plano B
  error?: string;
}
