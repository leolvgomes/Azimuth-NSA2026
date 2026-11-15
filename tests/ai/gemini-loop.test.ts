import { describe, expect, it, vi } from 'vitest';
import { BASE } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import type { MapData } from '@/core/types';

// SDK falso: nunca chama a rede. 1ª rodada pede plan_routes + call_rover, 2ª devolve texto.
const calls: unknown[] = [];
vi.mock('@google/genai', () => {
  let round = 0;
  class GoogleGenAI {
    models = {
      generateContent: async (params: unknown) => {
        calls.push(params);
        round++;
        if (round === 1) {
          const fc = [
            { id: 'a', name: 'plan_routes', args: { destination: 'delta' } },
            { id: 'b', name: 'call_rover', args: { role: 'scout', reason: 'checar' } },
          ];
          return { functionCalls: fc, candidates: [{ content: { role: 'model', parts: fc.map((f) => ({ functionCall: f })) } }], text: undefined };
        }
        return { functionCalls: undefined, text: 'Tracei as rotas. Confirma o batedor?' };
      },
    };
  }
  return { GoogleGenAI, FunctionCallingConfigMode: { AUTO: 'AUTO', NONE: 'NONE' } };
});

const flat = (name: string, v: number) => ({
  name, unit: 'x', width: 1, height: 1, bounds: { south: 18.211, west: 77.1605, north: 18.7212, east: 77.6992 },
  cellSizeM: 30000, nodata: -9999, data: [v], source: 'test',
});
const data: MapData = {
  grids: { slope: flat('slope', 1), tempDay: flat('tempDay', -20), tempNight: flat('tempNight', -80) },
  hazards: [], landmarks: [], perseveranceTrack: [], photos: [], scienceTargets: [],
  shelters: [{ id: 'base', name: 'Base', lat: BASE.lat, lng: BASE.lng }],
};

describe('gemini function-calling loop (mocked SDK)', () => {
  it('runs tools, feeds results back, merges actions', async () => {
    const { geminiAnswer } = await import('@/ai/azimuth');
    const res = await geminiAnswer({
      messages: [{ role: 'assistant', text: 'Olá' }, { role: 'user', text: 'me leve ao delta' }],
      snapshot: { suit: { ...initialSuitState }, timeOfDay: 'day', position: { lat: 18.47, lng: 77.42 }, mode: 'plan', activeRouteId: null, routes: [], progressIdx: 0 },
    }, data, 'dummy-key');
    expect(res.source).toBe('gemini');
    expect(res.text).toMatch(/Confirma/);
    expect(res.actions.map((a) => a.type)).toEqual(['showRoutes', 'confirmRoverCall']);
    expect(calls).toHaveLength(2);
    const second = calls[1] as { contents: { role: string; parts: { functionResponse?: { name: string } }[] }[] };
    expect(second.contents[0].role).toBe('user'); // conversa começa pelo usuário
    const last = second.contents[second.contents.length - 1];
    expect(last.parts.map((p) => p.functionResponse?.name)).toEqual(['plan_routes', 'call_rover']);
  }, 30_000);
});
