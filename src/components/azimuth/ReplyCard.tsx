'use client';
import { brand } from '@/config/brand';
import type { Route } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { askAzimuth } from '@/lib/azimuthClient';
import { upper } from '@/lib/format';
import { robotLabelPt } from './robots';

/** Cartão curto de resposta sobre o mapa, com botões de ação. Nunca tela cheia. */
export function ReplyCard() {
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
  const routes = useAzimuth((s) => s.routes);

  if (!card && !pending && !loading) return null;

  const shown = card?.actions.find((a) => a.type === 'showRoutes') as { routes: Route[]; selectId: string } | undefined;
  const hasRescue = card?.actions.some((a) => a.type === 'startRescue');
  const rescue = mode === 'rescue';

  return (
    <div className="reply fade-up" key={card?.id ?? 'pending'} role="status">
      <div className="flex justify-between items-center">
        <div className="who">
          {brand.assistantName}
          {card?.source === 'offline' ? <span className="src" style={{ marginLeft: 10 }}>PLANO B · OFFLINE</span> : null}
        </div>
        {card ? (
          <button type="button" className="src" style={{ background: 'none', border: 'none', padding: 6, fontSize: 12 }} onClick={dismiss} aria-label="Fechar resposta">
            ✕
          </button>
        ) : null}
      </div>
      <div className="txt">{loading && !card ? 'Calculando…' : card?.text ?? pending?.reason}</div>

      {pending ? (
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ color: 'var(--alert)' }}>
            CONFIRMAR · {upper(robotLabelPt(pending.role))} · CHEGA EM {pending.etaMin} MIN
          </div>
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 8 }}>
            <button type="button" className={`mini ${rescue ? 'rf' : 'f'}`} onClick={() => confirm(true)}>
              CHAMAR ROBÔ
            </button>
            <button type="button" className={`mini ${rescue ? 'r' : ''}`} onClick={() => confirm(false)}>
              AGORA NÃO
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
          {shown
            ? shown.routes
                .filter((r) => routes.some((x) => x.id === r.id))
                .slice(0, 1)
                .map((r) =>
                  r.id === activeId ? (
                    <button key={r.id} type="button" className="mini f" onClick={startWalk}>
                      CAMINHAR · {upper(r.label)}
                    </button>
                  ) : (
                    <button key={r.id} type="button" className="mini f" onClick={() => selectRoute(r.id)}>
                      ATIVAR {upper(r.label)}
                    </button>
                  ),
                )
            : null}
          {shown && shown.routes.length > 1 ? (
            <button type="button" className="mini" onClick={() => askAzimuth('Compare as rotas')}>
              COMPARAR
            </button>
          ) : null}
          {shown ? (
            <button type="button" className="mini" onClick={() => askAzimuth('Por que essa rota?')}>
              POR QUÊ?
            </button>
          ) : null}
          {hasRescue && rescue ? (
            <button type="button" className="mini rf" onClick={startReturn}>
              INICIAR VOLTA
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
