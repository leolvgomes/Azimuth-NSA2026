'use client';
import { aboutCopy } from '@/config/about';
import { useGuide } from '@/state/guide';
import { useT } from '@/lib/useT';

/** Botões "Sobre" e "Tutorial" (abertura). */
export function GuideButtons() {
  const { lang } = useT();
  const c = aboutCopy[lang];
  const openAbout = useGuide((s) => s.openAbout);
  const startTour = useGuide((s) => s.startTour);
  return (
    <div className="flex gap-2">
      <button type="button" className="mini guide-btn" onClick={() => openAbout(0)}>
        ⓘ {c.open}
      </button>
      <button type="button" className="mini guide-btn" onClick={startTour}>
        ▶ {c.tutorial}
      </button>
    </div>
  );
}

/** Botão "?" da TopBar: abre a tela Sobre (que leva ao tutorial). */
export function HelpButton() {
  const { lang } = useT();
  const openAbout = useGuide((s) => s.openAbout);
  const startTour = useGuide((s) => s.startTour);
  const c = aboutCopy[lang];
  return (
    <div className="flex">
      <button type="button" className="btn icon" onClick={() => openAbout(0)} aria-label={c.open} title={c.open}>
        ?
      </button>
      <button type="button" className="btn" style={{ padding: '0 14px', fontSize: 11, marginLeft: -1 }} onClick={startTour} title={c.tutorial}>
        ▶ {c.tutorial}
      </button>
    </div>
  );
}
