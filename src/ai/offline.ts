/**
 * PLANO B da Azimuth: sem rede, sem segredos, sem fs (recebe o MapData).
 * Casa a intenção por palavras-chave (PT/EN) e executa as MESMAS ferramentas do Gemini,
 * então todos os números vêm do core. Usado no servidor e no cliente.
 */
import type { Lang } from '@/config/i18n';
import type { MapData } from '@/core/types';
import type { AzimuthAction, AzimuthRequest, AzimuthResponse } from './contract';
import { langOf, matchScienceTarget, normalize, resolvePlace, runTool, type RoverRole, type ToolContext } from './tools';

type Intent =
  | 'photo' | 'rover' | 'science' | 'addScience' | 'rescue' | 'oxygen' | 'alerts' | 'compare' | 'time' | 'navigate' | 'focus' | 'help';

const SCIENCE_RE = /\b(scien\w*|cienc\w*|cientific\w*|carbonat\w*|organic\w*|organico\w*|sample\w*|amostra\w*|depot|deposito|wildcat|stops?|paradas?|geolog\w*|clays?|argila\w*|olivin\w*|outcrops?|afloramento\w*|biosignatur\w*|bioassinatura\w*)\b/;
const ADD_RE = /\b(add|adicion\w*|inclu\w*|include|visit\w*|stop at|via|pass by|pass through|passar|passe|parar em|pare em|collect|colet\w*)\b/;

const has = (t: string, re: RegExp) => re.test(t);

export function detectLang(raw: string): Lang {
  const t = normalize(raw);
  const en = (t.match(/\b(the|take|me to|what|how|show|my|is|are|route|routes|safest|safer|oxygen|call|photo|picture|night|day|rescue|help|back|where|which|go|nearest|compare)\b/g) ?? []).length;
  const pt = (t.match(/\b(me leve|leve|qual|quanto|ate|para|minha|meu|rota|rotas|segura|oxigenio|chamar|chame|foto|noite|dia|resgate|socorro|voltar|onde|mostre|mostra|perto|compare|comparar|batedor|o|a|de|do|da)\b/g) ?? []).length;
  if (/[ãõçáéíóúâêô]/i.test(raw)) return 'pt';
  return en > pt ? 'en' : 'pt';
}

export function detectIntent(raw: string): Intent {
  const t = normalize(raw);
  if (has(t, /\b(foto|fotos|photo|photos|picture|imagem|image)\b/)) return 'photo';
  if (has(t, /\b(rover|rovers|robo|robot|batedor|scout|drone|repetidor|relay)\b/) &&
      has(t, /\b(cham\w*|call|mand\w*|send|envi\w*|pe(ca|dir)|dispatch|traga|bring|batedor|scout)\b/)) return 'rover';
  if (has(t, SCIENCE_RE)) return has(t, ADD_RE) ? 'addScience' : 'science';
  if (has(t, /\b(resgate|socorro|emergencia|rescue|help me|sos|mayday|voltar|volta|retornar|return|go back|get back|way home)\b/)) return 'rescue';
  if (has(t, /\b(oxigenio|o2|ar|margem|autonomia|oxygen|air|margin|enough|suficiente|sobra)\b/)) return 'oxygen';
  if (has(t, /\b(alerta|alertas|perigo|perigos|risco|riscos|alert|alerts|hazard|hazards|danger|warning|warnings)\b/)) return 'alerts';
  if (has(t, /\b(segura|seguro|compar\w*|melhor|safest|safer|safe|best|which route|qual rota|opcoes|options|rapida|fastest)\b/)) return 'compare';
  if (has(t, /\b(noite|night|anoitecer|escuro|dark|dia|day|daytime|diurno|amanhecer)\b/)) return 'time';
  if (has(t, /\b(lev\w*|ir|vamos|va|rota|caminho|chegar|take|go|route|path|navigate|guide|guie|trace|trac\w*)\b/)) return 'navigate';
  if (has(t, /\b(onde|where|mostr\w*|show|foc\w*|centr\w*|zoom)\b/)) return 'focus';
  return 'help';
}

// ------------------------------------------------------------ formatação

const fmt = (n: number, lang: Lang, digits = 1) =>
  n.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}

const L = (lang: Lang, pt: string, en: string) => (lang === 'pt' ? pt : en);

