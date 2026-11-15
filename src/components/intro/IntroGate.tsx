'use client';
import { useEffect, useState } from 'react';
import { loadMarsIntro, type MarsIntroComponent } from '@/lib/optionalModules';
import { IntroFallback } from './IntroFallback';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { useT } from '@/lib/useT';

/**
 * Abertura: usa o globo 3D (que tem o próprio botão PULAR) de @/components/globe/MarsIntro (agente globe-3d) quando existir;
 * até lá (ou se falhar), a Tela 1 em 2D (com o próprio "Skip intro"). Seletor EN/PT no canto superior direito.
 */
export function IntroGate({ onEnter, onRescue }: { onEnter: () => void; onRescue: () => void }) {
  const { t, lang } = useT();
  const [Globe, setGlobe] = useState<MarsIntroComponent | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMarsIntro().then((C) => {
      if (!alive) return;
      if (C) setGlobe(() => C);
      setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnter]);

  return (
    <>
      {Globe ? (
        <ErrorBoundary fallback={<IntroFallback onEnter={onEnter} onRescue={onRescue} />}>
          <Globe onEnter={onEnter} lang={lang} />
        </ErrorBoundary>
      ) : checked ? <IntroFallback onEnter={onEnter} onRescue={onRescue} /> : <div className="screen" />}
      {!Globe && checked ? (
        <button type="button" className="btn" style={{ position: 'fixed', right: 24, bottom: 100, zIndex: 2000 }} onClick={onEnter}>
          {t('skipIntro')}
        </button>
      ) : null}
      {Globe ? (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 2100 }}>
          <LangSwitch />
        </div>
      ) : null}
    </>
  );
}
