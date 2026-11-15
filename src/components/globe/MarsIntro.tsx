'use client';

/**
 * Azimuth 3D intro (Tela 1 · Abertura).
 * Mars with real Viking color mosaic, "VOCÊ ESTÁ AQUI" at Jezero, then a camera flight
 * (pull back -> globe turns -> dive to Jezero -> fade to black) that ends by calling onEnter().
 *
 * Usage (client only):
 *   const MarsIntro = dynamic(() => import('@/components/globe/MarsIntro'), { ssr: false });
 *   <MarsIntro onEnter={() => setScreen('map')} />
 */
import { Component, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { brand } from '@/config/brand';
import { BASE } from '@/config/mission';
import { environment, initialSuitState } from '@/config/suit';
import MarsScene, { MARS_FOV, MarkerLabel } from './MarsScene';
import { introCopy, type IntroCopy } from './copy';
import { DEFAULT_LANG, LOCALE, type Lang } from '@/config/i18n';

export interface MarsIntroProps {
  onEnter: () => void;
  /** UI language (default DEFAULT_LANG = 'en'). */
  lang?: Lang;
}

const C = brand.colors;
const F = {
  display: `var(--font-display, '${brand.fonts.display}'), 'Michroma', sans-serif`,
  body: `var(--font-body, '${brand.fonts.body}'), 'Montserrat', system-ui, sans-serif`,
  mono: `var(--font-mono, '${brand.fonts.mono}'), 'JetBrains Mono', ui-monospace, monospace`,
};

const TEX_2K = '/textures/mars-2k.jpg';
const TEX_4K = '/textures/mars-4k.jpg';
const TEX_JEZERO = '/textures/jezero-ctx.webp';

/* ----------------------------------------------------------------- helpers */
function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

class GlBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[MarsIntro] 3D failed, using 2D fallback', err);
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* --------------------------------------------------------------- 2D fallback */
function FallbackPlanet() {
  // Equirect texture shifted so Jezero sits at the disk center (flat, but real imagery).
  const u = ((BASE.lng + 180) / 360) * 100;
  const v = ((90 - BASE.lat) / 180) * 100;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: '58%',
        width: 'min(120vh, 110vw)',
        aspectRatio: '1',
        transform: 'translateX(-50%)',
        borderRadius: '50%',
        backgroundImage: `radial-gradient(circle at 36% 28%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.75) 78%), url(${TEX_2K})`,
        backgroundSize: '100% 100%, 260% 130%',
        backgroundPosition: `0 0, ${u}% ${v}%`,
        boxShadow: `0 0 80px 6px rgba(193,68,14,0.35)`,
      }}
    />
  );
}

/* ------------------------------------------------------------------- HUD */
const label: CSSProperties = {
  fontFamily: F.mono,
  fontSize: 11,
  letterSpacing: 2,
  color: C.textDim,
  textTransform: 'uppercase',
};

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s: CSSProperties = { position: 'absolute', width: 18, height: 18, borderColor: C.accent, borderStyle: 'solid', opacity: 0.7 };
  const m = 16;
  if (pos === 'tl') Object.assign(s, { top: m, left: m, borderWidth: '2px 0 0 2px' });
  if (pos === 'tr') Object.assign(s, { top: m, right: m, borderWidth: '2px 2px 0 0' });
  if (pos === 'bl') Object.assign(s, { bottom: m, left: m, borderWidth: '0 0 2px 2px' });
  if (pos === 'br') Object.assign(s, { bottom: m, right: m, borderWidth: '0 2px 2px 0' });
  return <div style={s} />;
}

function Telemetry({ copy, lang }: { copy: IntroCopy; lang: Lang }) {
  const n = (v: number, digits = 0) =>
    new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  const items: { k: string; v: string; accent?: boolean }[] = [
    { k: copy.base, v: `${n(BASE.lat, 2)}° N · ${n(BASE.lng, 2)}° E` },
    { k: copy.air, v: `${n(environment.airTempC)} °C · ${n(environment.pressurePa)} Pa` },
    { k: copy.radiation, v: `${n(environment.radiationMSvPerDay, 2)} ${copy.radiationUnit}` },
    { k: copy.o2, v: `${n(initialSuitState.o2Pct)}%`, accent: true },
    { k: copy.battery, v: `${n(initialSuitState.batteryPct)}%` },
  ];
  return (
    <div className="azi-telemetry">
      {items.map((it) => (
        <div key={it.k} className="azi-tel-item">
          <div style={label}>{it.k}</div>
          <div style={{ fontFamily: F.mono, fontSize: 16, marginTop: 4, color: it.accent ? C.accent : C.text }}>{it.v}</div>
        </div>
      ))}
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 10,
          letterSpacing: 2,
          color: C.alert,
          border: `1px solid ${C.alert}`,
          padding: '4px 8px',
          whiteSpace: 'nowrap',
        }}
      >
        {brand.text[lang].sampleDataLabel}
      </div>
      <div className="azi-tel-hint" style={{ ...label, color: C.text }}>
        {copy.clickHint}
      </div>
    </div>
  );
}

