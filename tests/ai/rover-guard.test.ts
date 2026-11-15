import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE } from '@/config/mission';
import { initialSuitState } from '@/config/suit';

// SDK falso: o "modelo" responde com um ETA inventado SEM chamar call_rover.
vi.mock('@google/genai', () => {
  class GoogleGenAI {
    models = { generateContent: async () => ({ functionCalls: undefined, text: 'The rescue rover arrives in 7 minutes. Confirm?' }) };
  }
  return { GoogleGenAI, FunctionCallingConfigMode: { AUTO: 'AUTO', NONE: 'NONE' } };
});

afterEach(() => vi.unstubAllEnvs());

const snapshot = {
  lang: 'en', suit: { ...initialSuitState }, timeOfDay: 'day', position: { lat: 18.46, lng: 77.42 },
  mode: 'walk', activeRouteId: null, routes: [], progressIdx: 0,
};

describe('rover safety net', () => {
  it('falls back to plan B when Gemini skips call_rover', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'dummy-test-key');
    vi.stubEnv('AZIMUTH_OFFLINE', 'false');
    const { answer } = await import('@/ai/azimuth');
    const res = await answer({ messages: [{ role: 'user', text: 'Call the rescue rover' }], snapshot });
    expect('source' in res && res.source).toBe('offline');
    if (!('source' in res)) return;
    expect(res.error).toBe('gemini skipped call_rover');
    expect(res.actions.map((a) => a.type)).toEqual(['confirmRoverCall']);
    expect(res.text).not.toMatch(/7 minutes/);
    expect(res.text).toMatch(/Confirm\?/);
  }, 30_000);

  it('keeps the Gemini answer for non-rover questions', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'dummy-test-key');
    vi.stubEnv('AZIMUTH_OFFLINE', 'false');
    const { answer } = await import('@/ai/azimuth');
    const res = await answer({ messages: [{ role: 'user', text: 'hello' }], snapshot: { ...snapshot, position: { lat: BASE.lat, lng: BASE.lng } } });
    expect('source' in res && res.source).toBe('gemini');
  }, 30_000);
});
