'use client';
import { useEffect, useState } from 'react';
import { brand } from '@/config/brand';
import { useAzimuth, type Mode } from '@/state/store';
import { fmtLatLng, upper } from '@/lib/format';
import { Logo } from '@/components/ui/Logo';

const TABS: { mode: Exclude<Mode, 'intro'>; label: string }[] = [
  { mode: 'plan', label: '01 PLANEJAR' },
  { mode: 'walk', label: '02 CAMINHAR' },
  { mode: 'rescue', label: '03 RESGATE' },
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
  const mode = useAzimuth((s) => s.mode);
  const setMode = useAzimuth((s) => s.setMode);
  const enterRescue = useAzimuth((s) => s.enterRescue);
  const exitRescue = useAzimuth((s) => s.exitRescue);
  const cursor = useAzimuth((s) => s.cursor);
  const zoom = useAzimuth((s) => s.zoom);
  const position = useAzimuth((s) => s.position);
  const rescueStartedAt = useAzimuth((s) => s.rescueStartedAt);
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const progressIdx = useAzimuth((s) => s.progressIdx);

  const rescue = mode === 'rescue';
  const progressPct = route && route.distanceM > 0 ? Math.round(((route.points[progressIdx]?.distM ?? 0) / route.distanceM) * 100) : 0;

  return (
    <header className="topbar">
      <div className="flex items-center gap-4 min-w-0">
        <Logo alert={rescue} />
        <div className="min-w-0">
          <div className="f-display truncate" style={{ fontSize: 20, letterSpacing: 8, color: rescue ? 'var(--alert)' : undefined }}>
            {rescue ? 'MODO RESGATE' : brand.name}
          </div>
          <div className="f-mono" style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 4 }}>
            {rescue ? (
              <>
                ATIVADO HÁ <Elapsed since={rescueStartedAt} />
              </>
            ) : mode === 'walk' ? (
              'JEZERO · EM ROTA'
            ) : (
              'JEZERO · PLANEJAMENTO'
            )}
          </div>
        </div>
      </div>

      <nav className="flex" aria-label="Etapas">
        {TABS.map((t) => (
          <button
            key={t.mode}
            type="button"
            className={`crumb ${mode === t.mode ? 'on' : ''}`}
            aria-current={mode === t.mode ? 'page' : undefined}
            disabled={t.mode === 'walk' && !route}
            title={t.mode === 'walk' && !route ? 'Escolha uma rota primeiro' : undefined}
            onClick={() => setMode(t.mode)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-5">
        {!rescue ? (
          <div className="text-right hidden lg:block" style={{ minWidth: 210 }}>
            <div className="f-mono" style={{ fontSize: 13, letterSpacing: 1 }}>
              {fmtLatLng(mode === 'walk' ? position : cursor ?? position)}
            </div>
            <div className="label" style={{ marginTop: 4 }}>
              {mode === 'walk' && route ? `${upper(route.label)} · ${progressPct}%` : `${cursor ? 'CURSOR' : 'POSIÇÃO'} · ZOOM ${zoom}`}
            </div>
          </div>
        ) : null}
        {rescue ? (
          <button type="button" className="btn" onClick={exitRescue}>
            SAIR DO RESGATE
          </button>
        ) : (
          <button type="button" className="btn rescue" onClick={enterRescue} aria-label="Ativar modo resgate">
            ⟲ RESGATE
          </button>
        )}
      </div>
    </header>
  );
}
