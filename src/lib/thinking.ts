/**
 * O que a Azimuth está fazendo enquanto responde (só rótulo de interface, nada calculado aqui).
 * Palavras-chave PT/EN da pergunta → texto de status ("Traçando rotas…").
 */
import type { I18nKey } from './i18n';

const RULES: [RegExp, I18nKey][] = [
  [/\b(foto|fotos|photo|photos|picture|imagem|image)\b/, 'thinkPhoto'],
  [/\b(rover|robo|robot|batedor|scout|relay|repetidor)\b/, 'thinkRover'],
  [/\b(resgate|socorro|rescue|sos|voltar|volta|return|go back|get back|way home|como eu volto)\b/, 'thinkRescue'],
  [/\b(scien\w*|cienc\w*|carbonat\w*|amostra\w*|sample\w*|paradas?|stops?)\b/, 'thinkScience'],
  [/\b(oxigenio|o2|o₂|oxygen|margem|margin|autonomia|autonomy)\b/, 'thinkO2'],
  [/\b(alerta\w*|alerts?|perigo\w*|hazards?|danger|frente|ahead)\b/, 'thinkAlerts'],
  [/\b(lev\w*|take|rota\w*|routes?|caminho|path|compar\w*|segura|safest|delta|belva|seitah|base)\b/, 'thinkRoute'],
];

export function thinkingKey(question: string | undefined): I18nKey {
  const t = (question ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const [re, key] of RULES) if (re.test(t)) return key;
  return 'computing';
}
