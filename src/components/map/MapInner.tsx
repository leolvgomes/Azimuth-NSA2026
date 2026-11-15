'use client';
/**
 * Mapa 2D da Cratera Jezero (Leaflet, CRS EPSG4326 = graus de Marte direto).
 * Carregado só no cliente via next/dynamic (MapView.tsx).
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle, ImageOverlay, MapContainer, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, WMSTileLayer, ZoomControl,
  useMap, useMapEvents,
} from 'react-leaflet';
import { BASE, JEZERO_BOUNDS, JEZERO_CENTER, JEZERO_LEAFLET_BOUNDS } from '@/config/mission';
import { brand } from '@/config/brand';
import { core } from '@/core';
import type { Alert, LatLng, Route } from '@/core/types';
import { useAzimuth } from '@/state/store';
import { firstAvailable, groupOf, loadLayers, pickLayer, type LayerDef } from '@/lib/layers';
import { fmtDist, fmtKm, upper } from '@/lib/format';
import { robotLabelPt } from '@/components/azimuth/robots';

const C = brand.colors;

// ---------- ícones (L.divIcon com as classes do design system) ----------
const iconCache = new Map<string, L.DivIcon>();
function divIcon(key: string, html: string, size: number): L.DivIcon {
  let ic = iconCache.get(key);
  if (!ic) {
    ic = L.divIcon({ className: 'az-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    iconCache.set(key, ic);
  }
  return ic;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function labelIcon(text: string, tone: '' | 'a' | 'r' = '', dx = 16, dy = -11): L.DivIcon {
  return divIcon(
    `lbl:${tone}:${dx}:${dy}:${text}`,
    `<div class="mlabel ${tone}" style="position:absolute;left:${dx}px;top:${dy}px">${esc(upper(text))}</div>`,
    0,
  );
}
const ICONS = {
  base: () => divIcon('base', '<div class="pin base"></div>', 20),
  point: () => divIcon('pt', '<div class="pin"></div>', 14),
  hazard: () => divIcon('hz', '<div class="pin r"></div>', 16),
  photo: (sel: boolean) => divIcon(`ph:${sel}`, `<div class="ring ${sel ? 'sel' : ''}"></div>`, 20),
  target: () => divIcon('tg', '<div class="target"><div></div></div>', 32),
  me: (rescue: boolean) => divIcon(`me:${rescue}`, `<div class="pin me ${rescue ? 'r' : ''}"></div>`, 26),
  halo: (rescue: boolean) => divIcon(`halo:${rescue}`, `<div class="halo ${rescue ? 'r' : ''}" style="width:84px;height:84px"></div>`, 84),
  shelter: () => divIcon('sh', '<div class="pin shelter"></div>', 22),
  pnr: () => divIcon('pnr', '<div class="pin" style="width:24px;height:24px;border-color:#EDEDED;background:transparent"></div>', 24),
  robot: () => divIcon('rb', '<div class="robot">⛭</div>', 22),
};

/** Rótulos de perigos e marcos só aparecem daqui pra cima (antes: tooltip no hover). Base e destino sempre. */
const LABEL_ZOOM = 13;

const pad = 1.2;
const MAX_BOUNDS: L.LatLngBoundsExpression = [
  [JEZERO_BOUNDS.south - pad, JEZERO_BOUNDS.west - pad],
  [JEZERO_BOUNDS.north + pad, JEZERO_BOUNDS.east + pad],
];
const DATA_BOUNDS: L.LatLngBoundsExpression = [
  [JEZERO_BOUNDS.south - 0.3, JEZERO_BOUNDS.west - 0.3],
  [JEZERO_BOUNDS.north + 0.3, JEZERO_BOUNDS.east + 0.3],
];

function padBounds(b: LayerDef['bounds'], d: number): L.LatLngBoundsExpression {
  if (!b) return DATA_BOUNDS;
  return [
    [b[0][0] - d, b[0][1] - d],
    [b[1][0] + d, b[1][1] + d],
  ];
}

