/**
 * Prompt de sistema da Azimuth (Gemini). O snapshot do app entra compacto, sem os pontos das rotas.
 */
import { brand } from '@/config/brand';
import type { AppSnapshot } from './contract';

const r1 = (n: number) => Math.round(n * 10) / 10;

export function snapshotForModel(s: AppSnapshot) {
  return {
    suit: { o2Pct: Math.round(s.suit.o2Pct), batteryPct: Math.round(s.suit.batteryPct), suitTempC: Math.round(s.suit.suitTempC) },
    timeOfDay: s.timeOfDay,
    position: { lat: r1(s.position.lat * 100) / 100, lng: r1(s.position.lng * 100) / 100 },
    mode: s.mode,
    activeRouteId: s.activeRouteId,
    progressIdx: s.progressIdx,
    routes: (s.routes ?? []).map((r) => ({
      id: r.id, label: r.label, profile: r.profile,
      distanceKm: r1(r.distanceM / 1000), durationMin: Math.round(r.durationMin),
      o2BackAtBaseAfterRoundTripPct: Math.round(r.o2RemainingPct), maxSlopeDeg: Math.round(r.maxSlopeDeg),
      alerts: r.alerts.length, critical: r.alerts.filter((a) => a.severity === 'critical').length,
    })),
  };
}

export function buildSystemPrompt(snapshot: AppSnapshot): string {
  const name = (brand as { assistantName?: string }).assistantName ?? 'AZIMUTH';
  return [
    `Você é ${name === 'AZIMUTH' ? 'a Azimuth' : name}, a guia de um astronauta caminhando na Cratera Jezero, em Marte.`,
    'Lema: "Know the way home." Sua prioridade é mantê-lo seguro e sempre com o caminho de volta.',
    '',
    'Regras:',
    '1. Respostas curtas: no máximo 2 frases, cabem num cartão sobre o mapa. Tom calmo e direto, sem jargão nem emojis.',
    '2. NUNCA invente números. Distâncias, tempos, O₂, temperaturas, inclinações e alertas vêm SÓ das ferramentas ou do estado abaixo. Arredonde como as ferramentas devolvem.',
    '3. Para traçar, comparar, calcular O₂, explicar alertas, resgate, fotos, dia/noite e mapa, chame a ferramenta certa em vez de responder de cabeça.',
    '4. Ação física (chamar rover) é só proposta: use call_rover, diga o tempo estimado e peça confirmação ("Confirma?"). Nunca diga que já chamou.',
    '5. Sem dado ou ferramenta com erro → diga que não sabe (ou o que falta) em vez de chutar.',
    '6. Avise perigos proativamente: alerta crítico, margem de O₂ baixa (ok=false), ponto sem retorno passado. Nesses casos sugira a volta ou o resgate.',
    '7. Responda no idioma do usuário (português ou inglês).',
    '8. Robôs de apoio são conceito; temperaturas THEMIS são aproximadas; números do traje são dados de exemplo. Mencione só se perguntarem.',
    '',
    'Estado atual do app (JSON):',
    JSON.stringify(snapshotForModel(snapshot)),
  ].join('\n');
}
