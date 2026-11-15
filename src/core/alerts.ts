/**
 * Route alerts: data × suit. Each continuous stretch becomes ONE alert; nearby repeats are merged.
 * Always a short title, a detail (what it is) and an action (what to do). English by default,
 * Portuguese with opts.lang = 'pt'.
 */
import { DEFAULT_LANG, localized, type Lang } from '@/config/i18n';
import { suitConfig } from '@/config/suit';
import { isPlaceholderGrid, sampleGrid } from './geo';
import { fmt, fmtDist } from './format';
import { batteryUsedAt, batteryWalkUsedAt, firstO2Failure, o2UsedAt, o2WalkUsedAt, returnNeed } from './oxygen';
import { hazardsNear, tempGrid } from './sampling';
import type { Alert, AlertKind, Hazard, MapData, PlanOptions, Route, SuitState, TimeOfDay } from './types';

/** Groups consecutive indices with level > 0 into stretches [from, to, maxLevel]. */
export function runs(levels: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  let start = -1;
  let maxL = 0;
  for (let i = 0; i <= levels.length; i++) {
    const l = i < levels.length ? levels[i] : 0;
    if (l > 0) {
      if (start < 0) { start = i; maxL = 0; }
      if (l > maxL) maxL = l;
    } else if (start >= 0) {
      out.push([start, i - 1, maxL]);
      start = -1;
    }
  }
  return out;
}

export const HAZARD_KIND_LABEL: Record<Lang, Record<Hazard['kind'], string>> = {
  en: {
    channel: 'Channel', breach: 'Breach', dune: 'Dunes', scarp: 'Scarp', crater: 'Crater',
    rim: 'Rim', rough: 'Rough terrain',
  },
  pt: {
    channel: 'Canal', breach: 'Brecha', dune: 'Dunas', scarp: 'Escarpa', crater: 'Cratera',
    rim: 'Borda', rough: 'Terreno acidentado',
  },
};