/** "1 alerta" / "2 alertas" (PT) · "1 alert" / "2 alerts" (EN). */
const plural = (n: number, lang: Lang, pt: string, en: string) => `${n} ${lang === 'pt' ? pt : en}${n === 1 ? '' : 's'}`;
const alertsTxt = (n: number, lang: Lang) => plural(n, lang, 'alerta', 'alert');
const critTxt = (n: number, lang: Lang) => (lang === 'pt' ? `${n} ${n === 1 ? 'alerta crítico' : 'alertas críticos'}` : plural(n, lang, 'critical alert', 'critical alert'));

/** "até a frente do delta" / "até Séítah". */
const toPlace = (label: string, lang: Lang) => {
  if (lang === 'en') return /^(Frente do delta|Delta front)$/i.test(label) ? 'the delta front' : /^Base( |$)/.test(label) ? 'base' : label;
  return /^(Frente|Base|Cratera|Borda|Unidade|Margem) /.test(label) ? `a ${label[0].toLowerCase()}${label.slice(1)}` : label;
};

const EN_PROFILE: Record<string, string> = { safest: 'safest', balanced: 'balanced', fastest: 'fastest', manual: 'hand-drawn', return: 'return' };
/** Nome da rota no texto: PT usa o rótulo do core em minúsculas ("mais segura"), EN o perfil. */
const rn = (r: { label?: unknown; profile?: unknown }, lang: Lang) =>
  lang === 'pt' ? String(r.label ?? '').toLowerCase() : EN_PROFILE[String(r.profile)] ?? String(r.label ?? '');

const HELP = {
  pt: 'Posso traçar rotas, comparar opções, calcular sua margem de oxigênio, mostrar paradas científicas e fotos dos rovers ou iniciar o resgate.',
  en: 'I can plan routes, compare options, check your oxygen margin, show science stops and rover photos, or start a rescue.',
};

