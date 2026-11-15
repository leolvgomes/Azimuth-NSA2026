'use client';
import { LANGS, LANG_LABEL } from '@/config/i18n';
import { useAzimuth } from '@/state/store';
import { useT } from '@/lib/useT';

/** Seletor EN/PT (inglês é o padrão; a escolha fica salva no navegador). */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, t } = useT();
  const setLang = useAzimuth((s) => s.setLang);
  return (
    <div className={`langsw ${className}`} role="group" aria-label={t('language')}>
      {LANGS.map((l) => (
        <button key={l} type="button" className={l === lang ? 'on' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
