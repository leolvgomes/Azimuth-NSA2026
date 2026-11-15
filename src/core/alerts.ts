/**
 * Alertas da rota cruzando dados × traje. Trechos contínuos viram UM alerta cada.
 * Sempre com title curto, detail (o que é) e action (o que fazer). Português.
 */
import { suitConfig } from '@/config/suit';
import { isPlaceholderGrid, sampleGrid } from './geo';
import { fmt, fmtDist } from './format';
import { batteryUsedAt, o2UsedAt, returnNeed } from './oxygen';
import { hazardsNear, tempGrid } from './sampling';
import type { Alert, AlertKind, Hazard, MapData, Route, SuitState, TimeOfDay } from './types';

/** Agrupa índices consecutivos com nível > 0 em trechos [from, to, nívelMáx]. */
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

const KIND_LABEL: Record<Hazard['kind'], string> = {
  channel: 'Canal', breach: 'Brecha', dune: 'Dunas', scarp: 'Escarpa', crater: 'Cratera',
  rim: 'Borda', rough: 'Terreno acidentado',
};

export function evaluateRoute(route: Route, data: MapData, suit: SuitState, tod: TimeOfDay): Alert[] {
  const pts = route.points;
  if (pts.length === 0) return [];
  const alerts: Alert[] = [];
  const mk = (kind: AlertKind, sev: 'critical' | 'warning', from: number, to: number,
    title: string, detail: string, action: string, tag = ''): Alert => {
    const mid = pts[Math.floor((from + to) / 2)];
    return {
      id: `${route.id}-${kind}${tag ? '-' + tag : ''}-${from}-${to}`,
      kind, severity: sev, fromIdx: from, toIdx: to, at: { lat: mid.lat, lng: mid.lng }, title, detail, action,
    };
  };
  const period = tod === 'night' ? 'à noite' : 'de dia';
  const tg = tempGrid(data, tod);
  const temps = pts.map((p) => sampleGrid(tg, p.lat, p.lng));
  const tMin = suitConfig.minSurfaceTempC;
  const tMax = suitConfig.maxSurfaceTempC;

  // Frio
  for (const [a, b, lvl] of runs(temps.map((t) => (t === null ? 0 : t < tMin ? 2 : t < tMin + 5 ? 1 : 0)))) {
    const lo = Math.min(...(temps.slice(a, b + 1).filter((t) => t !== null) as number[]));
    alerts.push(mk('cold', lvl === 2 ? 'critical' : 'warning', a, b,
      lvl === 2 ? 'FRIO ABAIXO DO TRAJE' : 'FRIO NO LIMITE DO TRAJE',
      `Superfície chega a ${fmt(lo)} °C ${period} (THEMIS, aproximado) por ${fmtDist(pts[b].distM - pts[a].distM)}; o traje aguenta até ${fmt(tMin)} °C.`,
      tod === 'night'
        ? 'Espere o dia (depois das ~10h) para cruzar este trecho; à noite não saia sem aquecimento extra.'
        : 'Atravesse antes das 16h ou use a rota equilibrada, que fica mais tempo ao sol.'));
  }
  // Calor
  for (const [a, b, lvl] of runs(temps.map((t) => (t === null ? 0 : t > tMax ? 2 : t > tMax - 5 ? 1 : 0)))) {
    const hi = Math.max(...(temps.slice(a, b + 1).filter((t) => t !== null) as number[]));
    alerts.push(mk('heat', lvl === 2 ? 'critical' : 'warning', a, b,
      lvl === 2 ? 'CALOR ACIMA DO TRAJE' : 'CALOR NO LIMITE DO TRAJE',
      `Superfície chega a ${fmt(hi)} °C ${period}; o traje aguenta até ${fmt(tMax)} °C.`,
      'Cruze este trecho no começo da manhã ou à tarde, e não pare no sol.'));
  }
  // Inclinação
  const slopes = pts.map((p) => p.slopeDeg);
  for (const [a, b, lvl] of runs(slopes.map((s) =>
    s === undefined ? 0 : s > suitConfig.slopeMaxDeg ? 2 : s > suitConfig.slopeWarnDeg ? 1 : 0))) {
    const mx = Math.max(...(slopes.slice(a, b + 1).filter((s) => s !== undefined) as number[]));
    alerts.push(mk('slope', lvl === 2 ? 'critical' : 'warning', a, b,
      lvl === 2 ? 'INCLINAÇÃO PROIBITIVA' : 'RAMPA ÍNGREME',
      `Inclinação de até ${fmt(mx)}° por ${fmtDist(pts[b].distM - pts[a].distM)} (limite do traje: ${suitConfig.slopeMaxDeg}°).`,
      lvl === 2
        ? 'Não suba aqui: desvie pela rota mais segura ou desenhe um contorno.'
        : 'Vá devagar, em zigue-zague, e mantenha três apoios nas partes mais íngremes.'));
  }
  // Perigos (um alerta por perigo por trecho)
  const near = pts.map((p) => hazardsNear(data, p));
  const hzById = new Map(data.hazards.map((h) => [h.id, h]));
  const ids = new Set<string>();
  for (const n of near) for (const h of n) ids.add(h.id);
  for (const id of ids) {
    const hz = hzById.get(id);
    if (!hz) continue;
    const dists = near.map((n) => n.find((h) => h.id === id)?.distM ?? Infinity);
    for (const [a, b] of runs(dists.map((d) => (Number.isFinite(d) ? 1 : 0)))) {
      const dMin = Math.min(...dists.slice(a, b + 1));
      const inside = dMin === 0;
      const sev = inside && hz.severity === 'avoid' ? 'critical' : 'warning';
      alerts.push(mk('hazard', sev, a, b,
        `${KIND_LABEL[hz.kind] ?? 'Perigo'}: ${hz.name}`.toUpperCase(),
        inside
          ? `A rota passa por dentro de ${hz.name} (${KIND_LABEL[hz.kind]?.toLowerCase() ?? 'perigo'}) por ${fmtDist(pts[b].distM - pts[a].distM)}.`
          : `A rota passa a ${fmt(dMin)} m de ${hz.name} (${KIND_LABEL[hz.kind]?.toLowerCase() ?? 'perigo'}).`,
        hz.advice || 'Mantenha distância e siga a rota mais segura.', id));
    }
  }
  // O₂
  const o2u = o2UsedAt(route);
  const reserve = suitConfig.o2ReservePct;
  const firstFail = o2u.findIndex((u) => suit.o2Pct - u - returnNeed(u) < reserve);
  const last = pts.length - 1;
  if (firstFail >= 0) {
    const need = o2u[last] + returnNeed(o2u[last]) + reserve;
    alerts.push(mk('o2', 'critical', firstFail, last, 'O₂ NÃO DÁ PARA VOLTAR',
      `Ida, volta com margem de ${fmt(suitConfig.returnSafetyMargin * 100)}% e reserva de ${reserve}% pedem ${fmt(need)}% de O₂; você tem ${fmt(suit.o2Pct)}%. A partir daqui o O₂ não cobre a volta.`,
      'Volte antes deste ponto (ponto sem retorno) ou escolha um destino mais perto.'));
  } else {
    const left = suit.o2Pct - o2u[last] - returnNeed(o2u[last]);
    if (left < reserve + 10) {
      alerts.push(mk('o2', 'warning', last, last, 'O₂ APERTADO',
        `Depois da ida e da volta com margem sobram só ${fmt(left)}% de O₂ (reserva: ${reserve}%).`,
        'Não faça paradas longas no destino e volte pelo mesmo caminho.'));
    }
  }
  // Bateria
  const bu = batteryUsedAt(route);
  const batFail = bu.findIndex((u) => suit.batteryPct - 2 * u < 5);
  if (batFail >= 0) {
    alerts.push(mk('battery', 'critical', batFail, last, 'BATERIA NÃO DÁ PARA VOLTAR',
      `Ida e volta gastam ${fmt(2 * bu[last])}% de bateria; você tem ${fmt(suit.batteryPct)}%.`,
      'Volte antes deste ponto ou troque a bateria na base antes de sair.'));
  } else if (suit.batteryPct - 2 * bu[last] < 15) {
    alerts.push(mk('battery', 'warning', last, last, 'BATERIA BAIXA NA VOLTA',
      `Chegando de volta à base sobram ${fmt(suit.batteryPct - 2 * bu[last])}% de bateria.`,
      'Desligue sistemas não essenciais (luzes, aquecimento extra) durante a volta.'));
  }
  // Sem dado
  const missing: string[] = [];
  if (isPlaceholderGrid(data.grids.slope)) missing.push('inclinação');
  if (isPlaceholderGrid(tg)) missing.push(`temperatura ${tod === 'night' ? 'noturna' : 'diurna'}`);
  if (missing.length) {
    alerts.push(mk('no-data', 'warning', 0, last, 'SEM DADO REAL',
      `Faltam dados de ${missing.join(' e ')} nesta área; os valores usados são neutros.`,
      'Trate a rota como não verificada: avance devagar e peça ao batedor para checar o caminho.', 'grid'));
  } else {
    const lv = pts.map((p, i) => (p.slopeDeg === undefined || temps[i] === null ? 1 : 0));
    for (const [a, b] of runs(lv)) {
      alerts.push(mk('no-data', 'warning', a, b, 'TRECHO SEM DADO',
        `Não há dado de relevo ou temperatura em ${fmtDist(pts[b].distM - pts[a].distM)} da rota.`,
        'Não sei como é este trecho: avance devagar ou peça ao batedor para checar antes.'));
    }
  }

  return mergeAlerts(alerts, route);
}

/** Gap máximo (m, ao longo da rota) para juntar dois trechos do mesmo alerta. */
export const MERGE_GAP_M = 600;

/** Chave de agrupamento: perigo = tipo + nome (título); demais = só o tipo. */
function mergeKey(a: Alert): string {
  return a.kind === 'hazard' ? `hazard|${a.title}` : a.kind;
}

/**
 * Junta trechos do mesmo alerta separados por <= MERGE_GAP_M; o trecho resultante herda a
 * severidade/título/texto do pedaço mais grave. Trechos distantes continuam separados, mas com
 * título numerado (nunca dois títulos idênticos). Ordena: críticos primeiro, depois pela posição.
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
  // títulos idênticos (ex.: dois perigos homônimos já numerados) nunca saem repetidos
  const seen = new Map<string, number>();
  for (const a of out) {
    const c = (seen.get(a.title) ?? 0) + 1;
    seen.set(a.title, c);
    if (c > 1) a.title = `${a.title} (${c})`;
  }
  return out.sort((x, y) => rank(x) - rank(y) || x.fromIdx - y.fromIdx);
}
