'use client';
import { useEffect, useState } from 'react';
import { useAzimuth, type RobotRole } from '@/state/store';
import { bearing, fmtDuration, fmtKm, fmtPct, upper } from '@/lib/format';
import { useT } from '@/lib/useT';
import type { I18nKey } from '@/lib/i18n';
import { Hud } from '@/components/ui/Hud';
import { AlertBox } from '@/components/ui/AlertBox';

export function ReturnPanel() {
  const { t } = useT();
  const plan = useAzimuth((s) => s.rescuePlan);
  const returning = useAzimuth((s) => s.returning);
  const arrived = useAzimuth((s) => s.arrived);
  const startReturn = useAzimuth((s) => s.startReturn);
  const exitRescue = useAzimuth((s) => s.exitRescue);

  if (!plan) {
    return (
      <Hud style={{ width: 400 }}>
        <div className="label" style={{ color: 'var(--alert)' }}>
          {t('returnRoute')}
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-dim)' }}>{t('computingReturn')}</div>
      </Hud>
    );
  }
  const dir = bearing(plan.from, plan.shelter);
  const pnrText = plan.pointOfNoReturn == null ? '—' : plan.passedPointOfNoReturn ? t('passed') : t('notPassed');

  return (
    <Hud style={{ width: 400 }} tour="rescue-panel">
      <div className="label" style={{ color: 'var(--alert)' }}>
        {t('returnRoute')}
      </div>
      <div className="f-display" style={{ fontSize: 30, letterSpacing: 4, marginTop: 10 }}>
        {upper(fmtKm(plan.returnRoute.distanceM))}
      </div>
      <div className="f-mono" style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 6 }}>
        ≈ {fmtDuration(plan.etaMin)} {t('toShelter')} · {t('heading')} {Math.round(dir.deg)}° {dir.cardinal}
      </div>
      <div className="kv" style={{ marginTop: 14 }}>
        <span>{t('o2Needed')}</span>
        <b>{fmtPct(plan.o2NeededPct)}</b>
      </div>
      <div className="kv">
        <span>{t('o2Available')}</span>
        <b className={plan.ok ? 'a' : 'r'}>{fmtPct(plan.o2AvailablePct)}</b>
      </div>
      <div className="kv">
        <span>{t('pnr')}</span>
        <b className={plan.passedPointOfNoReturn ? 'r' : ''}>{pnrText}</b>
      </div>
      <div className="kv">
        <span>{t('shelter')}</span>
        <b>{plan.shelter.name}</b>
      </div>
      {!plan.ok ? (
        <div style={{ marginTop: 12 }}>
          <AlertBox
            alert={{
              severity: 'critical',
              title: t('o2Short'),
              detail: t('o2ShortDetail', { need: fmtPct(plan.o2NeededPct), have: fmtPct(plan.o2AvailablePct) }),
              action: t('o2ShortAction'),
            }}
          />
        </div>
      ) : null}
      {arrived ? (
        <>
          <div className="f-display" style={{ marginTop: 14, fontSize: 13, letterSpacing: 3, color: 'var(--accent)' }}>
            {t('arrivedShelter')}
          </div>
          <button type="button" className="btn block" style={{ marginTop: 10 }} onClick={exitRescue}>
            {t('exitRescue')}
          </button>
        </>
      ) : (
        <button type="button" className="btn rescue block" style={{ marginTop: 14 }} onClick={startReturn} disabled={returning}>
          {returning ? t('returning') : t('startReturn')}
        </button>
      )}
    </Hud>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const ROBOTS: { role: RobotRole; key: I18nKey }[] = [
  { role: 'rescue', key: 'robotRescue' },
  { role: 'scout', key: 'robotScout' },
  { role: 'relay', key: 'robotRelay' },
];

/** Robôs de apoio (CONCEITO): animação simples, chamada sempre com confirmação. */
export function RobotsPanel() {
  const { t } = useT();
  const robot = useAzimuth((s) => s.robot);
  const plan = useAzimuth((s) => s.rescuePlan);
  const pending = useAzimuth((s) => s.pendingConfirm);
  const now = useNow(500);

  const request = (role: RobotRole) => {
    // ETA conceitual: robô ~4× mais rápido que a caminhada de volta (calculada pelo core)
    const eta = Math.max(2, Math.round((plan?.etaMin ?? 24) / 4));
    useAzimuth.setState({ pendingConfirm: { role, reason: t('robotManualReason'), etaMin: eta } });
  };

  return (
    <Hud title={t('robots')} style={{ width: 380 }} tour="robots">
      {ROBOTS.map((r, i) => {
        const active = robot?.role === r.role;
        const left = active ? Math.max(0, robot!.etaMin - (now - robot!.startedAt) / 2000) : null;
        const status = active ? (left! <= 0 ? t('arrivedUp') : t('enRoute')) : r.role === 'relay' ? t('idle') : t('ready');
        return (
          <div key={r.role} className="flex justify-between items-center gap-3" style={{ padding: '10px 0', borderBottom: i < ROBOTS.length - 1 ? '1px solid #2A1410' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t(r.key)}</div>
              <div className="label" style={{ marginTop: 3, color: active ? 'var(--alert)' : undefined }}>
                {status}
              </div>
            </div>
            {active ? (
              <div className="f-mono" style={{ fontSize: 20, color: 'var(--alert)' }}>
                {left! <= 0 ? 'ok' : `${Math.ceil(left!)} min`}
              </div>
            ) : r.role === 'relay' ? (
              <div className="f-mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                —
              </div>
            ) : (
              <button type="button" className="mini r" onClick={() => request(r.role)} disabled={!!pending}>
                {t('call')}
              </button>
            )}
          </div>
        );
      })}
      <div className="flex justify-between items-center" style={{ padding: '10px 0', borderTop: '1px solid #2A1410' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t('beacon')}</div>
          <div className="label" style={{ marginTop: 3 }}>
            {t('active')}
          </div>
        </div>
        <div className="f-mono" style={{ fontSize: 13 }}>
          {t('signalOk')}
        </div>
      </div>
      <div className="label" style={{ marginTop: 10, color: 'var(--text-faint)' }}>
        {t('robotsConcept')}
      </div>
    </Hud>
  );
}