const ll = (p: LatLng): [number, number] => [p.lat, p.lng];

function segment(route: Route, a: Alert): [number, number][] {
  const n = route.points.length;
  const from = Math.max(0, Math.min(a.fromIdx, n - 1));
  let to = Math.max(from, Math.min(a.toIdx, n - 1));
  let f = from;
  if (to === f) {
    f = Math.max(0, f - 1);
    to = Math.min(n - 1, to + 1);
  }
  return route.points.slice(f, to + 1).map(ll);
}

function centroid(poly: [number, number][]): [number, number] {
  const s = poly.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [s[0] / poly.length, s[1] / poly.length];
}

// ---------- camadas raster ----------
function RasterLayers() {
  const toggles = useAzimuth((s) => s.layers);
  const tod = useAzimuth((s) => s.timeOfDay);
  const [layers, setLayers] = useState<LayerDef[]>([]);
  const [ctxUrl, setCtxUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadLayers().then((r) => alive && setLayers(r.layers));
    firstAvailable(['/data/ctx/jezero-ctx.webp', '/data/ctx/jezero-ctx-preview.webp']).then((u) => alive && setCtxUrl(u));
    return () => {
      alive = false;
    };
  }, []);

  const base = layers.find((l) => groupOf(l) === 'base');
  // uma camada por grupo ligado (óptica = CTX acima; perigos/rovers são vetores)
  const overlays = (['relief', 'thermal', 'mineral', 'geology'] as const)
    .filter((g) => toggles[g])
    .map((g) => pickLayer(layers, g, tod))
    .filter((l): l is LayerDef => !!l);

  return (
    <>
      {base ? (
        <TileLayer
          key={base.id}
          url={base.url}
          noWrap
          bounds={padBounds(base.bounds, 0.8)}
          maxNativeZoom={base.maxNativeZoom ?? 7}
          maxZoom={16}
          attribution={base.attribution}
          opacity={base.opacity ?? 1}
        />
      ) : null}
      <Pane name="ctx" style={{ zIndex: 250 }}>
        {toggles.optical && ctxUrl ? <ImageOverlay url={ctxUrl} bounds={JEZERO_LEAFLET_BOUNDS} attribution="NASA/JPL-Caltech/MSSS · MRO CTX · USGS" /> : null}
      </Pane>
      <Pane name="data" style={{ zIndex: 300 }}>
        {overlays.map((l) =>
          l.type === 'wms' ? (
            <WMSTileLayer
              key={l.id}
              url={l.url}
              params={{ layers: l.layers ?? '', format: l.format ?? 'image/png', transparent: true }}
              opacity={l.opacity ?? 0.6}
              attribution={l.attribution}
              bounds={DATA_BOUNDS}
            />
          ) : l.type === 'image' ? (
            <ImageOverlay key={l.id} url={l.url} bounds={l.bounds ?? JEZERO_LEAFLET_BOUNDS} opacity={l.opacity ?? 0.6} attribution={l.attribution} />
          ) : (
            <TileLayer
              key={l.id}
              url={l.url}
              noWrap
              bounds={padBounds(l.bounds, 0.3)}
              maxNativeZoom={l.maxNativeZoom ?? 9}
              maxZoom={16}
              opacity={l.opacity ?? 0.6}
              attribution={l.attribution}
            />
          ),
        )}
      </Pane>
    </>
  );
}

