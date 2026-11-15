'use client';
/**
 * Tutorial interativo sobre o app real. Destaca o elemento [data-tour="..."] do passo, mostra um
 * cartão ao lado e avança sozinho quando o store principal indica que o usuário fez a ação.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { tourCopy } from '@/config/about';
import { useAzimuth } from '@/state/store';
import { markTourSeen, tourSeen, useGuide } from '@/state/guide';
import { useLayout } from '@/state/layout';
import { useT } from '@/lib/useT';
import { TOUR_STEPS, type TourStep } from './tourSteps';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 8;
const GAP = 16;
const CARD_W = 360;
const MARGIN = 16;

function findTarget(id?: string): HTMLElement | null {
  if (!id) return null;
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5);

/** Posição do cartão: do lado com mais espaço em volta do alvo, sempre dentro da tela. */
function placeCard(t: Box | null, ch: number, step: TourStep): { left: number; top: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cw = Math.min(CARD_W, W - 2 * MARGIN);
  const clampX = (x: number) => Math.max(MARGIN, Math.min(W - cw - MARGIN, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(H - ch - MARGIN, y));
  if (!t || step.placement === 'center') return { left: (W - cw) / 2, top: clampY((H - ch) / 2) };
  // acima da barra da Azimuth (bottom 124 + 64 px) e da faixa do traje
  if (step.placement === 'bottom') return { left: (W - cw) / 2, top: clampY(H - ch - 212) };

  const space = { right: W - (t.x + t.w), left: t.x, below: H - (t.y + t.h), above: t.y };
  if (space.right >= cw + GAP + MARGIN) return { left: t.x + t.w + GAP, top: clampY(t.y + t.h / 2 - ch / 2) };
  if (space.left >= cw + GAP + MARGIN) return { left: t.x - cw - GAP, top: clampY(t.y + t.h / 2 - ch / 2) };
  if (space.below >= ch + GAP + MARGIN) return { left: clampX(t.x + t.w / 2 - cw / 2), top: t.y + t.h + GAP };
  if (space.above >= ch + GAP + MARGIN) return { left: clampX(t.x + t.w / 2 - cw / 2), top: t.y - ch - GAP };
  return { left: (W - cw) / 2, top: clampY(H - ch - 212) };
}

function StepCard({ index }: { index: number }) {
  const { lang } = useT();
  const copy = tourCopy[lang];
  const step = TOUR_STEPS[index];
  const text = copy.steps[step.id];
  const next = useGuide((s) => s.nextStep);
  const prev = useGuide((s) => s.prevStep);
  const end = useGuide((s) => s.endTour);
  const openAbout = useGuide((s) => s.openAbout);
  const dataReady = useAzimuth((s) => s.dataReady);

  const [target, setTarget] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // segue o alvo a cada frame (painéis rolam, mapa redimensiona, elementos aparecem depois)
  useEffect(() => {
    let raf = 0;
    let lastT: Box | null = null;
    let lastP: { left: number; top: number } | null = null;
    const tick = () => {
      const el = findTarget(step.target);
      let box: Box | null = null;
      if (el) {
        if (!scrolled.current) {
          scrolled.current = true;
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        const r = el.getBoundingClientRect();
        box = { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD };
      }
      if (!same(box, lastT)) {
        lastT = box;
        setTarget(box);
      }
      const ch = cardRef.current?.offsetHeight ?? 240;
      const p = placeCard(box, ch, step);
      if (!lastP || Math.abs(p.left - lastP.left) > 0.5 || Math.abs(p.top - lastP.top) > 0.5) {
        lastP = p;
        setPos(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // abre o painel onde o alvo mora (coluna recolhida no desktop / gaveta no celular)
  useEffect(() => {
    useLayout.getState().reveal(step.panel ?? null);
  }, [step]);

  // conclusão: observa o store. Já satisfeito ao abrir (ex.: voltou um passo) = marca feito sem pular.
  useEffect(() => {
    if (!step.done) return;
    const snap = useAzimuth.getState();
    if (step.done(snap, snap)) {
      setDone(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useAzimuth.subscribe((s) => {
      if (timer || !step.done!(s, snap)) return;
      setDone(true);
      timer = setTimeout(next, 1100);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [step, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [end]);

  const isAction = !!step.done;
  const first = index === 0;
  const last = index === TOUR_STEPS.length - 1;
  const dim = step.dim ?? true;
  const total = TOUR_STEPS.length;

  const spot: CSSProperties = target
    ? { left: target.x, top: target.y, width: target.w, height: target.h }
    : { left: '50%', top: '50%', width: 0, height: 0 };

  return (
    <>
      {/* destaque: o "buraco" é o próprio box; a sombra gigante escurece o resto. Não bloqueia cliques. */}
      <div
        aria-hidden
        className={`tour-spot ${target ? 'on' : ''} ${done ? 'ok' : ''}`}
        style={{ ...spot, boxShadow: dim ? '0 0 0 200vmax rgba(0,0,0,0.55)' : 'none' }}
      />
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-live="polite"
        aria-label={text.title}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: `min(${CARD_W}px, calc(100vw - ${2 * MARGIN}px))` }}
      >
        <div className="c tl" />
        <div className="c tr" />
        <div className="c bl" />
        <div className="c br" />
        <div className="flex items-center justify-between gap-3">
          <span className="label" style={{ color: 'var(--accent)' }}>
            {copy.step} {String(index + 1).padStart(2, '0')} {copy.of} {String(total).padStart(2, '0')}
          </span>
          <button type="button" className="tour-x" onClick={end} aria-label={copy.exit} title={copy.exit}>
            ✕
          </button>
        </div>
        <div className="tour-progress" aria-hidden>
          <div style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <h3 className="f-display tour-title">{text.title}</h3>
        <p className="tour-body">{text.body}</p>

        {isAction && text.task ? (
          <div className={`tour-task ${done ? 'ok' : ''}`}>
            <div className="label" style={{ color: done ? '#000' : 'var(--accent)' }}>
              {done ? `✓ ${copy.done}` : `▸ ${copy.yourTurn}`}
            </div>
            <div style={{ marginTop: 6 }}>{text.task}</div>
            {!done ? (
              <div className="tour-wait">
                <span className="tour-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                {copy.waiting}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2" style={{ marginTop: 16 }}>
          {!first ? (
            <button type="button" className="mini" onClick={prev} aria-label={copy.backAria} style={{ paddingInline: 16 }}>
              {copy.back}
            </button>
          ) : null}
          {isAction && !done && step.assist && text.assist ? (
            <button type="button" className="mini" onClick={step.assist} disabled={!dataReady}>
              {text.assist}
            </button>
          ) : null}
          <div className="flex-1" />
          {isAction && !done ? (
            <button type="button" className="mini tour-skip" onClick={next}>
              {copy.skip}
            </button>
          ) : last ? (
            <>
              <button
                type="button"
                className="mini"
                onClick={() => {
                  end();
                  openAbout(0);
                }}
              >
                {copy.openAbout}
              </button>
              <button type="button" className="mini f" onClick={end}>
                {copy.finish}
              </button>
            </>
          ) : (
            <button type="button" className="mini f" onClick={next} autoFocus>
              {first ? copy.start : copy.next}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Convite discreto na primeira visita ao mapa: "Primeira vez? Faça o tour". Aparece uma vez por navegador. */
export function TourInvite() {
  const { lang } = useT();
  const c = tourCopy[lang];
  const tourStep = useGuide((s) => s.tourStep);
  const aboutOpen = useGuide((s) => s.aboutOpen);
  const startTour = useGuide((s) => s.startTour);
  const dataReady = useAzimuth((s) => s.dataReady);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!dataReady || tourSeen()) return;
    const id = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(id);
  }, [dataReady]);

  if (!show || tourStep != null || aboutOpen) return null;
  const close = () => {
    markTourSeen();
    setShow(false);
  };
  return (
    <div className="tour-invite" role="dialog" aria-label={c.inviteTitle}>
      <div className="flex items-center gap-3">
        <span className="ab-dot" aria-hidden />
        <span className="label" style={{ color: 'var(--accent)' }}>
          {c.inviteTitle}
        </span>
      </div>
      <p className="tour-body" style={{ marginTop: 8 }}>
        {c.inviteBody}
      </p>
      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="mini f"
          onClick={() => {
            setShow(false);
            startTour();
          }}
        >
          {c.inviteStart}
        </button>
        <button type="button" className="mini tour-skip" onClick={close}>
          {c.inviteLater}
        </button>
      </div>
    </div>
  );
}

export function Tour() {
  const step = useGuide((s) => s.tourStep);
  const mode = useAzimuth((s) => s.mode);
  // o tutorial roda sobre o app; na abertura (intro) ele espera o mapa montar
  useLayoutEffect(() => {
    if (step != null && mode === 'intro') useAzimuth.getState().setMode('plan');
  }, [step, mode]);
  if (step == null || mode === 'intro') return null;
  return <StepCard key={step} index={step} />;
}
