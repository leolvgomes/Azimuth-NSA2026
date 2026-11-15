'use client';
import { useMemo } from 'react';
import { core } from '@/core';
import type { RoverPhoto } from '@/core/types';
import { sampleGrid } from '@/data/loadMapData';
import { useAzimuth } from '@/state/store';
import { bearing, fmtDeg, fmtDist, fmtTemp } from '@/lib/format';
import { Hud } from '@/components/ui/Hud';
import { AlertBox } from '@/components/ui/AlertBox';
import { PhotoFrame } from '@/components/ui/PhotoFrame';

/** Painel "Pela frente" + botão Avançar (simula andar pela rota). */
export function AheadPanel() {
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const idx = useAzimuth((s) => s.progressIdx);
  const alerts = useAzimuth((s) => s.alerts);
  const pnr = useAzimuth((s) => s.pnr);
  const walking = useAzimuth((s) => s.walking);
  const advance = useAzimuth((s) => s.advance);
  const setMode = useAzimuth((s) => s.setMode);
  if (!route) return null;
  const pts = route.points;
  const here = pts[idx] ?? pts[0];
  const done = idx >= pts.length - 1;

  // direção dos próximos ~300 m
  let k = idx;
  while (k < pts.length - 1 && pts[k].distM - here.distM < 300) k++;
  const dir = k > idx ? bearing(here, pts[k]) : null;

  const items: { d: number; text: string; tone?: 'a' | 'r' }[] = [];
  if (dir && !done) items.push({ d: pts[k].distM - here.distM, text: `Siga rumo ${dir.cardinal} (${Math.round(dir.deg)}°) pela rota marcada`, tone: 'a' });
  const nextAlert = alerts.find((a) => a.toIdx >= idx);
  if (nextAlert) {
    const dA = Math.max(0, (pts[nextAlert.fromIdx]?.distM ?? here.distM) - here.distM);
    items.push({ d: dA, text: nextAlert.title, tone: 'r' });
  }
  if (pnr && pnr.distM > here.distM) items.push({ d: pnr.distM - here.distM, text: 'Ponto sem retorno · decida aqui' });
  items.push({ d: route.distanceM - here.distM, text: done ? 'Você chegou ao destino' : 'Destino da rota' });
  items.sort((a, b) => a.d - b.d);

  const imminent = alerts.find((a) => a.toIdx >= idx && (pts[a.fromIdx]?.distM ?? 0) - here.distM < 800);

  return (
    <Hud title="PELA FRENTE" style={{ width: 340 }}>
      {items.slice(0, 4).map((it, i) => (
        <div key={i} className="flex gap-3 items-center" style={{ padding: '10px 0', borderBottom: i < Math.min(items.length, 4) - 1 ? '1px solid #1A1A1A' : 'none' }}>
          <div className="f-mono shrink-0" style={{ fontSize: 20, width: 84, color: it.tone === 'a' ? 'var(--accent)' : it.tone === 'r' ? 'var(--alert)' : undefined }}>
            {fmtDist(it.d)}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.35 }}>{it.text}</div>
        </div>
      ))}
      {imminent ? (
        <div style={{ marginTop: 12 }}>
          <AlertBox alert={imminent} />
        </div>
      ) : null}
      <button type="button" className="btn primary block" style={{ marginTop: 14 }} onClick={advance} disabled={walking || done}>
        {done ? 'CHEGOU' : walking ? 'ANDANDO…' : 'AVANÇAR ▸'}
      </button>
      <button type="button" className="btn block" style={{ marginTop: 8, fontSize: 11 }} onClick={() => setMode('plan')}>
        VOLTAR AO PLANEJAMENTO
      </button>
    </Hud>
  );
}

/** Vista do rover: foto real mais próxima do próximo trecho + leitura do terreno. */
export function RoverViewPanel() {
  const route = useAzimuth((s) => s.routes.find((r) => r.id === s.activeRouteId) ?? null);
  const idx = useAzimuth((s) => s.progressIdx);
  const photo = useAzimuth((s) => s.selectedPhoto);
  const selectPhoto = useAzimuth((s) => s.selectPhoto);
  const data = useAzimuth((s) => s.mapData);
  const tod = useAzimuth((s) => s.timeOfDay);
  const position = useAzimuth((s) => s.position);

  const others = useMemo<RoverPhoto[]>(() => {
    if (!data?.photos.length) return [];
    return [...data.photos]
      .filter((p) => p.id !== photo?.id)
      .map((p) => ({ p, d: core.distanceM(position, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.p);
  }, [data, photo, position]);

  const pts = route?.points ?? [];
  const here = pts[idx];
  const ahead = pts.slice(idx, idx + 6);
  const slopeAhead = ahead.reduce<number | null>((m, p) => (p.slopeDeg == null ? m : Math.max(m ?? 0, p.slopeDeg)), null);
  const tempNow = here?.surfaceTempC ?? (data ? sampleGrid(tod === 'day' ? data.grids.tempDay : data.grids.tempNight, position.lat, position.lng) : null);
  const photoDist = photo ? core.distanceM(position, photo) : null;

  return (
    <Hud title="VISTA DO ROVER · PRÓXIMO TRECHO" style={{ width: 400 }}>
      <PhotoFrame
        photo={photo}
        height={230}
        tag={photo ? 'FOTO REAL · NASA/JPL-CALTECH' : undefined}
        caption={photo ? `PERSEVERANCE · ${photo.camera} · SOL ${photo.sol} · ${fmtDist(photoDist)}${photo.approximatePosition ? ' (POS. APROX.)' : ''}` : 'AGUARDANDO FOTOS DOS ROVERS'}
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
      {photo?.caption ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.4 }}>{photo.caption.split(' (')[0]}</div>
      ) : null}
      <div className="kv" style={{ marginTop: 10 }}>
        <span className="k">
          Temp. agora <span className="src">THEMIS {tod === 'day' ? 'DIA' : 'NOITE'} · APROX.</span>
        </span>
        <b>{fmtTemp(tempNow)}</b>
      </div>
      <div className="kv">
        <span className="k">
          Inclinação à frente <span className="src">MOLA</span>
        </span>
        <b>{fmtDeg(slopeAhead)}</b>
      </div>
    </Hud>
  );
}
