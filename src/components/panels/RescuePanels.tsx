'use client';
import { useEffect, useState } from 'react';
import { useAzimuth, type RobotRole } from '@/state/store';
import { bearing, fmtDuration, fmtKm, fmtPct } from '@/lib/format';
import { Hud } from '@/components/ui/Hud';
import { AlertBox } from '@/components/ui/AlertBox';

export function ReturnPanel() {
  const plan = useAzimuth((s) => s.rescuePlan);
  const returning = useAzimuth((s) => s.returning);
  const arrived = useAzimuth((s) => s.arrived);
  const startReturn = useAzimuth((s) => s.startReturn);
  const exitRescue = useAzimuth((s) => s.exitRescue);

  if (!plan) {
    return (
      <Hud style={{ width: 400 }}>
        <div className="label" style={{ color: 'var(--alert)' }}>
          ROTA DE VOLTA
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-dim)' }}>Calculando a rota até o abrigo…</div>
      </Hud>
    );
  }
  const dir = bearing(plan.from, plan.shelter);
  const pnrText = plan.pointOfNoReturn == null ? '—' : plan.passedPointOfNoReturn ? 'ultrapassado' : 'não ultrapassado';

  return (
    <Hud style={{ width: 400 }}>
      <div className="label" style={{ color: 'var(--alert)' }}>
        ROTA DE VOLTA
      </div>
      <div className="f-display" style={{ fontSize: 30, letterSpacing: 4, marginTop: 10 }}>
        {fmtKm(plan.returnRoute.distanceM).toUpperCase()}
      </div>
      <div className="f-mono" style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 6 }}>
        ≈ {fmtDuration(plan.etaMin)} até o abrigo · rumo {Math.round(dir.deg)}° {dir.cardinal}
      </div>
      <div className="kv" style={{ marginTop: 14 }}>
        <span>O₂ necessário (com margem)</span>
        <b>{fmtPct(plan.o2NeededPct)}</b>
      </div>
      <div className="kv">
        <span>O₂ disponível</span>
        <b className={plan.ok ? 'a' : 'r'}>{fmtPct(plan.o2AvailablePct)}</b>
      </div>
      <div className="kv">
        <span>Ponto sem retorno</span>
        <b className={plan.passedPointOfNoReturn ? 'r' : ''}>{pnrText}</b>
      </div>
      <div className="kv">
        <span>Abrigo</span>
        <b>{plan.shelter.name}</b>
      </div>
      {!plan.ok ? (
        <div style={{ marginTop: 12 }}>
          <AlertBox
            alert={{
              severity: 'critical',
              title: 'O₂ curto para a volta',
              detail: `Precisa de ${fmtPct(plan.o2NeededPct)} e tem ${fmtPct(plan.o2AvailablePct)}.`,
              action: 'Chame o robô de resgate agora e siga a rota de volta.',
            }}
          />
        </div>
      ) : null}
      {arrived ? (
        <>
          <div className="f-display" style={{ marginTop: 14, fontSize: 13, letterSpacing: 3, color: 'var(--accent)' }}>
            VOCÊ CHEGOU AO ABRIGO
          </div>
          <button type="button" className="btn block" style={{ marginTop: 10 }} onClick={exitRescue}>
            SAIR DO RESGATE
          </button>
        </>
      ) : (
        <button type="button" className="btn rescue block" style={{ marginTop: 14 }} onClick={startReturn} disabled={returning}>
          {returning ? 'VOLTANDO…' : 'INICIAR VOLTA'}
        </button>
      )}
    </Hud>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const ROBOTS: { role: RobotRole; name: string }[] = [
  { role: 'rescue', name: 'Transporte de resgate' },
  { role: 'scout', name: 'Batedor' },
  { role: 'relay', name: 'Relé de comunicação' },
];

/** Robôs de apoio (CONCEITO): animação simples, chamada sempre com confirmação. */
export function RobotsPanel() {
  const robot = useAzimuth((s) => s.robot);
  const plan = useAzimuth((s) => s.rescuePlan);
  const pending = useAzimuth((s) => s.pendingConfirm);
  const now = useNow(500);

  const request = (role: RobotRole) => {
    // ETA conceitual: robô ~4× mais rápido que a caminhada de volta (calculada pelo core)
    const eta = Math.max(2, Math.round((plan?.etaMin ?? 24) / 4));
    useAzimuth.setState({ pendingConfirm: { role, reason: 'Pedido no painel de resgate', etaMin: eta } });
  };

  return (
    <Hud title="APOIO · ROBÔS" style={{ width: 380 }}>
      {ROBOTS.map((r, i) => {
        const active = robot?.role === r.role;
        const left = active ? Math.max(0, robot!.etaMin - (now - robot!.startedAt) / 2000) : null;
        const status = active ? (left! <= 0 ? 'CHEGOU' : 'EM ROTA') : r.role === 'relay' ? 'PARADO' : 'PRONTO';
        return (
          <div key={r.role} className="flex justify-between items-center gap-3" style={{ padding: '10px 0', borderBottom: i < ROBOTS.length - 1 ? '1px solid #2A1410' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
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
                CHAMAR
              </button>
            )}
          </div>
        );
      })}
      <div className="flex justify-between items-center" style={{ padding: '10px 0', borderTop: '1px solid #2A1410' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Farol · abrigo</div>
          <div className="label" style={{ marginTop: 3 }}>
            ATIVO
          </div>
        </div>
        <div className="f-mono" style={{ fontSize: 13 }}>
          sinal ok
        </div>
      </div>
      <div className="label" style={{ marginTop: 10, color: 'var(--text-faint)' }}>
        CONCEITO · ANIMAÇÃO NO DEMO · CONFIRMAÇÃO OBRIGATÓRIA
      </div>
    </Hud>
  );
}
