'use client';
import { useAzimuth } from '@/state/store';
import { tr, type I18nKey } from '@/lib/i18n';

/** Hook: idioma atual + t(). */
export function useT() {
  const lang = useAzimuth((s) => s.lang);
  const t = (key: I18nKey, vars?: Record<string, string | number>) => tr(lang, key, vars);
  return { lang, t };
}
