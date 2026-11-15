'use client';
import { useState } from 'react';
import { DEMO_TARGET } from '@/config/mission';
import { environment } from '@/config/suit';
import { localized } from '@/config/i18n';
import type { Landmark, Route } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { fmtDeg, fmtDist, fmtDuration, fmtKm, fmtNum, fmtPct, upper } from '@/lib/format';
import { useT } from '@/lib/useT';
import type { I18nKey } from '@/lib/i18n';
import { Hud } from '@/components/ui/Hud';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { ElevationProfile } from './ElevationProfile';

const SHORT: Record<string, I18nKey> = {
  safest: 'profileSafest',
  balanced: 'profileBalanced',
  fastest: 'profileFastest',
  manual: 'profileManual',
  return: 'profileReturn',
};

function OptionCard({ route, selected, alerts, onSelect }: { route: Route; selected: boolean; alerts: number; onSelect: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className={`opt ${selected ? 'sel' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <div className="nm">{SHORT[route.profile] ? t(SHORT[route.profile]) : upper(route.label)}</div>
      <div className="big">{fmtKm(route.distanceM)}</div>
      <div className="sm">
        {fmtDuration(route.durationMin).replace(' ', '')} · O₂ {fmtPct(route.o2RemainingPct)}
      </div>
      <div className={`sm ${alerts ? 'r' : ''}`}>
        {alerts} {alerts === 1 ? t('alert1') : t('alertN')}
        {route.stops?.length ? ` · ${route.stops.length} ⚗` : ''}
      </div>
    </button>
  );
}

function DrawTools() {
  const { t } = useT();
  const drawing = useAzimuth((s) => s.drawing);
  const setDrawing = useAzimuth((s) => s.setDrawing);
  const pts = useAzimuth((s) => s.drawnPoints);
  const dist = useAzimuth((s) => s.drawnDistanceM);
  const planToLast = useAzimuth((s) => s.planToLastPoint);
  const useDrawn = useAzimuth((s) => s.useDrawnRoute);
  const undo = useAzimuth((s) => s.undoDrawnPoint);
  const clear = useAzimuth((s) => s.clearDrawing);
  const planTo = useAzimuth((s) => s.planTo);
  const ready = useAzimuth((s) => s.dataReady);

  if (!drawing) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" className="btn primary block" disabled={!ready} onClick={() => planTo(DEMO_TARGET)}>
          {t('routeToDelta')}
        </button>
        <button type="button" className="btn ghost block" onClick={() => setDrawing(true)}>
          {t('drawRoute')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="kv">
        <span>{t('drawnPoints')}</span>
        <b>{pts.length}</b>
      </div>
      <div className="kv">
        <span>{t('totalDistance')}</span>
        <b className="a">{fmtDist(dist)}</b>
      </div>
      <div className="src" style={{ margin: '4px 0 6px' }}>
        {t('drawHint')}
      </div>
      <button type="button" className="btn primary block" disabled={!pts.length} onClick={planToLast}>
        {t('planToHere')}
      </button>
      <div className="flex gap-2">
        <button type="button" className="btn ghost flex-1" style={{ padding: '0 10px', fontSize: 11 }} disabled={!pts.length} onClick={useDrawn}>
          {t('useMyLine')}
        </button>
        <button type="button" className="btn icon" disabled={!pts.length} onClick={undo} aria-label={t('undo')} title={t('undo')}>
          ↶
        </button>
        <button
          type="button"
          className="btn icon"
          onClick={() => {
            clear();
            setDrawing(false);
          }}
          aria-label={t('cancel')}
          title={t('cancel')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Alvos científicos perto da rota (core.scienceAlongRoute) com botão de adicionar parada. */
function ScienceSection() {
  const { t, lang } = useT();
  const stops = useAzimuth((s) => s.scienceStops);
  const chosen = useAzimuth((s) => s.chosenStopIds);
  const highlighted = useAzimuth((s) => s.highlightedScience);
  const toggle = useAzimuth((s) => s.toggleScienceStop);
  const canStop = useAzimuth((s) => s.routeSource.kind === 'plan');
  const photos = useAzimuth((s) => s.mapData?.photos);
  const focusOn = useAzimuth((s) => s.focusOn);
  const anyTargets = useAzimuth((s) => (s.mapData?.scienceTargets?.length ?? 0) > 0);
  if (!anyTargets) return null;

  return (
    <>
      <h3 className="h3" style={{ marginTop: 20 }}>
        {t('science')}
      </h3>
      {!stops.length ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('scienceNone')}</div> : null}
      {stops.map((st) => {
        const tg = st.target;
        const on = chosen.includes(tg.id);
        const photo = tg.photoId ? photos?.find((p) => p.id === tg.photoId) ?? null : null;
        return (
          <div
            key={tg.id}
            className="flex gap-3 items-start"
            style={{
              padding: '10px 0',
              borderBottom: '1px solid #1A1A1A',
              outline: highlighted.includes(tg.id) ? '1px solid var(--accent)' : undefined,
              outlineOffset: 2,
            }}
          >
            {photo ? (
              <div style={{ width: 56, flexShrink: 0 }}>
                <PhotoFrame photo={photo} height={44} caption="" />
              </div>
            ) : (
              <div className={`sci ${on ? 'on' : ''}`} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden>
                ⚗
              </div>
            )}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => focusOn(tg, 14)}
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
              >
                {localized(tg.name, tg.nameEn, lang)}
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.35, marginTop: 2 }}>{localized(tg.task, tg.taskEn, lang)}</div>
              <div className="src" style={{ marginTop: 4 }}>
                {t('alongKm')} {fmtNum(st.alongM / 1000, 1)} · {t('detour')} {fmtDist(st.offsetM)} · {t('work')} {tg.workMin} min
              </div>
            </div>
            <button
              type="button"
              className={`mini ${on ? 'f' : ''}`}
              style={{ flexShrink: 0 }}
              disabled={!canStop}
              aria-pressed={on}
              onClick={() => toggle(tg.id)}
            >
              {on ? t('stopAdded') : t('addStop')}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function RoutePanel() {
  const { t, lang } = useT();
  const routes = useAzimuth((s) => s.routes);
  const activeId = useAzimuth((s) => s.activeRouteId);
  const routeAlerts = useAzimuth((s) => s.routeAlerts);
  const alerts = useAzimuth((s) => s.alerts);
  const selectRoute = useAzimuth((s) => s.selectRoute);
  const dossier = useAzimuth((s) => s.dossier);
  const pnr = useAzimuth((s) => s.pnr);
  const oxygen = useAzimuth((s) => s.oxygen);
  const photo = useAzimuth((s) => s.selectedPhoto);
  const startWalk = useAzimuth((s) => s.startWalk);
  const clearRoutes = useAzimuth((s) => s.clearRoutes);
  const tod = useAzimuth((s) => s.timeOfDay);
  const mapData = useAzimuth((s) => s.mapData);
  const [showProfile, setShowProfile] = useState(true);
  const active = routes.find((r) => r.id === activeId) ?? null;
  const destName = active ? nameNear(active, mapData?.landmarks ?? [], lang) : null;

  return (
    <Hud style={{ width: 380 }}>
      {!active ? (
        <>
          <h3 className="h3">{t('planRoute')}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 0 14px' }}>
            {t('planIntro1')} <span style={{ color: 'var(--text)' }}>{t('planIntroQuote')}</span>. {t('planIntro2')}
          </p>
          <DrawTools />
        </>
      ) : (
        <>
          <h3 className="h3">
            {routes.length > 1 ? t('routeOptions') : t('route')} · {t('base')} → {upper(destName ?? t('destination'))}
          </h3>
          <div className="flex gap-2">
            {routes.map((r) => (
              <OptionCard key={r.id} route={r} selected={r.id === activeId} alerts={routeAlerts[r.id]?.length ?? 0} onSelect={() => selectRoute(r.id)} />
            ))}
          </div>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary flex-1" onClick={startWalk}>
              {t('walk')}
            </button>
            <button type="button" className="btn" style={{ padding: '0 16px', fontSize: 11 }} onClick={clearRoutes}>
              {t('newRoute')}
            </button>
          </div>

          <div className="flex justify-between items-center" style={{ marginTop: 18 }}>
            <h3 className="h3" style={{ margin: 0 }}>
              {t('profile')}
            </h3>
            <button type="button" className="mini" onClick={() => setShowProfile(!showProfile)} aria-expanded={showProfile}>
              {showProfile ? t('profileHide') : t('profileShow')}
            </button>
          </div>
          {showProfile ? (
            <div style={{ marginTop: 8 }}>
              <ElevationProfile route={active} alerts={alerts} pnr={pnr} />
            </div>
          ) : null}

          <ScienceSection />

          <h3 className="h3" style={{ marginTop: 20 }}>
            {t('dossier')} · {tod === 'day' ? t('dayUp') : t('nightUp')}
          </h3>
          {dossier?.entries.length ? (
            dossier.entries.map((e) => (
              <div className="kv" key={e.key} title={e.source}>
                <span className="k">
                  {e.label} <span className="src">{shortSource(e.source)}{e.approximate ? ` · ${t('approx')}` : ''}</span>
                </span>
                <b className={e.key === 'minerals' ? 'a' : ''}>{e.value}</b>
              </div>
            ))
          ) : (
            <>
              <div className="kv">
                <span className="k">
                  {t('maxSlope')} <span className="src">MOLA</span>
                </span>
                <b>{fmtDeg(active.maxSlopeDeg)}</b>
              </div>
              <div className="kv">
                <span className="k">
                  {t('radiation')} <span className="src">RAD · EST.</span>
                </span>
                <b>
                  {fmtNum(environment.radiationMSvPerDay, 2)} {t('perDay')}
                </b>
              </div>
              <div className="kv">
                <span className="k">
                  {t('air')} <span className="src">MEDA</span>
                </span>
                <b>
                  {environment.airTempC} °C · {environment.pressurePa} Pa
                </b>
              </div>
            </>
          )}
          <div className="kv">
            <span>{t('o2RoundTrip')}</span>
            <b className={oxygen && !oxygen.ok ? 'r' : ''}>{oxygen ? fmtPct(oxygen.o2NeededRoundTripPct) : '—'}</b>
          </div>
          <div className="kv">
            <span>{t('pnr')}</span>
            <b className="a">{pnr ? `km ${fmtNum(pnr.distM / 1000, 1)}` : t('pnrNone')}</b>
          </div>

          <div className="flex gap-3" style={{ marginTop: 14 }}>
            <PhotoFrame photo={photo} height={84} className="shrink-0" caption={photo ? `${photo.camera} · SOL ${photo.sol}` : t('noPhoto')} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45 }}>
              {photo ? t('photoNear') : t('photoNone')}
              <span style={{ color: 'var(--text)' }}>{t('photoHint')}</span>
            </div>
          </div>
        </>
      )}
    </Hud>
  );
}

function nameNear(route: Route, landmarks: Landmark[], lang: 'en' | 'pt'): string | null {
  const end = route.points[route.points.length - 1];
  if (!end) return null;
  if (Math.abs(end.lat - DEMO_TARGET.lat) < 0.004 && Math.abs(end.lng - DEMO_TARGET.lng) < 0.004) return lang === 'en' ? 'Delta' : 'Delta';
  let best: string | null = null;
  let bestD = 0.01;
  for (const l of landmarks) {
    const d = Math.hypot(l.lat - end.lat, l.lng - end.lng);
    if (d < bestD) {
      bestD = d;
      best = localized(l.name, l.nameEn, lang);
    }
  }
  return best;
}

/** 'USGS Astrogeology Mars 2020 TRN CTX DTM 20 m (...)' → 'USGS Astrogeology' (fonte completa no title). */
function shortSource(src: string): string {
  const head = src.split(/[(;,·]/)[0].trim();
  const words = head.split(/\s+/).slice(0, 2).join(' ');
  return words.length > 22 ? words.slice(0, 22) + '…' : words;
}
