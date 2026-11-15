'use client';
import { brand } from '@/config/brand';
import { BASE } from '@/config/mission';
import { environment, initialSuitState } from '@/config/suit';
import { fmtLatLng, upper } from '@/lib/format';
import { useT } from '@/lib/useT';
import { Logo } from '@/components/ui/Logo';
import { SampleTag } from '@/components/ui/SampleTag';
import { LangSwitch } from '@/components/ui/LangSwitch';

/** Abertura 2D (Tela 1) enquanto o globo 3D (globe-3d) não existe, carrega ou falha. */
export function IntroFallback({ onEnter, onRescue }: { onEnter: () => void; onRescue?: () => void }) {
  const { t, lang } = useT();
  const bt = brand.text[lang];
  return (
    <div className="screen">
      <div
        aria-hidden
        style={{
          position: 'absolute', left: '50%', top: '37%', width: 1100, height: 1100, marginLeft: -550, borderRadius: '50%',
          background: `radial-gradient(circle at 38% 30%, #E07A45 0%, ${brand.colors.mars} 30%, #7A2A0A 62%, #2A0E04 85%, ${brand.colors.bg} 100%)`,
        }}
      />
      <div
        aria-hidden
        style={{ position: 'absolute', left: '50%', top: '37%', width: 1100, height: 1100, marginLeft: -550, borderRadius: '50%', background: 'radial-gradient(circle at 70% 18%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 75%)' }}
      />
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: 'calc(37% - 50px)', width: 1200, height: 1200, marginLeft: -600, borderRadius: '50%', border: '1px solid rgba(212,255,0,0.18)' }} />
      <div className="grid-ov" />

      <div className="topbar" style={{ background: 'transparent', borderBottom: 'none' }}>
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <div className="f-display" style={{ fontSize: 20, letterSpacing: 8 }}>
              {brand.name}
            </div>
            <div className="f-mono" style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 4 }}>
              INTERPLANETARY GUIDE
            </div>
          </div>
        </div>
        <div className="label hidden xl:block">{brand.challenge.toUpperCase()}</div>
        <div className="flex items-center gap-4">
          <LangSwitch />
          <button type="button" className="btn rescue" onClick={onRescue ?? onEnter}>
            {t('rescue')}
          </button>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: '16%', textAlign: 'center', zIndex: 3 }}>
        <div className="label" style={{ color: 'var(--accent)', letterSpacing: 6 }}>
          {upper(bt.tagline)}
        </div>
        <h1 className="f-display" style={{ fontSize: 'clamp(56px, 7vw, 96px)', letterSpacing: '0.3em', margin: '18px 0 0', paddingLeft: '0.3em' }}>
          {brand.name}
        </h1>
        <div style={{ fontSize: 17, color: 'var(--text-dim)', marginTop: 16 }}>{bt.subtitle}</div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '52%', zIndex: 3 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 28, height: 28, border: '2px solid var(--accent)', transform: 'rotate(45deg)' }} />
        <div style={{ position: 'absolute', left: 9, top: 9, width: 10, height: 10, background: 'var(--accent)', transform: 'rotate(45deg)' }} />
        <div style={{ position: 'absolute', left: 46, top: -18, whiteSpace: 'nowrap' }}>
          <div className="label" style={{ color: 'var(--accent)' }}>
            {t('youAreHere')}
          </div>
          <div className="f-mono" style={{ fontSize: 13, marginTop: 6 }}>
            {t('jezeroCrater')}
          </div>
          <div className="f-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            {fmtLatLng(BASE)}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: '66%', display: 'flex', justifyContent: 'center', gap: 16, zIndex: 3 }}>
        <button type="button" className="btn primary" onClick={onEnter} autoFocus>
          {t('enterPlan')}
        </button>
        {onRescue ? (
          <button type="button" className="btn danger" onClick={onRescue}>
            {t('rescueModeBtn')}
          </button>
        ) : null}
      </div>

      <div
        className="flex items-center justify-between"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, borderTop: '1px solid var(--line)', background: 'rgba(5,5,5,0.9)', padding: '0 32px', zIndex: 3, gap: 24 }}
      >
        <Telemetry label={`${upper(t('air'))} · MEDA`} value={`${environment.airTempC} °C · ${environment.pressurePa} Pa`} />
        <Telemetry label={`${upper(t('radiation'))} · RAD (EST.)`} value={`${environment.radiationMSvPerDay} ${t('perDay')}`} />
        <Telemetry label={`O₂ · ${t('oxygen')}`} value={`${initialSuitState.o2Pct}%`} accent />
        <Telemetry label={t('battery')} value={`${initialSuitState.batteryPct}%`} />
        <SampleTag />
        <div className="label hidden lg:block" style={{ maxWidth: 360, color: 'var(--text-faint)' }}>
          {brand.credits}
        </div>
      </div>
    </div>
  );
}

function Telemetry({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="f-mono" style={{ fontSize: 16, marginTop: 4, color: accent ? 'var(--accent)' : undefined }}>
        {value}
      </div>
    </div>
  );
}
