/**
 * POST /api/azimuth: assistente Azimuth.
 * Gemini (function calling sobre src/core) quando há GEMINI_API_KEY; senão, ou em qualquer erro, plano B offline.
 * A chave só é lida aqui, no servidor, e nunca é logada nem devolvida.
 *
 * Proteção do link público: corpo limitado e limite de perguntas por IP. Quem passa do limite continua
 * sendo atendido, mas pelo plano B (sem gastar a cota do Gemini).
 */
import { answer } from '@/ai/azimuth';
import type { AzimuthResponse } from '@/ai/contract';
import { clientIp, overLimit } from '@/ai/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) return Response.json({ error: 'body_too_large' }, { status: 413 });
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: 'body_too_large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const limited = overLimit(clientIp(request.headers));
  const res: AzimuthResponse | { error: string } = await answer(body, limited ? { forceOffline: 'rate_limited' } : {});
  return Response.json(res, { status: 'source' in res ? 200 : 400 });
}