export function evaluateRoute(
  route: Route, data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions,
): Alert[] {
  const lang: Lang = opts?.lang ?? DEFAULT_LANG;
  const pt = lang === 'pt';
  const L = (en: string, ptText: string) => (pt ? ptText : en);
  const n = (v: number, d = 0) => fmt(v, d, lang);
  const dist = (m: number) => fmtDist(m, lang);
  const pts = route.points;
  if (pts.length === 0) return [];
  const alerts: Alert[] = [];
  const mk = (kind: AlertKind, sev: 'critical' | 'warning', from: number, to: number,
    title: string, detail: string, action: string): Alert => {
    const mid = pts[Math.floor((from + to) / 2)];
    return {
      id: `${route.id}-${kind}-${from}-${to}`,
      kind, severity: sev, fromIdx: from, toIdx: to, at: { lat: mid.lat, lng: mid.lng }, title, detail, action,
    };
  };
  const period = tod === 'night' ? L('at night', 'à noite') : L('by day', 'de dia');
  const tg = tempGrid(data, tod);
  const temps = pts.map((p) => sampleGrid(tg, p.lat, p.lng));
  const tMin = suitConfig.minSurfaceTempC;
  const tMax = suitConfig.maxSurfaceTempC;
  const span = (a: number, b: number) => dist(pts[b].distM - pts[a].distM);

  // Cold
  for (const [a, b, lvl] of runs(temps.map((t) => (t === null ? 0 : t < tMin ? 2 : t < tMin + 5 ? 1 : 0)))) {
    const lo = Math.min(...(temps.slice(a, b + 1).filter((t) => t !== null) as number[]));
    alerts.push(mk('cold', lvl === 2 ? 'critical' : 'warning', a, b,
      lvl === 2 ? L('COLDER THAN SUIT LIMIT', 'FRIO ABAIXO DO TRAJE') : L('COLD AT SUIT LIMIT', 'FRIO NO LIMITE DO TRAJE'),
      L(`Surface drops to ${n(lo)} °C ${period} (THEMIS, approximate) over ${span(a, b)}; the suit is rated to ${n(tMin)} °C.`,
        `Superfície chega a ${n(lo)} °C ${period} (THEMIS, aproximado) por ${span(a, b)}; o traje aguenta até ${n(tMin)} °C.`),
      tod === 'night'
        ? L('Wait for daylight (after ~10:00) to cross this stretch; do not go out at night without extra heating.',
          'Espere o dia (depois das ~10h) para cruzar este trecho; à noite não saia sem aquecimento extra.')
        : L('Cross before 16:00 or take the balanced route, which stays longer in the sun.',
          'Atravesse antes das 16h ou use a rota equilibrada, que fica mais tempo ao sol.')));
  }
  // Heat
  for (const [a, b, lvl] of runs(temps.map((t) => (t === null ? 0 : t > tMax ? 2 : t > tMax - 5 ? 1 : 0)))) {
    const hi = Math.max(...(temps.slice(a, b + 1).filter((t) => t !== null) as number[]));
    alerts.push(mk('heat', lvl === 2 ? 'critical' : 'warning', a, b,
      lvl === 2 ? L('HOTTER THAN SUIT LIMIT', 'CALOR ACIMA DO TRAJE') : L('HEAT AT SUIT LIMIT', 'CALOR NO LIMITE DO TRAJE'),
      L(`Surface reaches ${n(hi)} °C ${period}; the suit is rated to ${n(tMax)} °C.`,
        `Superfície chega a ${n(hi)} °C ${period}; o traje aguenta até ${n(tMax)} °C.`),
      L('Cross this stretch early in the morning or late in the afternoon and do not stop in the sun.',
        'Cruze este trecho no começo da manhã ou à tarde, e não pare no sol.')));
  }
  // Slope
  const slopes = pts.map((p) => p.slopeDeg);
  for (const [a, b, lvl] of runs(slopes.map((s) =>
    s === undefined ? 0 : s > suitConfig.slopeMaxDeg ? 2 : s > suitConfig.slopeWarnDeg ? 1 : 0))) {
    const mx = Math.max(...(slopes.slice(a, b + 1).filter((s) => s !== undefined) as number[]));
    alerts.push(mk('slope', lvl === 2 ? 'critical' : 'warning', a, b,
      lvl === 2 ? L('SLOPE TOO STEEP', 'INCLINAÇÃO PROIBITIVA') : L('STEEP RAMP', 'RAMPA ÍNGREME'),
      L(`Slope up to ${n(mx)}° over ${span(a, b)} (suit limit: ${suitConfig.slopeMaxDeg}°).`,
        `Inclinação de até ${n(mx)}° por ${span(a, b)} (limite do traje: ${suitConfig.slopeMaxDeg}°).`),
      lvl === 2
        ? L('Do not climb here: detour on the safest route or draw a way around.',
          'Não suba aqui: desvie pela rota mais segura ou desenhe um contorno.')
        : L('Go slowly, zig-zag, and keep three points of contact on the steepest parts.',
          'Vá devagar, em zigue-zague, e mantenha três apoios nas partes mais íngremes.')));
  }
  // Hazards (one alert per hazard per stretch)
  const kindLabel = HAZARD_KIND_LABEL[lang];
  const near = pts.map((p) => hazardsNear(data, p));
  const hzById = new Map(data.hazards.map((h) => [h.id, h]));
  const ids = new Set<string>();
  for (const nn of near) for (const h of nn) ids.add(h.id);
  for (const id of ids) {
    const hz = hzById.get(id);
    if (!hz) continue;
    const name = localized(hz.name, hz.nameEn, lang);
    const kl = kindLabel[hz.kind] ?? L('Hazard', 'Perigo');
    const dists = near.map((nn) => nn.find((h) => h.id === id)?.distM ?? Infinity);
    for (const [a, b] of runs(dists.map((d) => (Number.isFinite(d) ? 1 : 0)))) {
      const dMin = Math.min(...dists.slice(a, b + 1));
      const inside = dMin === 0;
      const sev = inside && hz.severity === 'avoid' ? 'critical' : 'warning';
      alerts.push(mk('hazard', sev, a, b,
        `${kl}: ${name}`.toUpperCase(),
        inside
          ? L(`The route goes through ${name} (${kl.toLowerCase()}) for ${span(a, b)}.`,
            `A rota passa por dentro de ${name} (${kl.toLowerCase()}) por ${span(a, b)}.`)
          : L(`The route passes ${n(dMin)} m from ${name} (${kl.toLowerCase()}).`,
            `A rota passa a ${n(dMin)} m de ${name} (${kl.toLowerCase()}).`),
        localized(hz.advice, hz.adviceEn, lang) ||
          L('Keep your distance and follow the safest route.', 'Mantenha distância e siga a rota mais segura.')));
    }
  }
  // O₂ (stops included: work at a stop uses O₂, the way back is walking only)
  const o2u = o2UsedAt(route);
  const o2w = o2WalkUsedAt(route);
  const reserve = suitConfig.o2ReservePct;
  const firstFail = firstO2Failure(route, suit);
  const last = pts.length - 1;
  if (firstFail >= 0) {
    const need = o2u[last] + returnNeed(o2w[last]) + reserve;
    alerts.push(mk('o2', 'critical', firstFail, last, L("O₂ WON'T COVER THE WAY BACK", 'O₂ NÃO DÁ PARA VOLTAR'),
      L(`Way out, way back with a ${n(suitConfig.returnSafetyMargin * 100)}% margin and the ${reserve}% reserve need ${n(need)}% O₂; you have ${n(suit.o2Pct)}%. From here on O₂ does not cover the return.`,
        `Ida, volta com margem de ${n(suitConfig.returnSafetyMargin * 100)}% e reserva de ${reserve}% pedem ${n(need)}% de O₂; você tem ${n(suit.o2Pct)}%. A partir daqui o O₂ não cobre a volta.`),
      L('Turn back before this point (point of no return) or pick a closer destination.',
        'Volte antes deste ponto (ponto sem retorno) ou escolha um destino mais perto.')));
  } else {
    const left = suit.o2Pct - o2u[last] - returnNeed(o2w[last]);
    if (left < reserve + 10) {
      alerts.push(mk('o2', 'warning', last, last, L('O₂ IS TIGHT', 'O₂ APERTADO'),
        L(`After the way out and back with margin only ${n(left)}% O₂ is left (reserve: ${reserve}%).`,
          `Depois da ida e da volta com margem sobram só ${n(left)}% de O₂ (reserva: ${reserve}%).`),
        L('Avoid long stops at the destination and come back the same way.',
          'Não faça paradas longas no destino e volte pelo mesmo caminho.')));
    }
  }
  // Battery
  const bu = batteryUsedAt(route);
  const bw = batteryWalkUsedAt(route);
  const batFail = bu.findIndex((u, i) => suit.batteryPct - u - bw[i] < 5);
  const batLeft = suit.batteryPct - bu[last] - bw[last];
  if (batFail >= 0) {
    alerts.push(mk('battery', 'critical', batFail, last, L("BATTERY WON'T COVER THE WAY BACK", 'BATERIA NÃO DÁ PARA VOLTAR'),
      L(`The round trip uses ${n(bu[last] + bw[last])}% battery; you have ${n(suit.batteryPct)}%.`,
        `Ida e volta gastam ${n(bu[last] + bw[last])}% de bateria; você tem ${n(suit.batteryPct)}%.`),
      L('Turn back before this point or swap the battery at base before leaving.',
        'Volte antes deste ponto ou troque a bateria na base antes de sair.')));
  } else if (batLeft < 15) {
    alerts.push(mk('battery', 'warning', last, last, L('LOW BATTERY ON THE WAY BACK', 'BATERIA BAIXA NA VOLTA'),
      L(`Back at base only ${n(batLeft)}% battery is left.`, `Chegando de volta à base sobram ${n(batLeft)}% de bateria.`),
      L('Turn off non-essential systems (lights, extra heating) on the way back.',
        'Desligue sistemas não essenciais (luzes, aquecimento extra) durante a volta.')));
  }
  // No data
  const missing: string[] = [];
  if (isPlaceholderGrid(data.grids.slope)) missing.push(L('slope', 'inclinação'));
  if (isPlaceholderGrid(tg)) {
    missing.push(tod === 'night' ? L('night temperature', 'temperatura noturna') : L('day temperature', 'temperatura diurna'));
  }
  if (missing.length) {
    alerts.push(mk('no-data', 'warning', 0, last, L('NO REAL DATA', 'SEM DADO REAL'),
      L(`No ${missing.join(' or ')} data for this area; neutral values are used.`,
        `Faltam dados de ${missing.join(' e ')} nesta área; os valores usados são neutros.`),
      L('Treat the route as unverified: move slowly and ask the scout rover to check the way.',
        'Trate a rota como não verificada: avance devagar e peça ao batedor para checar o caminho.')));
  } else {
    const lv = pts.map((p, i) => (p.slopeDeg === undefined || temps[i] === null ? 1 : 0));
    for (const [a, b] of runs(lv)) {
      alerts.push(mk('no-data', 'warning', a, b, L('STRETCH WITHOUT DATA', 'TRECHO SEM DADO'),
        L(`No terrain or temperature data for ${span(a, b)} of the route.`,
          `Não há dado de relevo ou temperatura em ${span(a, b)} da rota.`),
        L("I don't know what this stretch is like: move slowly or ask the scout rover to check first.",
          'Não sei como é este trecho: avance devagar ou peça ao batedor para checar antes.')));
    }
  }

  return mergeAlerts(alerts, route);
}

