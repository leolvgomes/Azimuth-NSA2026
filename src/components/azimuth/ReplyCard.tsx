'use client';
import { brand } from '@/config/brand';
import type { Route } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { askAzimuth } from '@/lib/azimuthClient';
import { upper } from '@/lib/format';
import { useT } from '@/lib/useT';
import { robotLabel } from './robots';
import { thinkingKey } from '@/lib/thinking';

/** Cartão curto de resposta sobre o mapa, com botões de ação. Nunca tela cheia. */
export function ReplyCard() {
  const { t, lang } = useT();
  const card = useAzimuth((s) => s.chat.card);
  const loading = useAzimuth((s) => s.chat.loading);
  const pending = useAzimuth((s) => s.pendingConfirm);
  const activeId = useAzimuth((s) => s.activeRouteId);
  const mode = useAzimuth((s) => s.mode);
  const dismiss = useAzimuth((s) => s.dismissCard);
  const confirm = useAzimuth((s) => s.confirmRover);
  const selectRoute = useAzimuth((s) => s.selectRoute);
  const startWalk = useAzimuth((s) => s.startWalk);
  const startReturn = useAzimuth((s) => s.startReturn);
  const enterRescue = useAzimuth((s) => s.enterRescue);
  const ackPnr = useAzimuth((s) => s.ackPnr);
  const routes = useAzimuth((s) => s.routes);
  const lastQuestion = useAzimuth((s) => [...s.chat.messages].reverse().find((m) => m.role === 'user')?.text);

  if (!card && !pending && !loading) return null;

  const shownAction = card?.actions.find((a) => a.type === 'showRoutes' || a.type === 'addScienceStops') as { routes: Route[]; selectId: string } | undefined;
  const hasRescue = card?.actions.some((a) => a.type === 'startRescue');
  const rescue = mode === 'rescue';
  const proactive = card?.kind;
  const alertish = rescue || !!proactive;

  return (
    <div className="reply fade-up" key={card?.id ?? 'pending'} role="status" style={alertish ? { borderTopColor: 'var(--alert)' } : undefined}>
      <div className="flex justify-between items-center">
        <div className="who" style={alertish ? { color: 'var(--alert)' } : undefined}>
          {brand.assistantName}
          {proactive ? (
            <span className="src" style={{ marginLeft: 10, color: 'var(--alert)' }}>
              {proactive === 'pnr-ahead' ? t('pnrAheadTitle') : t('pnrPassedTitle')}
            </span>
          ) : card?.source === 'offline' ? (
            <span className="src" style={{ marginLeft: 10 }}>
              {t('offlineSrc')}
            </span>
          ) : null}
        </div>
        {card ? (
          <button type="button" className="src" style={{ background: 'none', border: 'none', padding: 6, fontSize: 12 }} onClick={dismiss} aria-label={t('close')}>
            ✕
          </button>
        ) : null}
      </div>
      <div className="txt">
        {loading && !card ? (
          <span className="flex items-center gap-3">
            <span className="tour-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            {t(thinkingKey(lastQuestion))}
          </span>
        ) : (
          card?.text ?? pending?.reason
        )}
      </div>

      {pending ? (
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ color: 'var(--alert)' }}>
            {t('confirm')} · {upper(robotLabel(pending.role, lang))} · {t('arrivesIn')} {pending.etaMin} MIN
          </div>
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 8 }}>
            <button type="button" className={`mini ${rescue ? 'rf' : 'f'}`} onClick={() => confirm(true)}>
              {t('callRobot')}
            </button>
            <button type="button" className={`mini ${rescue ? 'r' : ''}`} onClick={() => confirm(false)}>
              {t('notNow')}
            </button>
          </div>
        </div>
      ) : proactive === 'pnr-ahead' ? (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
          <button type="button" className="mini rf" onClick={enterRescue}>
            {t('turnBack')}
          </button>
          <button type="button" className="mini r" onClick={ackPnr}>
            {t('continue')}
          </button>
        </div>
      ) : proactive === 'pnr-passed' ? (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
          <button type="button" className="mini rf" onClick={enterRescue}>
            {t('goRescue')}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
          {shownAction
            ? shownAction.routes
                .filter((r) => routes.some((x) => x.id === r.id))
                .slice(0, 1)
                .map((r) =>
                  r.id === activeId ? (
                    <button key={r.id} type="button" className="mini f" onClick={startWalk}>
                      {t('walkRoute')} · {upper(r.label)}
                    </button>
                  ) : (
                    <button key={r.id} type="button" className="mini f" onClick={() => selectRoute(r.id)}>
                      {t('activate')} {upper(r.label)}
                    </button>
                  ),
                )
            : null}
          {shownAction && shownAction.routes.length > 1 ? (
            <button type="button" className="mini" onClick={() => askAzimuth(t('askCompare'))}>
              {t('compare')}
            </button>
          ) : null}
          {shownAction ? (
            <button type="button" className="mini" onClick={() => askAzimuth(t('askWhy'))}>
              {t('why')}
            </button>
          ) : null}
          {hasRescue && rescue ? (
            <button type="button" className="mini rf" onClick={startReturn}>
              {t('startReturn')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