// ---------- vetores: perigos, trilha, fotos, marcos ----------
function DataVectors() {
  const data = useAzimuth((s) => s.mapData);
  const toggles = useAzimuth((s) => s.layers);
  const selectedPhoto = useAzimuth((s) => s.selectedPhoto);
  const selectPhoto = useAzimuth((s) => s.selectPhoto);
  const zoom = useAzimuth((s) => s.zoom);
  if (!data) return null;
  const track = data.perseveranceTrack;
  return (
    <>
      {toggles.hazards
        ? data.hazards.map((h) => {
            const color = C.alert;
            const opacity = h.severity === 'avoid' ? 0.18 : 0.1;
            const labelAt: [number, number] | null = h.polygon?.length ? centroid(h.polygon) : h.center ? ll(h.center) : null;
            return (
              <Fragment key={h.id}>
                {h.polygon?.length ? (
                  <Polygon positions={h.polygon} pathOptions={{ color, weight: 1.5, dashArray: '6 4', fillColor: color, fillOpacity: opacity }}>
                    <Tooltip sticky className="az-tip">{h.name} · {h.advice}</Tooltip>
                  </Polygon>
                ) : h.center && h.radiusM ? (
                  // Leaflet mede o raio em metros da Terra: convertemos pelo raio de Marte (só desenho)
                  <Circle center={ll(h.center)} radius={h.radiusM * (6371008.8 / 3396190)} pathOptions={{ color, weight: 1.5, dashArray: '6 4', fillColor: color, fillOpacity: opacity }}>
                    <Tooltip sticky className="az-tip">{h.name} · {h.advice}</Tooltip>
                  </Circle>
                ) : null}
                {labelAt && zoom >= LABEL_ZOOM ? <Marker position={labelAt} icon={labelIcon(h.name.split('(')[0].trim(), 'r', -30, -11)} interactive={false} keyboard={false} /> : null}
              </Fragment>
            );
          })
        : null}

      {toggles.rovers && track.length > 1 ? (
        <>
          <Polyline positions={track} pathOptions={{ color: C.text, weight: 2, dashArray: '6 6', opacity: 0.8 }} interactive={false} />
        </>
      ) : null}

      {toggles.rovers
        ? data.photos.map((p) => (
            <Marker
              key={p.id}
              position={ll(p)}
              icon={ICONS.photo(selectedPhoto?.id === p.id)}
              eventHandlers={{ click: () => selectPhoto(p, true) }}
              title={`Foto ${p.camera} · sol ${p.sol}`}
              keyboard
            />
          ))
        : null}

      {data.landmarks
        .filter((l) => l.kind !== 'landing' && zoom >= LABEL_ZOOM)
        .map((l) => (
          <Marker key={l.id} position={ll(l)} icon={labelIcon(l.name, l.kind === 'delta' ? 'a' : '', 8, -11)} interactive={false} keyboard={false} />
        ))}
    </>
  );
}

