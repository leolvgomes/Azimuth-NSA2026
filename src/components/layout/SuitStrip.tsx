'use client';
import type { CSSProperties } from 'react';
import { suitConfig } from '@/config/suit';
import { useAzimuth } from '@/state/store';
import { fmtDist, fmtDuration, fmtKm, fmtPct } from '@/lib/format';
import { useT } from '@/lib/useT';
import { SampleTag } from '@/components/ui/SampleTag';

function Gauge({ label, value, display, pct, low, min, max, onChange, sub }: {
  label: string;
  value: number;
  display: string;
  pct: number;
  low?: boolean;
  min: number;
  max: number;
  sub: string;
  onChange: (v: number) => void;
}) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="gauge">
      <div className="top">
        <span className="label">{label}</span>
        <span className={`v ${low ? 'r' : ''}`}>{display}</span>
      </div>
      <div className="bar">
        <div className={`f ${low ? 'r' : ''}`} style={{ width: `${p}%` }} />
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.round(value)}
        aria-label={`${label} (${sub})`}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'a' | 'r' }) {
  return (
    <div className="shrink-0">
      <div className="label">{label}</div>
      <div className="f-mono" style={{ fontSize: 22, marginTop: 6, color: tone === 'a' ? 'var(--accent)' : tone === 'r' ? 'var(--alert)' : undefined }}>
        {value}
      </div>
    </div>
  );
}

export function SuitStrip() {
  const { t } = useT();
  const suit = useAzimuth((s) => s.suit);
  const setSuit = useAzimuth((s) => s.setSuit);
  const mode = useAzimuth((s) => s.mode);
  const oxygen = useAzimuth((s) => s.oxygen);
  const pnr = useAzimuth((s) => s.pnr);
  const rescue = useAzimuth((s) => s.rescuePlan);
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const here = useAzimuth((s) => s.sim.distM);

  const toShelter = rescue?.returnRoute.distanceM ?? null;
  const toPnr = pnr ? pnr.distM - here : null;
  const toPnrMin = toPnr != null && route && route.distanceM > 0 ? (route.durationMin * toPnr) / route.distanceM : null;
  const sample = t('sampleAria');

  return (
    <footer className="suit" aria-label={t('suitAria')}>
      <Gauge
        label={t('oxygen')}
        value={suit.o2Pct}
        display={fmtPct(suit.o2Pct)}
        pct={suit.o2Pct}
        low={suit.o2Pct <= suitConfig.o2ReservePct * 2 || oxygen?.ok === false}
        min={0}
        max={100}
        sub={sample}
        onChange={(v) => setSuit({ o2Pct: v })}
      />
      <Gauge
        label={t('battery')}
        value={suit.batteryPct}
        display={fmtPct(suit.batteryPct)}
        pct={suit.batteryPct}
        low={suit.batteryPct <= 25}
        min={0}
        max={100}
        sub={sample}
        onChange={(v) => setSuit({ batteryPct: v })}
      />
      <Gauge
        label={t('suitTemp')}
        value={suit.suitTempC}
        display={`${suit.suitTempC > 0 ? '+' : suit.suitTempC < 0 ? '−' : ''}${Math.abs(Math.round(suit.suitTempC))}°`}
        pct={((suit.suitTempC + 10) / 50) * 100}
        low={suit.suitTempC < 5 || suit.suitTempC > 32}
        min={-10}
        max={40}
        sub={`${t('suitRange')} ${suitConfig.minSurfaceTempC}/+${suitConfig.maxSurfaceTempC} °C`}
        onChange={(v) => setSuit({ suitTempC: v })}
      />
      <div className="vsep" />
      <Stat label={t('toShelterUp')} value={fmtKm(toShelter)} tone={mode === 'rescue' ? 'r' : undefined} />
      {mode === 'rescue' ? (
        <Stat label={t('eta')} value={fmtDuration(rescue?.etaMin)} />
      ) : mode === 'walk' ? (
        <Stat
          label={t('toPnr')}
          value={toPnr == null ? '—' : toPnr <= 0 ? t('passedUp') : `${fmtDist(toPnr)} · ${fmtDuration(toPnrMin)}`}
          tone={toPnr != null && toPnr <= 0 ? 'r' : 'a'}
        />
      ) : (
        <>
          <Stat label={t('autonomy')} value={fmtDuration(oxygen?.autonomyMin)} tone={oxygen?.ok === false ? 'r' : undefined} />
          {route ? <Stat label={t('pnrUp')} value={pnr ? `km ${(pnr.distM / 1000).toFixed(1)}` : '—'} tone="a" /> : null}
        </>
      )}
      <div className="flex-1" />
      <div className="text-right shrink-0">
        <SampleTag />
        <div className="src" style={{ marginTop: 8 }}>
          {t('dragHint')}
        </div>
      </div>
    </footer>
  );
}
