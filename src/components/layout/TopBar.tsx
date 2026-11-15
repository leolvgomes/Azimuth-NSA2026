'use client';
import { useEffect, useState } from 'react';
import { brand } from '@/config/brand';
import { useAzimuth, type Mode } from '@/state/store';
import { fmtLatLng, upper } from '@/lib/format';
import { useT } from '@/lib/useT';
import type { I18nKey } from '@/lib/i18n';
import { Logo } from '@/components/ui/Logo';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { HelpButton } from '@/components/guide/GuideButtons';

const TABS: { mode: Exclude<Mode, 'intro'>; key: I18nKey }[] = [
  { mode: 'plan', key: 'tabPlan' },
  { mode: 'walk', key: 'tabWalk' },
  { mode: 'rescue', key: 'tabRescue' },
];

function Elapsed({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  return <>{`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`}</>;
}

export function TopBar() {
  const { t } = useT();
  const mode = useAzimuth((s) => s.mode);
  const setMode = useAzimuth((s) => s.setMode);
  const enterRescue = useAzimuth((s) => s.enterRescue);
  const exitRescue = useAzimuth((s) => s.exitRescue);
  const cursor = useAzimuth((s) => s.cursor);
  const zoom = useAzimuth((s) => s.zoom);
  const position = useAzimuth((s) => s.position);
  const rescueStartedAt = useAzimuth((s) => s.rescueStartedAt);
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const simDist = useAzimuth((s) => s.sim.distM);

  const rescue = mode === 'rescue';
  const progressPct = route && route.distanceM > 0 ? Math.min(100, Math.round((simDist / route.distanceM) * 100)) : 0;

  return (
    <header className="topbar">
      <div className="flex items-center gap-4 min-w-0">
        <Logo alert={rescue} />
        <div className="min-w-0">
          <div className="f-display truncate" style={{ fontSize: 20, letterSpacing: 8, color: rescue ? 'var(--alert)' : undefined }}>
            {rescue ? t('rescueMode') : brand.name}
          </div>
          <div className="f-mono" style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 4 }}>
            {rescue ? (
              <>
                {t('activatedAgo')} <Elapsed since={rescueStartedAt} />
              </>
            ) : mode === 'walk' ? (
              t('subWalk')
            ) : (
              t('subPlan')
            )}
          </div>
        </div>
      </div>

      <nav className="flex" aria-label={t('steps')}>
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            className={`crumb ${mode === tab.mode ? 'on' : ''}`}
            aria-current={mode === tab.mode ? 'page' : undefined}
            disabled={tab.mode === 'walk' && !route}
            title={tab.mode === 'walk' && !route ? t('pickRouteFirst') : undefined}
            onClick={() => setMode(tab.mode)}
          >
            {t(tab.key)}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        {!rescue ? (
          <div className="text-right hidden xl:block" style={{ minWidth: 200 }}>
            <div className="f-mono" style={{ fontSize: 13, letterSpacing: 1 }}>
              {fmtLatLng(mode === 'walk' ? position : cursor ?? position)}
            </div>
            <div className="label" style={{ marginTop: 4 }}>
              {mode === 'walk' && route ? `${upper(route.label)} · ${progressPct}%` : `${cursor ? t('cursor') : t('positionLbl')} · ${t('zoom')} ${zoom}`}
            </div>
          </div>
        ) : null}
        <HelpButton />
        <LangSwitch />
        {rescue ? (
          <button type="button" className="btn" onClick={exitRescue}>
            {t('exitRescue')}
          </button>
        ) : (
          <button type="button" className="btn rescue" data-tour="rescue-btn" onClick={enterRescue} aria-label={t('rescueAria')}>
            {t('rescue')}
          </button>
        )}
      </div>
    </header>
  );
}
