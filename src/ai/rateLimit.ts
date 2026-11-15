/**
 * Limite de perguntas por IP para o link público (janela deslizante em memória, por instância).
 * Simples, mas basta para um demo: protege a cota gratuita do Gemini durante o julgamento.
 */
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_PER_WINDOW = 12;

const hits = new Map<string, number[]>();

/** Registra uma pergunta e diz se o IP passou do limite na janela. */
export function overLimit(ip: string, now = Date.now(), max = RATE_MAX_PER_WINDOW): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > max;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] ?? headers.get('x-real-ip') ?? 'local').trim() || 'local';
}