const css = `
.azi-intro, .azi-intro * { box-sizing: border-box; }
.azi-intro button:focus-visible { outline: 2px solid ${C.text}; outline-offset: 3px; }
.azi-telemetry { position:absolute; left:0; right:0; bottom:0; min-height:80px; border-top:1px solid ${C.line};
  background:rgba(5,5,5,0.88); display:flex; align-items:center; justify-content:space-between; gap:20px;
  padding:12px 32px; z-index:3; flex-wrap:wrap; }
.azi-btn-primary { height:64px; padding:0 40px; background:${C.accent}; color:#000; border:none; cursor:pointer;
  font-family:${F.display}; font-size:14px; letter-spacing:4px; transition: transform 150ms ease, box-shadow 150ms ease; }
.azi-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 0 24px rgba(212,255,0,0.35); }
.azi-btn-ghost { height:64px; padding:0 28px; background:rgba(5,5,5,0.6); color:${C.text}; cursor:pointer;
  border:1px solid ${C.lineStrong}; font-family:${F.display}; font-size:12px; letter-spacing:3px; }
.azi-btn-ghost:hover { border-color:${C.text}; }
.azi-title { font-family:${F.display}; font-size:clamp(40px, 7.2vw, 96px); letter-spacing:clamp(10px, 2vw, 28px);
  margin-top:18px; padding-left:clamp(10px, 2vw, 28px); line-height:1.05; }
@media (max-width: 1180px) { .azi-challenge { display:none; } }
@media (max-width: 760px) {
  .azi-telemetry { padding:10px 16px; gap:10px 18px; justify-content:flex-start; }
  .azi-tel-item:nth-child(1), .azi-tel-hint { display:none; }
  .azi-challenge { display:none; }
}
@keyframes azi-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
`;

