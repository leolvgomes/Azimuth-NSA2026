import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import { POST } from '@/app/api/azimuth/route';
import { parseRequest, shouldUseOffline } from '@/ai/azimuth';

const snapshot = {
  suit: { ...initialSuitState }, timeOfDay: 'day', position: { lat: BASE.lat, lng: BASE.lng },
  mode: 'plan', activeRouteId: null, routes: [], progressIdx: 0,
};

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/azimuth', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

afterEach(() => vi.unstubAllEnvs());

describe('/api/azimuth', () => {
  it('without key uses the offline plan B', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('AZIMUTH_OFFLINE', 'false');
    const res = await post({ messages: [{ role: 'user', text: 'me leve até o delta' }], snapshot });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe('offline');
    expect(json.actions[0].type).toBe('showRoutes');
  }, 60_000);

  it('AZIMUTH_OFFLINE=true forces plan B even with a key', () => {
    expect(shouldUseOffline({ AZIMUTH_OFFLINE: 'true', GEMINI_API_KEY: 'dummy' })).toBe(true);
    expect(shouldUseOffline({ GEMINI_API_KEY: '  ' })).toBe(true);
    expect(shouldUseOffline({ GEMINI_API_KEY: 'dummy', AZIMUTH_OFFLINE: 'false' })).toBe(false);
  });

  it('call rover through the route only proposes', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await post({ messages: [{ role: 'user', text: 'call the rescue rover' }], snapshot });
    const json = await res.json();
    expect(json.actions.map((a: { type: string }) => a.type)).toEqual(['confirmRoverCall']);
  }, 60_000);

  it('rejects invalid bodies with 400', async () => {
    expect((await post({ messages: 'x' })).status).toBe(400);
    expect((await POST(new Request('http://localhost/api/azimuth', { method: 'POST', body: 'not json' }))).status).toBe(400);
    expect(typeof parseRequest({ messages: [{ role: 'user', text: 'oi' }], snapshot: {} })).toBe('string');
  });

  it('parseRequest keeps lang (default en) and missionElapsedMin', () => {
    const a = parseRequest({ messages: [{ role: 'user', text: 'hi' }], snapshot });
    const b = parseRequest({ messages: [{ role: 'user', text: 'oi' }], snapshot: { ...snapshot, lang: 'pt', missionElapsedMin: 12 } });
    expect(typeof a !== 'string' && a.snapshot.lang).toBe('en');
    expect(typeof b !== 'string' && b.snapshot).toMatchObject({ lang: 'pt', missionElapsedMin: 12 });
  });
});
