/**
 * POST /api/azimuth: assistente Azimuth.
 * Gemini (function calling sobre src/core) quando há GEMINI_API_KEY; senão, ou em qualquer erro, plano B offline.
 * A chave só é lida aqui, no servidor, e nunca é logada nem devolvida.
 */
import { answer } from '@/ai/azimuth';
import type { AzimuthResponse } from '@/ai/contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const res: AzimuthResponse | { error: string } = await answer(body);
  return Response.json(res, { status: 'source' in res ? 200 : 400 });
}