/* ------------------------------------------------------------------ main */
export default function MarsIntro({ onEnter, lang = DEFAULT_LANG }: MarsIntroProps) {
  const copy = introCopy[lang] ?? introCopy.en;
  const text = brand.text[lang] ?? brand.text.en;
  const reducedMotion = usePrefersReducedMotion();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [texUrl, setTexUrl] = useState(TEX_2K);
  const [ready, setReady] = useState(false);
  const [flying, setFlying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fadeRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const entered = useRef(false);

  useEffect(() => {
    setWebgl(detectWebGL());
    const px = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
    if (px >= 1800 && !/Mobi|Android/i.test(navigator.userAgent)) setTexUrl(TEX_4K);
  }, []);

  const finish = useCallback(() => {
    if (entered.current) return;
    entered.current = true;
    document.body.style.cursor = '';
    onEnter();
  }, [onEnter]);

  /** Quick fade to black, then enter (Pular / reduced motion / fallback). */
  const quickExit = useCallback(() => {
    if (entered.current || leaving) return;
    setLeaving(true);
    if (fadeRef.current) {
      fadeRef.current.style.transition = 'opacity 320ms ease';
      fadeRef.current.style.opacity = '1';
    }
    window.setTimeout(finish, 340);
  }, [finish, leaving]);

  const start = useCallback(() => {
    if (flying || leaving || entered.current) return;
    if (reducedMotion || !webgl || !ready) {
      quickExit();
      return;
    }
    setFlying(true);
  }, [flying, leaving, reducedMotion, webgl, ready, quickExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') start();
      if (e.key === 'Escape') quickExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start, quickExit]);

  const onReady = useCallback(() => setReady(true), []);
  const hudHidden = flying || leaving;
  const hudFade: CSSProperties = {
    opacity: hudHidden ? 0 : 1,
    transition: 'opacity 450ms ease',
    pointerEvents: hudHidden ? 'none' : undefined,
  };

  const fallback = <FallbackPlanet />;

  return (
    <div
      className="azi-intro"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: C.bg,
        color: C.text,
        fontFamily: F.body,
        zIndex: 50,
      }}
    >
      <style>{css}</style>

      {/* 3D layer (or 2D fallback) */}
      <div style={{ position: 'absolute', inset: 0, opacity: ready || webgl === false ? 1 : 0, transition: 'opacity 900ms ease' }}>
        {webgl === true && (
          <GlBoundary fallback={fallback} onError={() => setWebgl(false)}>
            <Canvas
              dpr={[1, 1.75]}
              gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
              camera={{ fov: MARS_FOV, near: 0.005, far: 400, position: [0, 0, 4] }}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
              }}
            >
              <Suspense fallback={null}>
                <MarsScene
                  textureUrl={texUrl}
                  patchUrl={TEX_JEZERO}
                  flying={flying}
                  reducedMotion={reducedMotion}
                  labelRef={labelRef}
                  fadeRef={fadeRef}
                  onPlanetClick={start}
                  onFlightEnd={finish}
                  onReady={onReady}
                />
              </Suspense>
            </Canvas>
          </GlBoundary>
        )}
        {webgl === false && fallback}
      </div>

      {webgl === true && <MarkerLabel ref={labelRef} copy={copy} locale={LOCALE[lang]} visible={ready && !hudHidden} />}

      {/* grid + vignette */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          maskImage: 'radial-gradient(ellipse at 50% 40%, #000 40%, rgba(0,0,0,0.35) 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, #000 40%, rgba(0,0,0,0.35) 100%)',
          ...hudFade,
        }}
      />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...hudFade }}>
        <Corner pos="tl" />
        <Corner pos="bl" />
        <Corner pos="br" />
      </div>

      {/* top bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 88,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          zIndex: 3,
          ...hudFade,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              border: `2px solid ${C.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'rotate(45deg)',
            }}
          >
            <div style={{ width: 10, height: 10, background: C.accent }} />
          </div>
          <div>
            <div style={{ fontFamily: F.display, fontSize: 20, letterSpacing: 8 }}>{brand.name}</div>
            <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2, color: C.textDim, marginTop: 4 }}>
              {copy.productLine}
            </div>
          </div>
        </div>
        {/* centered, so the top-right corner stays free for the EN/PT selector (ui-builder) */}
        <div
          className="azi-challenge"
          style={{ ...label, position: 'absolute', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
        >
          {brand.challenge.toUpperCase()}
        </div>
      </div>

      {/* title block */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 'clamp(104px, 16vh, 150px)',
          textAlign: 'center',
          zIndex: 3,
          pointerEvents: 'none',
          ...hudFade,
        }}
      >
        <div style={{ animation: 'azi-in 900ms ease both' }}>
          <div style={{ ...label, color: C.accent, letterSpacing: 6 }}>{text.tagline.toUpperCase()}</div>
          <h1 className="azi-title" style={{ fontWeight: 400, margin: '18px 0 0' }}>
            {brand.name}
          </h1>
          <div style={{ fontSize: 17, color: C.textDim, marginTop: 16 }}>{text.subtitle}</div>
        </div>
      </div>

      {/* actions */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'clamp(112px, 18vh, 170px)',
          zIndex: 4,
          ...hudFade,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, animation: 'azi-in 900ms 200ms ease both' }}>
        <button type="button" className="azi-btn-primary" onClick={start} autoFocus>
          {copy.enter} ▸
        </button>
        <button type="button" className="azi-btn-ghost" onClick={quickExit}>
          {copy.skip}
        </button>
        </div>
      </div>

      {/* credit */}
      <div
        style={{
          position: 'absolute',
          right: 32,
          bottom: 96,
          fontFamily: F.mono,
          fontSize: 10,
          letterSpacing: 1,
          color: C.textFaint,
          zIndex: 3,
          ...hudFade,
        }}
      >
        {copy.imageryCredit}
      </div>

      <div style={hudFade}>
        <Telemetry copy={copy} lang={lang} />
      </div>

      {webgl === false && (
        <div style={{ position: 'absolute', left: 32, bottom: 96, ...label, color: C.textFaint, zIndex: 3 }}>{copy.noWebgl}</div>
      )}

      {/* fade to black (driven by the camera rig or quickExit) */}
      <div
        ref={fadeRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, pointerEvents: 'none', zIndex: 60 }}
      />
    </div>
  );
}
