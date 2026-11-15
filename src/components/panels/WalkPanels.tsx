'use client';
import { useMemo, useState } from 'react';
import { walkSim } from '@/config/suit';
import { localized } from '@/config/i18n';
import { core } from '@/core';
import type { RoverPhoto } from '@/core/types';
import { sampleGrid } from '@/data/loadMapData';
import { useAzimuth } from '@/state/store';
import { bearing, fmtClock, fmtDeg, fmtDist, fmtTemp } from '@/lib/format';
import { useT } from '@/lib/useT';
import { Hud } from '@/components/ui/Hud';
import { AlertBox } from '@/components/ui/AlertBox';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { ElevationProfile } from './ElevationProfile';

/** Relógio da missão + play/pause + velocidade (1/4/16×). */
function SimControls() {
  const { t } = useT();
  const sim = useAzimuth((s) => s.sim);
  const setRunning = useAzimuth((s) => s.setSimRunning);
  const setSpeed = useAzimuth((s) => s.setSimSpeed);
  const advance = useAzimuth((s) => s.advance);
  const walking = useAzimuth((s) => s.walking);
  return (
    <div style={{ marginTop: 12 }} data-tour="walk-controls">
      <div className="flex justify-between items-baseline">
        <span className="label">{t('missionClock')}</span>
        <span className="f-mono" style={{ fontSize: 20, color: sim.running ? 'var(--accent)' : undefined }}>
          {fmtClock(sim.elapsedMin)}
        </span>
      </div>
      {sim.atStop ? (
        <div className="label" style={{ color: 'var(--accent)', marginTop: 4 }}>
          ⚗ {t('working')}
        </div>
      ) : null}
      <div className="flex gap-2" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary flex-1" style={{ padding: '0 10px' }} disabled={sim.done || walking} onClick={() => setRunning(!sim.running)}>
          {sim.done ? t('arrived') : sim.running ? t('pause') : t('play')}
        </button>
        <button type="button" className="btn" style={{ padding: '0 12px', fontSize: 11 }} disabled={sim.running || sim.done || walking} onClick={advance}>
          {walking ? t('walking') : t('advance')}
        </button>
      </div>
      <div className="seg" role="group" aria-label={t('speed')} style={{ marginTop: 8 }}>
        {walkSim.speedOptions.map((x) => (
          <button key={x} type="button" className={sim.speed === x ? 'on' : ''} aria-pressed={sim.speed === x} onClick={() => setSpeed(x)}>
            {x}×
          </button>
        ))}
      </div>
    </div>
  );
}

/** Painel "Ahead / Pela frente" + simulação de caminhada + perfil com a posição. */
export function AheadPanel() {
  const { t, lang } = useT();
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const idx = useAzimuth((s) => s.progressIdx);
  const hereDist = useAzimuth((s) => s.sim.distM);
  const alerts = useAzimuth((s) => s.alerts);
  const pnr = useAzimuth((s) => s.pnr);
  const pnrPrompt = useAzimuth((s) => s.pnrPrompt);
  const setMode = useAzimuth((s) => s.setMode);
  const enterRescue = useAzimuth((s) => s.enterRescue);
  const targets = useAzimuth((s) => s.mapData?.scienceTargets);
  // perfil fechado por padrão na caminhada: o painel cabe sem rolar em 1280–1536 px
  const [showProfile, setShowProfile] = useState(false);
  if (!route) return null;
  const pts = route.points;
  const here = pts[idx] ?? pts[0];
  const done = hereDist >= route.distanceM - 1;

  // direção dos próximos ~300 m
  let k = idx;
  while (k < pts.length - 1 && pts[k].distM - hereDist < 300) k++;
  const dir = k > idx ? bearing(here, pts[k]) : null;

  const items: { d: number; text: string; tone?: 'a' | 'r' }[] = [];
  if (dir && !done) items.push({ d: pts[k].distM - hereDist, text: `${t('headTo')} ${dir.cardinal} (${Math.round(dir.deg)}°) ${t('alongRoute')}`, tone: 'a' });
  const nextAlert = alerts.find((a) => (pts[a.toIdx]?.distM ?? 0) >= hereDist);
  if (nextAlert) items.push({ d: Math.max(0, (pts[nextAlert.fromIdx]?.distM ?? hereDist) - hereDist), text: nextAlert.title, tone: 'r' });
  for (const st of route.stops ?? []) {
    const d = (pts[st.index]?.distM ?? 0) - hereDist;
    if (d < 0) continue;
    const tg = targets?.find((x) => x.id === st.targetId);
    items.push({ d, text: `⚗ ${tg ? localized(tg.name, tg.nameEn, lang) : t('scienceStop')} · ${st.workMin} min`, tone: 'a' });
    break;
  }
  if (pnr && pnr.distM > hereDist) items.push({ d: pnr.distM - hereDist, text: t('pnrDecide') });
  items.push({ d: Math.max(0, route.distanceM - hereDist), text: done ? t('arrivedDest') : t('routeDest') });
  items.sort((a, b) => a.d - b.d);

  const imminent = alerts.find((a) => (pts[a.toIdx]?.distM ?? 0) >= hereDist && (pts[a.fromIdx]?.distM ?? 0) - hereDist < 800);

  return (
    <Hud title={t('ahead')} style={{ width: 340 }}>
      {pnrPrompt ? (
        <div style={{ marginBottom: 10 }}>
          <AlertBox
            alert={{
              severity: 'critical',
              title: pnrPrompt === 'ahead' ? t('pnrAheadTitle') : t('pnrPassedTitle'),
              detail: '',
              action: pnrPrompt === 'ahead' ? `${t('turnBack')} / ${t('continue')}` : t('goRescue'),
            }}
          />
          {pnrPrompt === 'passed' ? (
            <button type="button" className="btn rescue block" style={{ marginTop: 8 }} onClick={enterRescue}>
              {t('goRescue')}
            </button>
          ) : null}
        </div>
      ) : null}
      {items.slice(0, 3).map((it, i) => (
        <div key={i} className="flex gap-3 items-center" style={{ padding: '8px 0', borderBottom: i < Math.min(items.length, 3) - 1 ? '1px solid #1A1A1A' : 'none' }}>
          <div className="f-mono shrink-0" style={{ fontSize: 18, width: 78, color: it.tone === 'a' ? 'var(--accent)' : it.tone === 'r' ? 'var(--alert)' : undefined }}>
            {fmtDist(it.d)}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.35 }}>{it.text}</div>
        </div>
      ))}
      {imminent && !pnrPrompt ? (
        <div style={{ marginTop: 10 }}>
          <AlertBox alert={imminent} compact />
        </div>
      ) : null}
      <SimControls />
      <div className="flex justify-between items-center" style={{ marginTop: 12 }}>
        <span className="label">{t('profile')}</span>
        <button type="button" className="mini" onClick={() => setShowProfile(!showProfile)} aria-expanded={showProfile}>
          {showProfile ? t('profileHide') : t('profileShow')}
        </button>
      </div>
      {showProfile ? (
        <div style={{ marginTop: 8 }}>
          <ElevationProfile route={route} alerts={alerts} pnr={pnr} currentDistM={hereDist} />
        </div>
      ) : null}
      <button type="button" className="btn block" style={{ marginTop: 8, fontSize: 11 }} onClick={() => setMode('plan')}>
        {t('backToPlan')}
      </button>
    </Hud>
  );
}

