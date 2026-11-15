'use client';
/**
 * Perfil de elevação da rota ativa (SVG puro): elevação × distância, cor pela inclinação,
 * trechos com alerta em salmão, paradas científicas e ponto sem retorno marcados.
 * Hover mostra km / elevação / inclinação e destaca o ponto no mapa (store.hoverIdx).
 */
import { useMemo, type MouseEvent } from 'react';
import { brand } from '@/config/brand';
import { suitConfig } from '@/config/suit';
import type { Alert, PointOfNoReturn, Route } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { fmtDeg, fmtNum } from '@/lib/format';
import { useT } from '@/lib/useT';

const W = 340;
const H = 132;
const PAD = { l: 44, r: 8, t: 18, b: 18 };
const C = brand.colors;

function slopeColor(deg: number | undefined): string {
  if (deg == null) return C.accent;
  if (deg >= suitConfig.slopeMaxDeg) return C.alert;
  if (deg >= suitConfig.slopeWarnDeg) return C.alertText;
  return C.accent;
}

function nearestIdx(route: Route, distM: number): number {
  const pts = route.points;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distM < distM) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(pts[lo - 1].distM - distM) < Math.abs(pts[lo].distM - distM)) return lo - 1;
  return lo;
}

export function ElevationProfile({ route, alerts, pnr, currentDistM }: { route: Route; alerts: Alert[]; pnr: PointOfNoReturn | null; currentDistM?: number }) {
  const { t } = useT();
  const hoverIdx = useAzimuth((s) => s.hoverIdx);
  const setHoverIdx = useAzimuth((s) => s.setHoverIdx);

  const geo = useMemo(() => {
    const pts = route.points.filter((p) => p.elevM != null && Number.isFinite(p.elevM));
    if (pts.length < 2 || route.distanceM <= 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const p of pts) {
      min = Math.min(min, p.elevM!);
      max = Math.max(max, p.elevM!);
    }
    if (max - min < 10) {
      const mid = (max + min) / 2;
      min = mid - 5;
      max = mid + 5;
    }
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (d: number) => PAD.l + (d / route.distanceM) * iw;
    const y = (e: number) => PAD.t + (1 - (e - min) / (max - min)) * ih;
    // até ~160 segmentos coloridos pela inclinação
    const step = Math.max(1, Math.floor(pts.length / 160));
    const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    const segs = sampled.slice(1).map((p, i) => {
      const a = sampled[i];
      return { x1: x(a.distM), y1: y(a.elevM!), x2: x(p.distM), y2: y(p.elevM!), color: slopeColor(p.slopeDeg) };
    });
    const area = `M ${x(sampled[0].distM)} ${PAD.t + ih} ` + sampled.map((p) => `L ${x(p.distM)} ${y(p.elevM!)}`).join(' ') + ` L ${x(sampled[sampled.length - 1].distM)} ${PAD.t + ih} Z`;
    return { min, max, x, y, segs, area, ih };
  }, [route]);

  if (!geo) {
    return <div className="src" style={{ padding: '8px 0' }}>{t('profileNoData')}</div>;
  }
  const { x, y, segs, area, min, max, ih } = geo;
  const pts = route.points;
  const hover = hoverIdx != null ? pts[hoverIdx] : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const d = ((px - PAD.l) / (W - PAD.l - PAD.r)) * route.distanceM;
    setHoverIdx(nearestIdx(route, Math.max(0, Math.min(route.distanceM, d))));
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={t('profile')}
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* grade */}
        <line x1={PAD.l} y1={PAD.t} x2={W - PAD.r} y2={PAD.t} stroke={C.line} />
        <line x1={PAD.l} y1={PAD.t + ih} x2={W - PAD.r} y2={PAD.t + ih} stroke={C.line} />
        <text x={PAD.l - 4} y={PAD.t + 4} textAnchor="end" fontSize={9} fill={C.textDim} fontFamily="monospace">
          {fmtNum(max)} m
        </text>
        <text x={PAD.l - 4} y={PAD.t + ih} textAnchor="end" fontSize={9} fill={C.textDim} fontFamily="monospace">
          {fmtNum(min)} m
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize={9} fill={C.textDim} fontFamily="monospace">
          {fmtNum(route.distanceM / 1000, 1)} km
        </text>
        <text x={PAD.l} y={H - 4} fontSize={9} fill={C.textDim} fontFamily="monospace">
          0
        </text>

        {/* trechos com alerta */}
        {alerts.map((a) => {
          const d1 = pts[Math.max(0, Math.min(a.fromIdx, pts.length - 1))]?.distM ?? 0;
          const d2 = pts[Math.max(0, Math.min(a.toIdx, pts.length - 1))]?.distM ?? d1;
          const x1 = x(d1);
          const w = Math.max(3, x(d2) - x1);
          return <rect key={a.id} x={x1} y={PAD.t} width={w} height={ih} fill={C.alert} opacity={0.16} />;
        })}

        <path d={area} fill={C.accent} opacity={0.07} />
        {segs.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={2} strokeLinecap="round" />
        ))}

        {/* paradas científicas */}
        {(route.stops ?? []).map((st, i) => {
          const p = pts[st.index];
          if (!p) return null;
          const name = st.targetId ? '⚗' : '◆';
          return (
            <g key={i}>
              <line x1={x(p.distM)} y1={PAD.t} x2={x(p.distM)} y2={PAD.t + ih} stroke={C.accent} strokeDasharray="2 3" />
              <text x={x(p.distM)} y={PAD.t - 5} textAnchor="middle" fontSize={10} fill={C.accent}>
                {name}
              </text>
            </g>
          );
        })}

        {/* ponto sem retorno */}
        {pnr ? (
          <g>
            <line x1={x(pnr.distM)} y1={PAD.t} x2={x(pnr.distM)} y2={PAD.t + ih} stroke={C.text} strokeDasharray="4 3" />
            <text x={x(pnr.distM)} y={PAD.t - 5} textAnchor="middle" fontSize={8} fill={C.text} fontFamily="monospace">
              PNR
            </text>
          </g>
        ) : null}

        {/* posição atual (caminhada) */}
        {currentDistM != null ? (
          <g>
            <line x1={x(currentDistM)} y1={PAD.t} x2={x(currentDistM)} y2={PAD.t + ih} stroke={C.accent} strokeWidth={2} />
            <text x={x(currentDistM) + 3} y={PAD.t + ih - 4} fontSize={8} fill={C.accent} fontFamily="monospace">
              {t('you')}
            </text>
          </g>
        ) : null}

        {/* hover */}
        {hover && hover.elevM != null ? (
          <g pointerEvents="none">
            <line x1={x(hover.distM)} y1={PAD.t} x2={x(hover.distM)} y2={PAD.t + ih} stroke={C.text} opacity={0.6} />
            <circle cx={x(hover.distM)} cy={y(hover.elevM)} r={4} fill={C.text} stroke={C.bg} strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      <div className="f-mono" style={{ fontSize: 10, color: hover ? 'var(--text)' : 'var(--text-faint)', minHeight: 14, letterSpacing: 1 }}>
        {hover
          ? `km ${fmtNum(hover.distM / 1000, 2)} · ${t('elev')} ${hover.elevM != null ? `${fmtNum(hover.elevM)} m` : '—'} · ${t('slope')} ${fmtDeg(hover.slopeDeg)}`
          : `MOLA / CTX DTM · ${t('slope')} < ${suitConfig.slopeWarnDeg}° / ≥ ${suitConfig.slopeWarnDeg}° / ≥ ${suitConfig.slopeMaxDeg}°`}
      </div>
    </div>
  );
}
