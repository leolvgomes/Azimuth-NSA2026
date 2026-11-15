import type { Alert } from '@/core/types';
import { upper } from '@/lib/format';

/** Alerta que sempre diz o que fazer (design system: ALERT). */
export function AlertBox({ alert, prefix, compact = false }: { alert: Pick<Alert, 'title' | 'detail' | 'action' | 'severity'>; prefix?: string; compact?: boolean }) {
  return (
    <div className={`alertbox fade-up ${alert.severity === 'warning' ? 'warn' : ''}`} role="alert">
      <div className="ic">!</div>
      <div className="min-w-0">
        <div className="t">{upper(prefix ?? alert.title)}</div>
        {compact ? (prefix ? <div className="d">{alert.title}</div> : null) : alert.detail ? <div className="d">{alert.detail}</div> : null}
        {alert.action ? <div className="act">→ {alert.action}</div> : null}
      </div>
    </div>
  );
}
