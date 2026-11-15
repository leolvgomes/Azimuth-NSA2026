/**
 * Prompt de sistema da Azimuth (Gemini). Em inglês, com "responda em <lang>".
 * O snapshot do app entra compacto, sem os pontos das rotas.
 */
import { brand } from '@/config/brand';
import type { AppSnapshot } from './contract';
import { langOf } from './tools';

const r1 = (n: number) => Math.round(n * 10) / 10;

export function snapshotForModel(s: AppSnapshot) {
  return {
    lang: langOf(s),
    suit: { o2Pct: Math.round(s.suit.o2Pct), batteryPct: Math.round(s.suit.batteryPct), suitTempC: Math.round(s.suit.suitTempC) },
    timeOfDay: s.timeOfDay,
    position: { lat: Math.round(s.position.lat * 1e4) / 1e4, lng: Math.round(s.position.lng * 1e4) / 1e4 },
    mode: s.mode,
    ...(s.missionElapsedMin !== undefined ? { missionElapsedMin: Math.round(s.missionElapsedMin) } : {}),
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
  const name = brand.assistantName && brand.assistantName !== 'AZIMUTH' ? brand.assistantName : 'Azimuth';
  const lang = langOf(snapshot);
  const language = lang === 'pt' ? 'Brazilian Portuguese' : 'English';
  return [
    `You are ${name}, the guide of an astronaut walking in Jezero Crater, Mars.`,
    'Motto: "Know the way home." Your priority is keeping them safe, always with a way back.',
    'Mission science objective: sample carbonates and possible organics at the delta front (ancient lake, best place to look for signs of past life).',
    '',
    'Rules:',
    `1. Reply in ${language} (the interface language), unless the user clearly writes in the other language (English or Portuguese).`,
    '2. Short answers: at most 2 sentences, they must fit on a card over the map. Calm, direct tone, no jargon, no emojis, no markdown.',
    '3. NEVER invent numbers. Distances, times, O2, temperatures, slopes, alerts and science targets come ONLY from the tools or the state below. Round as the tools do.',
    '   o2BackAtBaseAfterRoundTripPct is the O2 left after going AND coming back to base, not on arrival.',
    '4. To plan, compare, compute O2, explain alerts, rescue, photos, day/night, map focus or science stops, call the right tool instead of answering from memory.',
    '5. After tracing routes, if scienceStopsAlongRecommended > 0, proactively offer the science stops ("Want to see the science stops on the way?"). To include a stop, use add_science_stop and mention the extra time/O2.',
    '6. Physical actions (calling a rover) are only proposals. Whenever the user asks for a rover, you MUST call call_rover in that same turn (never reuse or guess an ETA), give the etaMin it returns and ask "Confirm?". Never say it was already sent.',
    '   Every number you say must appear in a tool result of this turn or in the state below; do not add or subtract numbers yourself (e.g. rescue: use o2LeftAtShelterPct).',
    '7. No data or a tool error → say you do not know (or what is missing) instead of guessing.',
    '8. Warn about dangers proactively: critical alerts, low O2 margin (ok=false), point of no return passed. Then suggest turning back or rescue.',
    '9. In walk mode, missionElapsedMin is the time already walked; use it when relevant (e.g. time out vs. time back).',
    '10. Support robots are a concept; THEMIS temperatures are approximate; suit numbers are sample data. Mention only if asked.',
    '11. Hypothetical questions ("is it safe at night?", "what if I go at night?") must NOT change the map: use what_if_time_of_day on plan_routes / explain_alerts',
    '    and say the map was not changed. Call set_time_of_day only when the user explicitly asks to switch to day or night.',
    '12. oxygen_margin without a route: if atShelter, say they are at the base, give O2 available and walkingAutonomyMin, and offer to plan a route.',
    '    Never call the tank level a "margin": a margin only exists for a route (marginPct).',
    '',
    'Current app state (JSON):',
    JSON.stringify(snapshotForModel(snapshot)),
  ].join('\n');
}
