/**
 * Idioma do site. INGLÊS é o padrão (jurados globais, vídeo em inglês); português é opção no seletor.
 * Cada dono mantém seu dicionário de microcopy, mas todos usam este tipo e este padrão.
 */
export type Lang = 'en' | 'pt';

export const DEFAULT_LANG: Lang = 'en';
export const LANGS: Lang[] = ['en', 'pt'];
export const LANG_LABEL: Record<Lang, string> = { en: 'EN', pt: 'PT' };
/** Locale para números e datas. */
export const LOCALE: Record<Lang, string> = { en: 'en-US', pt: 'pt-BR' };

/** Escolhe a variante do idioma com fallback para o inglês. */
export function pick<T>(byLang: Partial<Record<Lang, T>>, lang: Lang): T {
  return (byLang[lang] ?? byLang.en ?? byLang.pt) as T;
}

/** Texto bilíngue de dados (hazards, landmarks, fotos, alvos científicos): usa *En quando lang='en'. */
export function localized(pt: string, en: string | undefined, lang: Lang): string {
  return lang === 'en' && en ? en : pt;
}