/** Max gap (m along the route) to merge two stretches of the same alert. */
export const MERGE_GAP_M = 600;

/** Grouping key: hazard = kind + name (title); others = kind only. */
function mergeKey(a: Alert): string {
  return a.kind === 'hazard' ? `hazard|${a.title}` : a.kind;
}

/**
 * Merges stretches of the same alert separated by <= MERGE_GAP_M; the result takes severity/title/text
 * from the worst piece. Far-apart stretches stay separate with numbered titles (never two identical
 * titles). Sorted: critical first, then by position.
 */
export function mergeAlerts(alerts: Alert[], route: Route, gapM = MERGE_GAP_M): Alert[] {
  const pts = route.points;
  const groups = new Map<string, Alert[]>();
  for (const a of alerts) {
    const k = mergeKey(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  const rank = (a: Alert) => (a.severity === 'critical' ? 0 : 1);
  const out: Alert[] = [];
  let gi = 0;
  for (const list of groups.values()) {
    gi++;
    list.sort((x, y) => x.fromIdx - y.fromIdx);
    const merged: Alert[] = [];
    for (const a of list) {
      const prev = merged[merged.length - 1];
      if (prev && pts[a.fromIdx].distM - pts[prev.toIdx].distM <= gapM) {
        const worst = rank(a) < rank(prev) ? a : prev;
        merged[merged.length - 1] = { ...worst, fromIdx: prev.fromIdx, toIdx: Math.max(prev.toIdx, a.toIdx) };
      } else {
        merged.push({ ...a });
      }
    }
    merged.forEach((a, n) => {
      const mid = pts[Math.floor((a.fromIdx + a.toIdx) / 2)];
      a.at = { lat: mid.lat, lng: mid.lng };
      a.id = `${route.id}-${a.kind}-${gi}-${a.fromIdx}-${a.toIdx}`;
      if (merged.length > 1) a.title = `${a.title} (${n + 1}/${merged.length})`;
    });
    out.push(...merged);
  }
  // identical titles (e.g. two hazards with the same name, already numbered) are never repeated
  const seen = new Map<string, number>();
  for (const a of out) {
    const c = (seen.get(a.title) ?? 0) + 1;
    seen.set(a.title, c);
    if (c > 1) a.title = `${a.title} (${c})`;
  }
  return out.sort((x, y) => rank(x) - rank(y) || x.fromIdx - y.fromIdx);
}