// ---------- rotas, posição, resgate ----------
function RouteLayers() {
  const routes = useAzimuth((s) => s.routes);
  const activeId = useAzimuth((s) => s.activeRouteId);
  const routeAlerts = useAzimuth((s) => s.routeAlerts);
  const alerts = useAzimuth((s) => s.alerts);
  const mode = useAzimuth((s) => s.mode);
  const progressIdx = useAzimuth((s) => s.progressIdx);
  const position = useAzimuth((s) => s.position);
  const pnr = useAzimuth((s) => s.pnr);
  const rescue = useAzimuth((s) => s.rescuePlan);
  const returning = useAzimuth((s) => s.returning);
  const selectRoute = useAzimuth((s) => s.selectRoute);
  const photoNear = useAzimuth((s) => s.photoNear);
  const robot = useAzimuth((s) => s.robot);
  const active = routes.find((r) => r.id === activeId) ?? null;
  const isRescue = mode === 'rescue';
  const isWalk = mode === 'walk';

  const waypoints = useMemo(() => {
    if (!active || active.points.length < 4) return [];
    const n = 4;
    return Array.from({ length: n - 1 }, (_, i) => active.points[Math.round(((i + 1) * (active.points.length - 1)) / n)]);
  }, [active]);

  const dest = active?.points[active.points.length - 1];
  const here = active?.points[progressIdx];

  return (
    <>
      {/* alternativas: pontilhadas, clicáveis */}
      {!isRescue &&
        !isWalk &&
        routes
          .filter((r) => r.id !== activeId)
          .map((r) => (
            <Fragment key={r.id}>
              <Polyline
                positions={r.points.map(ll)}
                pathOptions={{ color: C.text, weight: 2.5, dashArray: '2 7', lineCap: 'round', opacity: 0.9 }}
                eventHandlers={{ click: () => selectRoute(r.id) }}
              />
              {(routeAlerts[r.id] ?? []).map((a) => (
                <Polyline key={a.id} positions={segment(r, a)} pathOptions={{ color: C.alert, weight: 3.5, dashArray: '2 7', lineCap: 'round' }} interactive={false} />
              ))}
            </Fragment>
          ))}

      {/* rota ativa */}
      {active ? (
        isRescue ? (
          <Polyline positions={active.points.map(ll)} pathOptions={{ color: C.text, weight: 2, dashArray: '4 6', opacity: 0.45 }} interactive={false} />
        ) : isWalk ? (
          <>
            <Polyline positions={active.points.slice(0, progressIdx + 1).map(ll)} pathOptions={{ color: C.accent, weight: 5, opacity: 0.35 }} interactive={false} />
            <Polyline positions={active.points.slice(progressIdx).map(ll)} pathOptions={{ color: C.accent, weight: 5, lineJoin: 'round' }} interactive={false} />
          </>
        ) : (
          <Polyline
            positions={active.points.map(ll)}
            pathOptions={{ color: C.accent, weight: 4, lineJoin: 'round' }}
            eventHandlers={{ click: (e) => photoNear({ lat: e.latlng.lat, lng: e.latlng.lng }) }}
          />
        )
      ) : null}

      {/* trechos com alerta + pinos */}
      {active && !isRescue
        ? alerts.map((a) => (
            <Fragment key={a.id}>
              <Polyline positions={segment(active, a)} pathOptions={{ color: C.alert, weight: isWalk ? 6 : 5, opacity: 0.95 }} interactive={false} />
              <Marker position={ll(a.at)} icon={ICONS.hazard()} title={`${a.title}: ${a.action}`} />
            </Fragment>
          ))
        : null}

      {/* pontos da rota (planejar) */}
      {active && mode === 'plan'
        ? waypoints.map((p, i) => <Marker key={i} position={ll(p)} icon={ICONS.point()} eventHandlers={{ click: () => photoNear(p) }} title={`Ponto ${i + 1}: ver foto mais próxima`} />)
        : null}

      {/* destino */}
      {dest && !isRescue ? (
        <>
          <Marker position={ll(dest)} icon={ICONS.target()} interactive={false} keyboard={false} />
          <Marker
            position={ll(dest)}
            icon={labelIcon(isWalk ? `Destino · ${fmtKm(active!.distanceM)}` : 'Destino', 'a', 22, -11)}
            interactive={false} keyboard={false}
          />
        </>
      ) : null}

      {/* ponto sem retorno */}
      {pnr && !isRescue && active ? (
        <>
          <Marker position={ll(pnr)} icon={ICONS.pnr()} interactive={false} keyboard={false} />
          <Marker position={ll(pnr)} icon={labelIcon(`Ponto sem retorno · km ${(pnr.distM / 1000).toFixed(1)}`, '', 20, -11)} interactive={false} keyboard={false} />
        </>
      ) : null}

      {/* resgate */}
      {isRescue && rescue ? (
        <>
          <Polyline positions={rescue.returnRoute.points.map(ll)} pathOptions={{ color: C.alert, weight: 5, lineJoin: 'round' }} interactive={false} />
          <Marker position={ll(rescue.shelter)} icon={ICONS.shelter()} interactive={false} keyboard={false} />
          <Marker position={ll(rescue.shelter)} icon={labelIcon(`Abrigo · ${rescue.shelter.name.split('·')[0].trim()}`, '', 24, -30)} interactive={false} keyboard={false} />
          {rescue.pointOfNoReturn ? (
            <Marker
              position={ll(rescue.pointOfNoReturn)}
              icon={labelIcon(rescue.passedPointOfNoReturn ? 'Ponto sem retorno (passou)' : 'Ponto sem retorno (não passou)', 'r', 14, -11)}
              interactive={false} keyboard={false}
            />
          ) : null}
          {robot ? <RobotMarker from={rescue.shelter} to={position} etaMin={robot.etaMin} startedAt={robot.startedAt} label={robotLabelPt(robot.role)} /> : null}
        </>
      ) : null}

      {/* você */}
      {(isWalk || isRescue) && (here || position) ? (
        <>
          <Marker position={ll(position)} icon={ICONS.halo(isRescue)} interactive={false} keyboard={false} />
          <Marker position={ll(position)} icon={ICONS.me(isRescue)} interactive={false} keyboard={false} zIndexOffset={1000} />
          <Marker
            position={ll(position)}
            icon={labelIcon(isRescue ? (returning ? 'Você · voltando' : 'Você') : `Você · km ${((here?.distM ?? 0) / 1000).toFixed(1)}`, isRescue ? 'r' : 'a', 34, -11)}
            interactive={false} keyboard={false}
            zIndexOffset={1000}
          />
        </>
      ) : null}
    </>
  );
}

