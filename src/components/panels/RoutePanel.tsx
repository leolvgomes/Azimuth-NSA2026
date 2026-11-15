'use client';
import { DEMO_TARGET } from '@/config/mission';
import { environment } from '@/config/suit';
import type { Route } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { fmtDeg, fmtDist, fmtDuration, fmtKm, fmtPct, upper } from '@/lib/format';
import { Hud } from '@/components/ui/Hud';
import { PhotoFrame } from '@/components/ui/PhotoFrame';

const SHORT: Record<string, string> = { safest: 'SEGURA', balanced: 'EQUILIB.', fastest: 'RÁPIDA', manual: 'DESENHADA', return: 'VOLTA' };

function OptionCard({ route, selected, alerts, onSelect }: { route: Route; selected: boolean; alerts: number; onSelect: () => void }) {
  return (
    <button type="button" className={`opt ${selected ? 'sel' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <div className="nm">{SHORT[route.profile] ?? upper(route.label)}</div>
      <div className="big">{fmtKm(route.distanceM)}</div>
      <div className="sm">
        {fmtDuration(route.durationMin).replace(' ', '')} · O₂ {fmtPct(route.o2RemainingPct)}
      </div>
      <div className={`sm ${alerts ? 'r' : ''}`}>
        {alerts} {alerts === 1 ? 'alerta' : 'alertas'}
      </div>
    </button>
  );
}

function DrawTools() {
  const drawing = useAzimuth((s) => s.drawing);
  const setDrawing = useAzimuth((s) => s.setDrawing);
  const pts = useAzimuth((s) => s.drawnPoints);
  const dist = useAzimuth((s) => s.drawnDistanceM);
  const planToLast = useAzimuth((s) => s.planToLastPoint);
  const useDrawn = useAzimuth((s) => s.useDrawnRoute);
  const undo = useAzimuth((s) => s.undoDrawnPoint);
  const clear = useAzimuth((s) => s.clearDrawing);
  const planTo = useAzimuth((s) => s.planTo);
  const ready = useAzimuth((s) => s.dataReady);

  if (!drawing) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" className="btn primary block" disabled={!ready} onClick={() => planTo(DEMO_TARGET)}>
          ROTA ATÉ O DELTA
        </button>
        <button type="button" className="btn ghost block" onClick={() => setDrawing(true)}>
          ✎ DESENHAR ROTA
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="kv">
        <span>Pontos desenhados</span>
        <b>{pts.length}</b>
      </div>
      <div className="kv">
        <span>Distância total</span>
        <b className="a">{fmtDist(dist)}</b>
      </div>
      <div className="src" style={{ margin: '4px 0 6px' }}>
        CLIQUE NO MAPA PARA ADICIONAR PONTOS A PARTIR DA SUA POSIÇÃO
      </div>
      <button type="button" className="btn primary block" disabled={!pts.length} onClick={planToLast}>
        TRAÇAR ROTAS ATÉ AQUI
      </button>
      <div className="flex gap-2">
        <button type="button" className="btn ghost flex-1" style={{ padding: '0 10px', fontSize: 11 }} disabled={!pts.length} onClick={useDrawn}>
          USAR MEU TRAÇADO
        </button>
        <button type="button" className="btn icon" disabled={!pts.length} onClick={undo} aria-label="Desfazer último ponto" title="Desfazer">
          ↶
        </button>
        <button
          type="button"
          className="btn icon"
          onClick={() => {
            clear();
            setDrawing(false);
          }}
          aria-label="Cancelar desenho"
          title="Cancelar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function RoutePanel() {
  const routes = useAzimuth((s) => s.routes);
  const activeId = useAzimuth((s) => s.activeRouteId);
  const routeAlerts = useAzimuth((s) => s.routeAlerts);
  const selectRoute = useAzimuth((s) => s.selectRoute);
  const dossier = useAzimuth((s) => s.dossier);
  const pnr = useAzimuth((s) => s.pnr);
  const oxygen = useAzimuth((s) => s.oxygen);
  const photo = useAzimuth((s) => s.selectedPhoto);
  const startWalk = useAzimuth((s) => s.startWalk);
  const clearRoutes = useAzimuth((s) => s.clearRoutes);
  const tod = useAzimuth((s) => s.timeOfDay);
  const mapData = useAzimuth((s) => s.mapData);
  const active = routes.find((r) => r.id === activeId) ?? null;
  const destName = active ? nameNear(active, mapData?.landmarks ?? []) : null;

  return (
    <Hud style={{ width: 380 }}>
      {!active ? (
        <>
          <h3 className="h3">PLANEJAR ROTA</h3>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 0 14px' }}>
            Desenhe a rota clicando no mapa ou peça à Azimuth: <span style={{ color: 'var(--text)' }}>“me leve até o delta”</span>.
            Comparamos até 3 opções com inclinação, perigos, frio e oxigênio.
          </p>
          <DrawTools />
        </>
      ) : (
        <>
          <h3 className="h3">
            {routes.length > 1 ? 'OPÇÕES DE ROTA' : 'ROTA'} · BASE → {upper(destName ?? 'DESTINO')}
          </h3>
          <div className="flex gap-2">
            {routes.map((r) => (
              <OptionCard key={r.id} route={r} selected={r.id === activeId} alerts={routeAlerts[r.id]?.length ?? 0} onSelect={() => selectRoute(r.id)} />
            ))}
          </div>

          <h3 className="h3" style={{ marginTop: 20 }}>
            DOSSIÊ DA ROTA · {tod === 'day' ? 'DIA' : 'NOITE'}
          </h3>
          {dossier?.entries.length ? (
            dossier.entries.map((e) => (
              <div className="kv" key={e.key} title={e.source}>
                <span className="k">
                  {e.label} <span className="src">{shortSource(e.source)}{e.approximate ? ' · APROX.' : ''}</span>
                </span>
                <b className={e.key === 'minerals' ? 'a' : ''}>{e.value}</b>
              </div>
            ))
          ) : (
            <>
              <div className="kv">
                <span className="k">
                  Inclinação máx. <span className="src">MOLA</span>
                </span>
                <b>{fmtDeg(active.maxSlopeDeg)}</b>
              </div>
              <div className="kv">
                <span className="k">
                  Radiação <span className="src">RAD · EST.</span>
                </span>
                <b>{environment.radiationMSvPerDay.toLocaleString('pt-BR')} mSv/dia</b>
              </div>
              <div className="kv">
                <span className="k">
                  Ar <span className="src">MEDA</span>
                </span>
                <b>
                  {environment.airTempC} °C · {environment.pressurePa} Pa
                </b>
              </div>
            </>
          )}
          <div className="kv">
            <span>O₂ ida + volta (+margem)</span>
            <b className={oxygen && !oxygen.ok ? 'r' : ''}>{oxygen ? fmtPct(oxygen.o2NeededRoundTripPct) : '—'}</b>
          </div>
          <div className="kv">
            <span>Ponto sem retorno</span>
            <b className="a">{pnr ? `km ${(pnr.distM / 1000).toFixed(1)}` : 'não há (volta coberta)'}</b>
          </div>

          <div className="flex gap-3" style={{ marginTop: 14 }}>
            <PhotoFrame photo={photo} height={84} className="shrink-0" caption={photo ? `${photo.camera} · SOL ${photo.sol}` : 'SEM FOTO'} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45 }}>
              {photo ? 'Foto real mais próxima da rota (NASA/JPL-Caltech). ' : 'Fotos dos rovers aparecem aqui. '}
              <span style={{ color: 'var(--text)' }}>Toque num ponto da rota ou num anel do mapa para trocar.</span>
            </div>
          </div>

          <div className="flex gap-2" style={{ marginTop: 16 }}>
            <button type="button" className="btn primary flex-1" onClick={startWalk}>
              CAMINHAR ▸
            </button>
            <button type="button" className="btn" style={{ padding: '0 16px', fontSize: 11 }} onClick={clearRoutes}>
              NOVA ROTA
            </button>
          </div>
        </>
      )}
    </Hud>
  );
}

function nameNear(route: Route, landmarks: { name: string; lat: number; lng: number }[]): string | null {
  const end = route.points[route.points.length - 1];
  if (!end) return null;
  if (Math.abs(end.lat - DEMO_TARGET.lat) < 0.004 && Math.abs(end.lng - DEMO_TARGET.lng) < 0.004) return 'Delta';
  let best: string | null = null;
  let bestD = 0.01;
  for (const l of landmarks) {
    const d = Math.hypot(l.lat - end.lat, l.lng - end.lng);
    if (d < bestD) {
      bestD = d;
      best = l.name;
    }
  }
  return best;
}

/** 'USGS Astrogeology Mars 2020 TRN CTX DTM 20 m (...)' → 'USGS ASTROGEOLOGY' (fonte completa no title). */
function shortSource(src: string): string {
  const head = src.split(/[(;,·]/)[0].trim();
  const words = head.split(/\s+/).slice(0, 2).join(' ');
  return words.length > 22 ? words.slice(0, 22) + '…' : words;
}
