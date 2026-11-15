'use client';
import { useEffect, useState } from 'react';
import type { Alert } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { AlertBox } from '@/components/ui/AlertBox';

/** Alertas sempre visíveis sobre o mapa (sem abrir menu). */
export function AlertsStack() {
  const routes = useAzimuth((s) => s.routes);
  const activeId = useAzimuth((s) => s.activeRouteId);
  const alerts = useAzimuth((s) => s.alerts);
  const routeAlerts = useAzimuth((s) => s.routeAlerts);
  const mode = useAzimuth((s) => s.mode);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // tela baixa (< 820 px): todos os alertas compactos para não cobrir a rota
  const [short, setShort] = useState(false);
  useEffect(() => {
    const upd = () => setShort(window.innerHeight < 820);
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);
  const active = routes.find((r) => r.id === activeId);
  // na caminhada o painel 'Pela frente' mostra o alerta iminente e o mapa marca os trechos
  if (!active || mode === 'rescue' || mode === 'walk') return null;

  let list: { alert: Alert; prefix?: string }[];
  if (alerts.length) {
    list = alerts.map((a) => ({ alert: a, prefix: `${active.label} · trecho ${segmentNo(active.points.length, a.fromIdx)}` }));
  } else {
    // rota ativa limpa: mostra por que as alternativas são piores
    list = routes
      .filter((r) => r.id !== activeId)
      .flatMap((r) => (routeAlerts[r.id] ?? []).slice(0, 1).map((a) => ({ alert: a, prefix: `Rota ${r.label} · trecho ${segmentNo(r.points.length, a.fromIdx)}` })));
  }
  if (!list.length) return null;
  const shown = expanded ? list : list.slice(0, 2);

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex gap-2">
        <button type="button" className="mini rf" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          ! {list.length} {list.length === 1 ? 'ALERTA' : 'ALERTAS'} · {collapsed ? 'MOSTRAR' : 'OCULTAR'}
        </button>
        {!collapsed && list.length > 2 ? (
          <button type="button" className="mini r" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'MENOS' : `+${list.length - 2} ALERTAS`}
          </button>
        ) : null}
      </div>
      {collapsed
        ? null
        : shown.map(({ alert, prefix }, i) => (
            // só o primeiro com o detalhe: a pilha fica baixa e não cobre a rota
            <AlertBox key={`${prefix ?? ''}${alert.id}`} alert={alert} prefix={prefix} compact={i > 0 || expanded || short} />
          ))}
    </div>
  );
}

/** "Trecho N" em 6 trechos iguais da rota (só rótulo). */
function segmentNo(n: number, idx: number): number {
  if (n <= 1) return 1;
  return Math.min(6, Math.floor((idx / (n - 1)) * 6) + 1);
}