/** Conceito: robô sai do abrigo e vem até você (1 min simulado = 2 s). */
function RobotMarker({ from, to, etaMin, startedAt, label }: { from: LatLng; to: LatLng; etaMin: number; startedAt: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(1, etaMin) * 2000;
  const t = Math.min(1, (now - startedAt) / total);
  const at = { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
  const left = Math.max(0, Math.ceil(etaMin * (1 - t)));
  return (
    <>
      <Polyline positions={[ll(from), ll(at)]} pathOptions={{ color: C.text, weight: 2, dashArray: '3 5' }} interactive={false} />
      <Marker position={ll(at)} icon={ICONS.robot()} interactive={false} keyboard={false} />
      <Marker position={ll(at)} icon={labelIcon(t >= 1 ? `${label} · chegou` : `${label} · ${left} min`, '', 18, -11)} interactive={false} keyboard={false} />
    </>
  );
}

// ---------- desenho ----------
function DrawLayer() {
  const drawing = useAzimuth((s) => s.drawing);
  const pts = useAzimuth((s) => s.drawnPoints);
  const position = useAzimuth((s) => s.position);
  const dist = useAzimuth((s) => s.drawnDistanceM);
  if (!pts.length) return null;
  const chain = [position, ...pts].map(ll);
  const last = pts[pts.length - 1];
  return (
    <>
      <Polyline positions={chain} pathOptions={{ color: C.accent, weight: 3, dashArray: '8 6', opacity: drawing ? 1 : 0.6 }} interactive={false} />
      {pts.map((p, i) => (
        <Marker key={i} position={ll(p)} icon={ICONS.point()} interactive={false} keyboard={false} />
      ))}
      <Marker position={ll(last)} icon={labelIcon(`${pts.length} pts · ${fmtDist(dist)}`, 'a', 14, -11)} interactive={false} keyboard={false} />
    </>
  );
}

// ---------- eventos, foco, escala ----------
function MapEvents() {
  const setCursor = useAzimuth((s) => s.setCursor);
  const setZoom = useAzimuth((s) => s.setZoom);
  const addDrawnPoint = useAzimuth((s) => s.addDrawnPoint);
  const raf = useRef(0);
  const map = useMapEvents({
    mousemove(e) {
      cancelAnimationFrame(raf.current);
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      raf.current = requestAnimationFrame(() => setCursor(p));
    },
    mouseout() {
      setCursor(null);
    },
    zoomend() {
      setZoom(map.getZoom());
    },
    click(e) {
      const s = useAzimuth.getState();
      if (s.drawing && s.mode === 'plan') addDrawnPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  const drawing = useAzimuth((s) => s.drawing);
  useEffect(() => {
    const el = map.getContainer();
    el.classList.toggle('drawing', drawing);
  }, [drawing, map]);
  useEffect(() => {
    setZoom(map.getZoom());
  }, [map, setZoom]);
  return null;
}

function FocusController() {
  const map = useMap();
  const focus = useAzimuth((s) => s.focus);
  const mode = useAzimuth((s) => s.mode);
  useEffect(() => {
    if (!focus) return;
    // no planejamento, alertas + cartão da Azimuth ocupam o topo do centro: a rota fica abaixo deles
    const opts = { paddingTopLeft: [360, mode === 'plan' ? 330 : 130] as L.PointTuple, paddingBottomRight: [440, 210] as L.PointTuple, maxZoom: 14, duration: 0.8 };
    if (focus.kind === 'point') {
      map.flyTo(ll(focus.at), focus.zoom ?? Math.max(map.getZoom(), 12), { duration: 0.8 });
    } else if (focus.points.length) {
      const b = L.latLngBounds(focus.points.map(ll));
      if (b.isValid()) map.flyToBounds(b.pad(0.15), opts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, map]);
  return null;
}

/** Barra de escala em metros de MARTE (o L.control.scale usaria o raio da Terra). */
function MarsScale() {
  const map = useMap();
  const [scale, setScale] = useState<{ px: number; label: string } | null>(null);
  useEffect(() => {
    const update = () => {
      const size = map.getSize();
      const y = size.y - 220;
      const a = map.containerPointToLatLng([60, y]);
      const b = map.containerPointToLatLng([160, y]);
      const m100 = core.distanceM({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
      if (!Number.isFinite(m100) || m100 <= 0) return;
      const nice = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
      const target = m100 * 1.2;
      const m = nice.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), nice[0]);
      setScale({ px: (m / m100) * 100, label: m >= 1000 ? `≈ ${m / 1000} km` : `≈ ${m} m` });
    };
    update();
    map.on('zoomend moveend resize', update);
    return () => {
      map.off('zoomend moveend resize', update);
    };
  }, [map]);
  if (!scale) return null;
  return (
    <div style={{ position: 'absolute', left: 372, bottom: 196, zIndex: 800, pointerEvents: 'none' }} aria-hidden>
      <svg width={scale.px + 4} height={14}>
        <line x1={2} y1={7} x2={scale.px + 2} y2={7} stroke={C.text} strokeWidth={2} />
        <line x1={2} y1={1} x2={2} y2={13} stroke={C.text} strokeWidth={2} />
        <line x1={scale.px + 2} y1={1} x2={scale.px + 2} y2={13} stroke={C.text} strokeWidth={2} />
      </svg>
      <div className="f-mono" style={{ fontSize: 10, letterSpacing: 1, marginTop: 2 }}>
        {scale.label}
      </div>
    </div>
  );
}

export default function MapInner() {
  const mode = useAzimuth((s) => s.mode);
  return (
    <div className={`absolute inset-0 z-0 az-map ${mode === 'rescue' ? 'az-map-rescue' : ''}`}>
      <MapContainer
        crs={L.CRS.EPSG4326}
        center={[JEZERO_CENTER.lat, JEZERO_CENTER.lng]}
        zoom={11}
        minZoom={8}
        maxZoom={15}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.8}
        zoomControl={false}
        attributionControl
        style={{ position: 'absolute', inset: 0 }}
      >
        <RasterLayers />
        <DataVectors />
        <RouteLayers />
        <DrawLayer />
        <Marker position={[BASE.lat, BASE.lng]} icon={ICONS.base()} interactive={false} keyboard={false} />
        {mode !== 'rescue' ? <Marker position={[BASE.lat, BASE.lng]} icon={labelIcon('Base · Abrigo', 'a', 20, -11)} interactive={false} keyboard={false} /> : null}
        <MapEvents />
        <FocusController />
        <MarsScale />
        <ZoomControl position="bottomright" />
      </MapContainer>
    </div>
  );
}