/** Primeira frase de um texto (para caber no cartão). */
const firstSentence = (txt: string) => {
  const m = String(txt ?? '').match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : String(txt ?? '')).trim().replace(/[.!?]$/, '');
};
const lowerFirst = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x);
/** Tira parênteses ("Skinner Ridge (Hawksbill Gap)" → "Skinner Ridge"). */
const noParens = (x: string) => String(x ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
/** Primeira oração (até ":", ";" ou fim da frase), sem parênteses. */
const firstClause = (x: string) => noParens(firstSentence(x)).split(/[:;]/)[0].trim();

type S = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function roverRole(t: string): RoverRole {
  if (/\b(batedor|scout|checar|check|explor\w*)\b/.test(t)) return 'scout';
  if (/\b(carga|carrier|carregar|carry|amostra\w*|sample\w*)\b/.test(t)) return 'carrier';
  if (/\b(repetidor|relay|radio|sinal|signal)\b/.test(t)) return 'relay';
  return 'rescue';
}

const ROLE_NAME: Record<RoverRole, { pt: string; en: string }> = {
  scout: { pt: 'o rover batedor', en: 'the scout rover' },
  rescue: { pt: 'o rover de resgate', en: 'the rescue rover' },
  carrier: { pt: 'o rover de carga', en: 'the carrier rover' },
  relay: { pt: 'o rover repetidor', en: 'the relay rover' },
};

function parseLatLng(t: string): { lat: number; lng: number } | null {
  const m = t.match(/(-?\d{1,2}\.\d+)\s*[n]?\s*[, ]\s*(-?\d{1,3}\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

// ------------------------------------------------------------ resposta

export async function offlineAnswer(req: AzimuthRequest, data: MapData): Promise<AzimuthResponse> {
  const last = [...(req.messages ?? [])].reverse().find((m) => m.role === 'user')?.text ?? '';
  // Responde no idioma da interface (padrão inglês); detectLang fica só como diagnóstico.
  const lang: Lang = langOf(req.snapshot ?? {});
  const t = normalize(last);
  const ctx: ToolContext = { data, snapshot: { ...req.snapshot, routes: req.snapshot.routes ?? [] } };
  const actions: AzimuthAction[] = [];
  const run = (name: string, args: Record<string, unknown> = {}): S => {
    const r = runTool(name, args, ctx);
    actions.push(...r.actions);
    return r.summary as S;
  };
  const out = (text: string): AzimuthResponse => ({ text, actions, source: 'offline' });

  let intent = detectIntent(last);
  // "add Enchanted Lake": nome próprio de alvo científico + verbo de incluir, sem palavra de ciência.
  if ((intent === 'navigate' || intent === 'focus' || intent === 'help') && ADD_RE.test(t) && matchScienceTarget(t, data)?.specific) {
    intent = 'addScience';
  }
  switch (intent) {
    case 'navigate': {
      const ll = parseLatLng(t);
      const place = ll ? null : resolvePlace(t, data);
      if (!ll && !place) {
        return out(L(lang,
          'Para onde vamos? Posso te levar à frente do delta ou de volta à base.',
          'Where to? I can take you to the delta front or back to base.'));
      }
      const s = run('plan_routes', ll ? { lat: ll.lat, lng: ll.lng } : { destination: place!.label });
      if (s.error) return out(L(lang, 'Não consegui traçar uma rota até lá com os dados que tenho.', "I couldn't find a route there with the data I have."));
      const best = (s.routes as S[]).find((r) => r.id === s.recommendedId)!;
      const danger = best.criticalAlerts > 0
        ? L(lang, ` Atenção: ${critTxt(best.criticalAlerts, lang)} no caminho.`, ` Heads up: ${critTxt(best.criticalAlerts, lang)} on the way.`)
        : best.o2BackAtBaseAfterRoundTripPct < 20
          ? L(lang, ' Margem de O₂ apertada, fique de olho.', ' Tight oxygen margin, keep an eye on it.')
          : s.scienceStopsAlongRecommended > 0
            ? L(lang,
              ` Há ${s.scienceStopsAlongRecommended === 1 ? '1 parada científica' : `${s.scienceStopsAlongRecommended} paradas científicas`} no caminho, quer ver?`,
              ` There ${s.scienceStopsAlongRecommended === 1 ? 'is 1 science stop' : `are ${s.scienceStopsAlongRecommended} science stops`} on the way, want to see?`)
            : '';
      return out(L(lang,
        `Tracei ${s.routes.length} rotas até ${toPlace(s.destination, lang)}; a ${rn(best, lang)} tem ${fmt(best.distanceKm, lang)} km, cerca de ${fmtMin(best.durationMin)}, e você volta à base com ${best.o2BackAtBaseAfterRoundTripPct}% de O₂.${danger}`,
        `I've traced ${s.routes.length} routes to ${toPlace(s.destination, lang)}; the ${rn(best, lang)} one is ${fmt(best.distanceKm, lang)} km, about ${fmtMin(best.durationMin)}, and you'd be back at base with ${best.o2BackAtBaseAfterRoundTripPct}% O₂.${danger}`));
    }

    case 'compare': {
      const s = run('compare_routes');
      if (s.error) return out(L(lang, 'Ainda não tracei rotas. Diga para onde quer ir e eu comparo as opções.', "I haven't traced any routes yet. Tell me where to go and I'll compare the options."));
      const routes = s.routes as S[];
      const best = routes.find((r) => r.id === s.recommendedId)!;
      const fast = routes.find((r) => r.id === s.fastestId)!;
      const bestAlerts = best.criticalAlerts + best.warnings;
      if (best.id === fast.id || s.minutesSavedByFastest <= 0) {
        return out(L(lang,
          `A ${rn(best, lang)} é a melhor opção: ${fmt(best.distanceKm, lang)} km, inclinação máxima de ${best.maxSlopeDeg}° e ${alertsTxt(bestAlerts, lang)}.`,
          `The ${rn(best, lang)} route is the best option: ${fmt(best.distanceKm, lang)} km, max slope ${best.maxSlopeDeg}° and ${alertsTxt(bestAlerts, lang)}.`));
      }
      return out(L(lang,
        `A ${rn(best, lang)} tem inclinação máxima de ${best.maxSlopeDeg}° e ${alertsTxt(bestAlerts, lang)}; a ${rn(fast, lang)} ganha ${s.minutesSavedByFastest} min, mas com ${alertsTxt(fast.criticalAlerts + fast.warnings, lang)} e ${fast.maxSlopeDeg}°. Recomendo a ${rn(best, lang)}, já selecionei para você.`,
        `The ${rn(best, lang)} route peaks at ${best.maxSlopeDeg}° with ${alertsTxt(bestAlerts, lang)}; the ${rn(fast, lang)} one saves ${s.minutesSavedByFastest} min but has ${alertsTxt(fast.criticalAlerts + fast.warnings, lang)} and ${fast.maxSlopeDeg}°. I recommend the ${rn(best, lang)} route and have selected it.`));
    }

    case 'science': {
      const s = run('science_stops');
      if (s.error) return out(L(lang, 'Ainda não há rota. Diga para onde vamos e eu mostro a ciência no caminho.', "There's no route yet. Tell me where to go and I'll show the science on the way."));
      if (!s.count) {
        const o = (s.otherTargets as S[])[0];
        if (!o) return out(L(lang, 'Não tenho alvos científicos carregados para esta área.', "I don't have science targets loaded for this area."));
        return out(L(lang,
          `Nenhum alvo científico bem na rota; o mais importante perto é ${o.name}, a ${fmt(o.offRouteKm, lang)} km dela. Quer que eu inclua a parada?`,
          `No science targets right on this route; the top one nearby is ${o.name}, ${fmt(o.offRouteKm, lang)} km off it. Want me to add the stop?`));
      }
      const stops = s.stops as S[];
      const top = [...stops].sort((a, b) => a.priority - b.priority || a.alongKm - b.alongKm)[0];
      const n = s.count as number;
      return out(L(lang,
        `${n === 1 ? '1 parada científica' : `${n} paradas científicas`} no caminho; a principal é ${noParens(top.name)}, a ${fmt(top.alongKm, lang)} km: ${lowerFirst(firstClause(top.why))}. Tarefa: ${lowerFirst(firstClause(top.task))} (${top.workMin} min).`,
        `${n === 1 ? '1 science stop' : `${n} science stops`} on the way; the key one is ${noParens(top.name)} at ${fmt(top.alongKm, lang)} km: ${lowerFirst(firstClause(top.why))}. Task: ${lowerFirst(firstClause(top.task))} (${top.workMin} min).`));
    }

    case 'addScience': {
      // A ferramenta resolve o alvo com o corredor da rota (genérico → o mais perto).
      const s = run('add_science_stop', { targets: [last] });
      if (s.error === 'no_nearby_target') {
        const far = s.nearestOfKind as S;
        const sug = s.suggestion as S | null;
        const tail = sug
          ? (sug.offRouteKm < 0.1
            ? L(lang, ` Sugiro ${noParens(sug.name)}, que já está no caminho; quer incluir?`, ` I suggest ${noParens(sug.name)} instead, right on the way; want me to add it?`)
            : L(lang, ` Sugiro ${noParens(sug.name)}, a ${fmt(sug.offRouteKm, lang)} km da rota; quer incluir?`, ` I suggest ${noParens(sug.name)} instead, ${fmt(sug.offRouteKm, lang)} km off the route; want me to add it?`))
          : '';
        return out(L(lang,
          `Não há esse tipo de alvo perto da rota: o mais próximo, ${noParens(far.name)}, fica a ${fmt(far.offRouteKm, lang)} km.${tail}`,
          `There's no target of that kind near the route: the closest, ${noParens(far.name)}, is ${fmt(far.offRouteKm, lang)} km off.${tail}`));
      }
      if (s.error === 'unknown_science_target') {
        return out(L(lang,
          'Não reconheci esse alvo. Posso incluir, por exemplo, Enchanted Lake, Wildcat Ridge ou o depósito Three Forks.',
          "I didn't recognise that target. I can add, for example, Enchanted Lake, Wildcat Ridge or the Three Forks sample depot."));
      }
      if (s.error) return out(L(lang, 'Não consegui replanejar a rota com essa parada.', "I couldn't replan the route with that stop."));
      const a = (s.added as S[])[0];
      const r = s.recommended as S;
      const extra = s.extraMinutesVsPrevious;
      const extraO2 = s.extraO2VsPreviousPct;
      const head = L(lang, `Incluí ${noParens(a.name)} (${a.workMin} min de trabalho)`, `Added ${noParens(a.name)} (${a.workMin} min of work)`);
      const cost = typeof extra === 'number' && extra > 0
        ? (typeof extraO2 === 'number' && extraO2 > 0
          ? L(lang, `: +${fmtMin(extra)} e +${extraO2}% de O₂ no total`, `: +${fmtMin(extra)} and +${extraO2}% O₂ overall`)
          : L(lang, `: +${fmtMin(extra)} no total`, `: +${fmtMin(extra)} overall`))
        : L(lang, `: ${fmt(r.distanceKm, lang)} km, cerca de ${fmtMin(r.durationMin)}`, `: ${fmt(r.distanceKm, lang)} km, about ${fmtMin(r.durationMin)}`);
      const o2 = s.o2MarginOk
        ? L(lang, `, e você volta à base com ${r.o2BackAtBaseAfterRoundTripPct}% de O₂.`, `, and you'd be back at base with ${r.o2BackAtBaseAfterRoundTripPct}% O₂.`)
        : L(lang, `. Atenção: a margem de O₂ fica baixa (${r.o2BackAtBaseAfterRoundTripPct}% ao voltar), melhor pular essa parada.`, `. Careful: O₂ margin gets low (${r.o2BackAtBaseAfterRoundTripPct}% back at base), better skip this stop.`);
      return out(`${head}${cost}${o2}`);
    }

    case 'oxygen': {
      const s = run('oxygen_margin');
      if (s.route === null) {
        return out(s.ok
          ? L(lang,
            `Você tem ${s.o2AvailablePct}% de O₂; voltar agora até ${s.returnToShelter} leva ${fmtMin(s.returnEtaMin)} e pede ${s.o2NeededToReturnPct}% com margem. Está tranquilo.`,
            `You have ${s.o2AvailablePct}% O₂; heading back to ${s.returnToShelter} now takes ${fmtMin(s.returnEtaMin)} and needs ${s.o2NeededToReturnPct}% with margin. You're fine.`)
          : L(lang,
            `Cuidado: você tem ${s.o2AvailablePct}% de O₂ e a volta até ${s.returnToShelter} pede ${s.o2NeededToReturnPct}%. Quer que eu inicie o resgate?`,
            `Careful: you have ${s.o2AvailablePct}% O₂ and getting back to ${s.returnToShelter} needs ${s.o2NeededToReturnPct}%. Shall I start the rescue?`));
      }
      const autonomy = fmtMin(s.autonomyMin);
      return out(s.ok
        ? L(lang,
          `Você tem ${s.o2AvailablePct}% de O₂; ida e volta pela ${rn({ label: s.routeLabel, profile: s.routeProfile }, lang)} pedem ${s.o2NeededRoundTripPct}% com margem de segurança, sobram ${s.marginPct}%. Autonomia de cerca de ${autonomy}.`,
          `You have ${s.o2AvailablePct}% O₂; the round trip on the ${rn({ label: s.routeLabel, profile: s.routeProfile }, lang)} route needs ${s.o2NeededRoundTripPct}% with safety margin, leaving ${s.marginPct}%. About ${autonomy} of autonomy.`)
        : L(lang,
          `Não recomendo: ida e volta pela ${rn({ label: s.routeLabel, profile: s.routeProfile }, lang)} pedem ${s.o2NeededRoundTripPct}% de O₂ e você tem ${s.o2AvailablePct}%. Escolha um destino mais perto ou volte à base.`,
          `I don't recommend it: the round trip on the ${rn({ label: s.routeLabel, profile: s.routeProfile }, lang)} route needs ${s.o2NeededRoundTripPct}% O₂ and you have ${s.o2AvailablePct}%. Pick a closer target or head back to base.`));
    }

    case 'alerts': {
      const s = run('explain_alerts');
      if (s.error) return out(L(lang, 'Ainda não há rota ativa. Diga para onde quer ir.', 'There is no active route yet. Tell me where to go.'));
      if (!s.count) return out(L(lang, `Nenhum alerta na ${rn({ label: s.routeLabel, profile: s.routeProfile }, lang)}. Caminho livre pelos dados que tenho.`, `No alerts on the ${rn({ label: s.routeLabel, profile: s.routeProfile }, lang)} route. Clear path as far as my data goes.`));
      const a = (s.alerts as S[])[0];
      return out(L(lang,
        `${alertsTxt(s.count, lang)}; o principal, a ${fmt(a.atKm, lang)} km: ${a.detail} ${a.action}`,
        `${alertsTxt(s.count, lang)}; the main one, at ${fmt(a.atKm, lang)} km: ${a.detail} ${a.action}`));
    }

    case 'rescue': {
      const s = run('start_rescue');
      if (s.passedPointOfNoReturn || !s.ok) {
        const r = run('call_rover', { role: 'rescue', reason: L(lang, 'O₂ insuficiente para voltar a pé', 'Not enough O₂ to walk back') });
        return out(L(lang,
          `Modo resgate ativo: a volta até ${s.shelter} pede ${s.o2NeededPct}% de O₂ e você tem ${s.o2AvailablePct}%. Posso chamar o rover de resgate, chega em ${r.etaMin} min. Confirma?`,
          `Rescue mode on: getting back to ${s.shelter} needs ${s.o2NeededPct}% O₂ and you have ${s.o2AvailablePct}%. I can call the rescue rover, ETA ${r.etaMin} min. Confirm?`));
      }
      if (s.distanceKm < 0.05) {
        return out(L(lang, `Você já está em ${s.shelter}, em segurança. O₂ em ${s.o2AvailablePct}%.`, `You're already at ${s.shelter}, safe. O₂ at ${s.o2AvailablePct}%.`));
      }
      return out(L(lang,
        `Modo resgate ativo: ${s.shelter} fica a ${fmt(s.distanceKm, lang)} km, cerca de ${fmtMin(s.etaMin)}. Você precisa de ${s.o2NeededPct}% de O₂ e tem ${s.o2AvailablePct}%, siga a rota de volta no mapa com calma.`,
        `Rescue mode on: ${s.shelter} is ${fmt(s.distanceKm, lang)} km away, about ${fmtMin(s.etaMin)}. You need ${s.o2NeededPct}% O₂ and have ${s.o2AvailablePct}%, follow the return route on the map calmly.`));
    }

    case 'photo': {
      const s = run('nearest_photo');
      if (s.error) return out(L(lang, 'Não tenho fotos de rover carregadas para esta área.', "I don't have rover photos loaded for this area."));
      const dist = s.distanceM >= 1000 ? `${fmt(s.distanceM / 1000, lang)} km` : `${s.distanceM} m`;
      // Legenda sem ids de arquivo entre parênteses; o sol só entra se a legenda não o citar.
      const caption = String(s.caption ?? '').replace(/\s*\([A-Za-z0-9_]{12,}\)/g, '').trim().replace(/[.]$/, '');
      const meta = /\bsol\s*\d+/i.test(caption) ? `${s.camera}` : `sol ${s.sol}, ${s.camera}`;
      return out(L(lang,
        `Foto real mais próxima, a ${dist} daqui: ${caption} (${meta}).`,
        `Nearest real photo, ${dist} away: ${caption} (${meta}).`));
    }

    case 'rover': {
      const role = roverRole(t);
      const reason = role === 'scout'
        ? L(lang, 'Checar o caminho à frente', 'Check the path ahead')
        : role === 'rescue' ? L(lang, 'Pedido de resgate do astronauta', 'Astronaut requested rescue')
          : role === 'carrier' ? L(lang, 'Levar carga/amostras', 'Carry cargo/samples')
            : L(lang, 'Melhorar o sinal de rádio', 'Improve radio signal');
      const s = run('call_rover', { role, reason });
      return out(L(lang,
        `Posso enviar ${ROLE_NAME[role].pt}; chega em cerca de ${s.etaMin} min. Confirma?`,
        `I can send ${ROLE_NAME[role].en}; it arrives in about ${s.etaMin} min. Confirm?`));
    }

    case 'time': {
      const night = /\b(noite|night|anoitecer|escuro|dark)\b/.test(t);
      run('set_time_of_day', { time: night ? 'night' : 'day' });
      return out(night
        ? L(lang, 'Mudei para a noite: a superfície esfria muito e os alertas de frio aparecem no mapa.', 'Switched to night: the surface gets much colder and cold alerts show on the map.')
        : L(lang, 'Mudei para o dia: temperaturas de superfície diurnas no mapa.', 'Switched to day: daytime surface temperatures on the map.'));
    }

    case 'focus': {
      const place = resolvePlace(t, data);
      if (!place) return out(HELP[lang]);
      const s = run('focus_map', { place: place.label });
      return out(L(lang, `Aqui está ${s.place} no mapa.`, `Here is ${s.place} on the map.`));
    }

    default:
      return out(HELP[lang]);
  }
}
