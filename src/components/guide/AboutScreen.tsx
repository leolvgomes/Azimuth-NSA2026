'use client';
/**
 * Tela "Sobre": o que é a Azimuth, por que fizemos (NASA Space Apps 2026), dados da NASA,
 * como funciona e o time. Navegação por seções (setas do teclado, abas, voltar/próximo).
 * Textos em src/config/about.ts.
 */
import { useEffect, useState } from 'react';
import { aboutCopy, team, type AboutCopy, type DataStatus } from '@/config/about';
import { brand } from '@/config/brand';
import { BASE, JEZERO_BOUNDS } from '@/config/mission';
import { useAzimuth } from '@/state/store';
import { useGuide } from '@/state/guide';
import { useT } from '@/lib/useT';
import { Logo } from '@/components/ui/Logo';
import { LangSwitch } from '@/components/ui/LangSwitch';

/* ------------------------------------------------------------- helpers */
function useCountUp(to: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

function Stat({ n, label }: { n: number; label: string }) {
  const v = useCountUp(n);
  return (
    <div className="ab-stat">
      <div className="f-mono ab-stat-n">{String(v).padStart(2, '0')}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <div className="label" style={{ color: 'var(--accent)', letterSpacing: 4 }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ sections */
function WhatSection({ c }: { c: AboutCopy }) {
  const [open, setOpen] = useState(0);
  // posição da base dentro do recorte CTX (para o marcador na miniatura)
  const bx = ((BASE.lng - JEZERO_BOUNDS.west) / (JEZERO_BOUNDS.east - JEZERO_BOUNDS.west)) * 100;
  const by = ((JEZERO_BOUNDS.north - BASE.lat) / (JEZERO_BOUNDS.north - JEZERO_BOUNDS.south)) * 100;
  return (
    <div className="ab-grid">
      <div>
        <Eyebrow>{c.what.eyebrow}</Eyebrow>
        <h2 className="f-display ab-h2">{c.what.title}</h2>
        <p className="ab-lead">{c.what.lead}</p>
        <div className="label" style={{ marginTop: 28 }}>
          {c.what.tapHint}
        </div>
        <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
          {c.what.questions.map((q, i) => (
            <button key={q.q} type="button" className={`ab-q ${open === i ? 'on' : ''}`} aria-expanded={open === i} onClick={() => setOpen(i)}>
              <div className="flex items-center gap-4">
                <span className="f-mono ab-q-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="ab-q-t">{q.q}</span>
                <span className="ab-q-arrow" aria-hidden>
                  ▸
                </span>
              </div>
              <div className="ab-q-a">
                <div>{q.a}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="ab-card">
          <div className="ab-map" style={{ backgroundImage: 'url(/textures/jezero-ctx.webp)' }}>
            <div className="ab-pin" style={{ left: `${bx}%`, top: `${by}%` }}>
              <i />
            </div>
            <div className="ab-map-cap label">MRO CTX · 6 M/PX</div>
          </div>
          <div className="label" style={{ marginTop: 14 }}>
            {c.what.placeLabel}
          </div>
          <div className="f-mono" style={{ fontSize: 14, marginTop: 6 }}>
            {c.what.place}
          </div>
          <p className="ab-small">{c.what.placeWhy}</p>
        </div>
        <div className="ab-card">
          <div className="flex items-center gap-3">
            <span className="ab-dot" />
            <span className="label" style={{ color: 'var(--accent)' }}>
              {c.what.aiLabel}
            </span>
          </div>
          <p className="ab-small" style={{ marginTop: 10 }}>
            {c.what.ai}
          </p>
        </div>
      </div>
    </div>
  );
}

function WhySection({ c }: { c: AboutCopy }) {
  const [open, setOpen] = useState<number | null>(0);
  const labels = c.why.stats;
  return (
    <div className="ab-grid">
      <div>
        <Eyebrow>{c.why.eyebrow}</Eyebrow>
        <h2 className="f-display ab-h2">{c.why.title}</h2>
        {c.why.paragraphs.map((p) => (
          <p key={p} className="ab-p">
            {p}
          </p>
        ))}
        <blockquote className="ab-quote">
          <div>“{c.why.quote}”</div>
          <div className="src" style={{ marginTop: 8 }}>
            {c.why.quoteSource}
          </div>
        </blockquote>
        <div className="ab-stats">
          <Stat n={8} label={labels[0]} />
          <Stat n={13} label={labels[1]} />
          <Stat n={11} label={labels[2]} />
          <Stat n={3} label={labels[3]} />
        </div>
      </div>
      <div>
        <div className="label">{c.why.checklistTitle}</div>
        <div className="flex flex-col" style={{ marginTop: 10 }}>
          {c.why.checklist.map((it, i) => (
            <button
              key={it.need}
              type="button"
              className={`ab-check ${open === i ? 'on' : ''}`}
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <div className="flex items-center gap-3">
                <span className="ab-tick" aria-hidden>
                  ✓
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{it.need}</span>
              </div>
              <div className="ab-q-a">
                <div style={{ paddingLeft: 34 }}>{it.answer}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<DataStatus, string> = {
  real: 'var(--accent)',
  approx: '#FFB547',
  estimate: '#FFB547',
  sample: 'var(--alert)',
};

function DataSection({ c }: { c: AboutCopy }) {
  const [sel, setSel] = useState(0);
  const it = c.data.items[sel];
  return (
    <div>
      <Eyebrow>{c.data.eyebrow}</Eyebrow>
      <h2 className="f-display ab-h2">{c.data.title}</h2>
      <p className="ab-lead">{c.data.lead}</p>
      <div className="ab-grid" style={{ marginTop: 24 }}>
        <div className="ab-chips" role="tablist">
          {c.data.items.map((d, i) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={sel === i}
              className={`ab-chip ${sel === i ? 'on' : ''}`}
              onClick={() => setSel(i)}
              onMouseEnter={() => setSel(i)}
            >
              <span className="f-mono ab-chip-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="ab-chip-t">{d.type}</span>
              <span className="ab-chip-dot" style={{ background: STATUS_TONE[d.status] }} />
            </button>
          ))}
        </div>
        <div className="ab-card ab-detail" key={it.id}>
          <div className="flex items-center justify-between gap-3">
            <span className="f-display" style={{ fontSize: 22, letterSpacing: 3 }}>
              {it.type.toUpperCase()}
            </span>
            <span className="ab-badge" style={{ color: STATUS_TONE[it.status], borderColor: STATUS_TONE[it.status] }}>
              {c.data.status[it.status]}
            </span>
          </div>
          <div className="kv" style={{ marginTop: 14 }}>
            <span>{c.data.fields.source}</span>
            <b>{it.source}</b>
          </div>
          <div className="kv">
            <span>{c.data.fields.shows}</span>
            <b>{it.shows}</b>
          </div>
          <div className="kv">
            <span>{c.data.fields.use}</span>
            <b className="a">{it.use}</b>
          </div>
        </div>
      </div>
      <p className="src" style={{ marginTop: 22, fontSize: 10, lineHeight: 1.6 }}>
        {c.data.honesty}
      </p>
    </div>
  );
}

function HowSection({ c }: { c: AboutCopy }) {
  const [sel, setSel] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setSel((s) => (s + 1) % c.how.steps.length), 2600);
    return () => clearInterval(t);
  }, [auto, c.how.steps.length]);
  const pick = (i: number) => {
    setAuto(false);
    setSel(i);
  };
  const step = c.how.steps[sel];
  return (
    <div>
      <Eyebrow>{c.how.eyebrow}</Eyebrow>
      <h2 className="f-display ab-h2">{c.how.title}</h2>
      <div className="ab-flow" role="tablist">
        <div className="ab-flow-line" aria-hidden>
          <div style={{ width: `${(sel / (c.how.steps.length - 1)) * 100}%` }} />
        </div>
        {c.how.steps.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={sel === i}
            className={`ab-node ${i <= sel ? 'past' : ''} ${i === sel ? 'on' : ''} ${i === c.how.steps.length - 1 ? 'rs' : ''}`}
            onClick={() => pick(i)}
          >
            <span className="ab-node-d">
              <span className="f-mono">{i + 1}</span>
            </span>
            <span className="ab-node-t">{s.name}</span>
          </button>
        ))}
      </div>
      <div className="ab-card ab-detail" key={sel} style={{ marginTop: 18 }}>
        <div className="flex items-center justify-between gap-3">
          <span className="label" style={{ color: sel === c.how.steps.length - 1 ? 'var(--alert)' : 'var(--accent)' }}>
            {String(sel + 1).padStart(2, '0')} · {step.name.toUpperCase()}
          </span>
          <button type="button" className="mini" onClick={() => setAuto(!auto)} aria-pressed={auto}>
            {auto ? '❚❚' : '▶'}
          </button>
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: '10px 0 0' }}>{step.detail}</p>
      </div>
      <div className="ab-grid" style={{ marginTop: 22 }}>
        <div>
          <div className="label">{c.how.rulesTitle}</div>
          <ol className="ab-rules">
            {c.how.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
        <p className="ab-small" style={{ alignSelf: 'end' }}>
          {c.how.stack}
        </p>
      </div>
    </div>
  );
}

function TeamSection({ c, lang, onTour, onMap }: { c: AboutCopy; lang: 'en' | 'pt'; onTour: () => void; onMap: () => void }) {
  const [flipped, setFlipped] = useState<string | null>(null);
  return (
    <div>
      <Eyebrow>{c.teamSec.eyebrow}</Eyebrow>
      <h2 className="f-display ab-h2">{c.teamSec.title}</h2>
      <p className="ab-lead">{c.teamSec.lead}</p>
      <div className="label" style={{ marginTop: 18 }}>
        {c.teamSec.flipHint}
      </div>
      <div className="ab-team">
        {team.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={`ab-flip ${flipped === m.id ? 'on' : ''}`}
            style={{ animationDelay: `${i * 120}ms` }}
            aria-pressed={flipped === m.id}
            onClick={() => setFlipped(flipped === m.id ? null : m.id)}
          >
            <div className="ab-flip-in">
              <div className="ab-face front">
                <div className="ab-avatar" aria-hidden>
                  <span className="f-display">{m.initials}</span>
                </div>
                <div className="f-display" style={{ fontSize: 16, letterSpacing: 2, marginTop: 22 }}>
                  {m.name.toUpperCase()}
                </div>
                <div className="label" style={{ marginTop: 8 }}>
                  {m.role[lang]}
                </div>
                {m.badge ? <div className="ab-badge" style={{ marginTop: 12 }}>{m.badge[lang].toUpperCase()}</div> : <div style={{ height: 34 }} />}
              </div>
              <div className="ab-face back">
                <div className="label" style={{ color: 'var(--accent)' }}>
                  {m.name.toUpperCase()}
                </div>
                <ul className="ab-focus">
                  {m.focus[lang].map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="ab-cta">
        <div>
          <div className="f-display" style={{ fontSize: 18, letterSpacing: 2 }}>
            {c.teamSec.ctaTitle}
          </div>
          <p className="ab-small" style={{ marginTop: 8, maxWidth: 520 }}>
            {c.teamSec.ctaBody}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button type="button" className="btn primary" onClick={onTour}>
            {c.teamSec.ctaTour}
          </button>
          <button type="button" className="btn" onClick={onMap}>
            {c.teamSec.ctaMap}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- main */
export function AboutScreen() {
  const { lang } = useT();
  const c = aboutCopy[lang];
  const open = useGuide((s) => s.aboutOpen);
  const section = useGuide((s) => s.aboutSection);
  const setSection = useGuide((s) => s.setAboutSection);
  const close = useGuide((s) => s.closeAbout);
  const startTour = useGuide((s) => s.startTour);
  const n = c.sections.length;

  const goMap = () => {
    close();
    const a = useAzimuth.getState();
    if (a.mode === 'intro') a.setMode('plan');
  };

  useEffect(() => {
    if (!open) return;
    // captura: as setas/Esc não chegam ao globo da abertura nem ao mapa enquanto o Sobre está aberto
    const onKey = (e: KeyboardEvent) => {
      const g = useGuide.getState();
      if (e.key === 'Escape') g.closeAbout();
      else if (e.key === 'ArrowRight') g.setAboutSection(Math.min(n - 1, g.aboutSection + 1));
      else if (e.key === 'ArrowLeft') g.setAboutSection(Math.max(0, g.aboutSection - 1));
      else {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, n]);

  if (!open) return null;

  return (
    <div className="about" role="dialog" aria-modal="true" aria-label={c.open}>
      <div className="grid-ov" />
      <div className="ab-glow" aria-hidden />
      <header className="ab-head">
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <div className="f-display" style={{ fontSize: 18, letterSpacing: 8 }}>
              {brand.name}
            </div>
            <div className="f-mono" style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 4 }}>
              {c.open} · {brand.text[lang].tagline.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch />
          <button type="button" className="btn icon" onClick={close} aria-label={c.close} title={c.close}>
            ✕
          </button>
        </div>
      </header>

      <div className="ab-body">
        <nav className="ab-nav" aria-label={c.open}>
          {c.sections.map((s, i) => (
            <button key={s} type="button" className={`ab-tab ${section === i ? 'on' : ''} ${i < section ? 'past' : ''}`} aria-current={section === i ? 'step' : undefined} onClick={() => setSection(i)}>
              <span className="f-mono">{String(i + 1).padStart(2, '0')}</span>
              <span>{s}</span>
            </button>
          ))}
        </nav>

        <main className="ab-main">
          <div className="ab-sec" key={`${section}-${lang}`}>
            {section === 0 ? <WhatSection c={c} /> : null}
            {section === 1 ? <WhySection c={c} /> : null}
            {section === 2 ? <DataSection c={c} /> : null}
            {section === 3 ? <HowSection c={c} /> : null}
            {section === 4 ? <TeamSection c={c} lang={lang} onTour={startTour} onMap={goMap} /> : null}
          </div>

          <div className="ab-foot">
            <button type="button" className="btn" disabled={section === 0} onClick={() => setSection(section - 1)}>
              ◂ {c.prev}
            </button>
            <div className="flex gap-2" aria-hidden>
              {c.sections.map((s, i) => (
                <span key={s} className={`ab-pip ${i === section ? 'on' : ''}`} />
              ))}
            </div>
            {section < n - 1 ? (
              <button type="button" className="btn primary" onClick={() => setSection(section + 1)}>
                {c.next} ▸
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={startTour}>
                {c.tutorial} ▸
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