/** Vista do rover: foto real mais próxima do próximo trecho + leitura do terreno. */
export function RoverViewPanel() {
  const { t, lang } = useT();
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const idx = useAzimuth((s) => s.progressIdx);
  const photo = useAzimuth((s) => s.selectedPhoto);
  const selectPhoto = useAzimuth((s) => s.selectPhoto);
  const data = useAzimuth((s) => s.mapData);
  const tod = useAzimuth((s) => s.timeOfDay);
  const position = useAzimuth((s) => s.position);

  // fotos vizinhas: recalcula só quando muda de ponto da rota (não a cada quadro da simulação)
  const others = useMemo<RoverPhoto[]>(() => {
    if (!data?.photos.length) return [];
    const at = route?.points[idx] ?? position;
    return [...data.photos]
      .filter((p) => p.id !== photo?.id)
      .map((p) => ({ p, d: core.distanceM(at, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, photo, idx, route]);

  const pts = route?.points ?? [];
  const here = pts[idx];
  const ahead = pts.slice(idx, idx + 6);
  const slopeAhead = ahead.reduce<number | null>((m, p) => (p.slopeDeg == null ? m : Math.max(m ?? 0, p.slopeDeg)), null);
  const tempNow = here?.surfaceTempC ?? (data ? sampleGrid(tod === 'day' ? data.grids.tempDay : data.grids.tempNight, position.lat, position.lng) : null);
  const photoDist = photo ? core.distanceM(position, photo) : null;
  const caption = photo ? localized(photo.caption, photo.captionEn, lang).split(' (')[0] : '';

  return (
    <Hud title={t('roverView')} style={{ width: 400 }}>
      <PhotoFrame
        photo={photo}
        height={230}
        tag={photo ? t('realPhoto') : undefined}
        caption={
          photo
            ? `PERSEVERANCE · ${photo.camera} · SOL ${photo.sol} · ${fmtDist(photoDist)}${photo.approximatePosition ? ` ${t('posApprox')}` : ''}`
            : t('waitingPhotos')
        }
      />
      {others.length ? (
        <div className="flex gap-2" style={{ marginTop: 10 }}>
          {others.map((p) => (
            <div key={p.id} className="flex-1">
              <PhotoFrame photo={p} height={64} caption={`SOL ${p.sol}`} onClick={() => selectPhoto(p, true)} />
            </div>
          ))}
        </div>
      ) : null}
      {caption ? <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.4 }}>{caption}</div> : null}
      <div className="kv" style={{ marginTop: 10 }}>
        <span className="k">
          {t('tempNow')}{' '}
          <span className="src">
            THEMIS {tod === 'day' ? t('dayUp') : t('nightUp')} · {t('approx')}
          </span>
        </span>
        <b>{fmtTemp(tempNow)}</b>
      </div>
      <div className="kv">
        <span className="k">
          {t('slopeAhead')} <span className="src">MOLA</span>
        </span>
        <b>{fmtDeg(slopeAhead)}</b>
      </div>
    </Hud>
  );
}
