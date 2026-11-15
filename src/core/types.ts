/**
 * CONTRATO COMPARTILHADO entre map-data, route-engine, ui-builder e ai-assistant.
 * Mudanças aqui afetam todo mundo: só o orquestrador altera este arquivo.
 */

import type { Lang } from '@/config/i18n';
export type { Lang } from '@/config/i18n';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Raster regular sobre JEZERO_BOUNDS (ou parte dele).
 * data é row-major, linha 0 = NORTE, coluna 0 = OESTE. length = width * height.
 * Arquivo em public/data/grids/<name>.json com este mesmo formato.
 */
export interface Grid {
  name: 'elevation' | 'slope' | 'tempDay' | 'tempNight' | 'hazard' | 'trackProximity' | string;
  unit: string; // 'm', 'deg', 'degC', '0-1'
  width: number;
  height: number;
  bounds: GeoBounds;
  cellSizeM: number;
  nodata: number;
  data: number[];
  source: string; // ex.: 'CTX DTM 20 m (USGS) resampled', 'THEMIS IR day brightness → approx °C'
  approximate?: boolean;
}

export type HazardKind = 'channel' | 'breach' | 'dune' | 'scarp' | 'crater' | 'rim' | 'rough';

export interface Hazard {
  id: string;
  name: string;
  kind: HazardKind;
  /** Polígono [lat,lng][] (fechado ou não) OU círculo center+radiusM. */
  polygon?: [number, number][];
  center?: LatLng;
  radiusM?: number;
  severity: 'avoid' | 'caution';
  /** Uma frase: o que fazer. */
  advice: string;
  source: string;
  /** Versões em inglês (padrão do site). */
  nameEn?: string;
  adviceEn?: string;
}

export interface Landmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: 'delta' | 'landing' | 'channel' | 'breach' | 'crater' | 'unit' | 'poi';
  description: string;
  source: string;
  nameEn?: string;
  descriptionEn?: string;
}

/** Parada científica: lugar onde vale coletar/observar algo no caminho (objetivo científico do desafio). */
export interface ScienceTarget {
  id: string;
  name: string;
  nameEn?: string;
  lat: number;
  lng: number;
  kind: 'carbonate' | 'clay' | 'olivine' | 'sample-site' | 'stratigraphy' | 'boulder' | 'other';
  /** Uma ou duas frases: por que importa para a ciência (ex.: possível bioassinatura em carbonatos). */
  why: string;
  whyEn?: string;
  /** O que fazer lá: ex. "Coletar amostra de núcleo", "Fotografar camadas". */
  task: string;
  taskEn?: string;
  /** Minutos estimados de trabalho na parada (entra no tempo e no O₂ da rota). */
  workMin: number;
  priority: 1 | 2 | 3; // 1 = alta
  /** Fonte do dado (ex.: 'CRISM FRT00005C5E', 'Perseverance sample Wildcat Ridge'). */
  source: string;
  /** Foto real associada (id em photos.json), se houver. */
  photoId?: string;
}

export interface ScienceStopOnRoute {
  target: ScienceTarget;
  /** Índice do ponto da rota mais próximo do alvo. */
  index: number;
  /** Distância ao longo da rota até esse ponto (m). */
  alongM: number;
  /** Distância lateral do alvo à rota (m). */
  offsetM: number;
}

export interface RoverPhoto {
  id: string;
  src: string; // caminho em /public, ex.: '/data/rovers/xxx.jpg'
  lat: number;
  lng: number;
  sol: number;
  camera: string;
  caption: string;
  credit: 'NASA/JPL-Caltech';
  captionEn?: string;
  /** true se a posição foi associada à mão (feed sem lat/lon). */
  approximatePosition: boolean;
}

export interface Shelter {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Tudo que o core precisa para calcular. Carregado por src/data/loadMapData. */
export interface MapData {
  grids: {
    elevation?: Grid;
    slope: Grid;
    tempDay: Grid;
    tempNight: Grid;
    hazard?: Grid; // 0..1 custo de perigo pré-rasterizado
    trackProximity?: Grid; // 0..1, 1 = em cima da trilha do Perseverance
  };
  hazards: Hazard[];
  landmarks: Landmark[];
  perseveranceTrack: [number, number][]; // [lat,lng][]
  photos: RoverPhoto[];
  shelters: Shelter[];
  /** public/data/science-targets.json (opcional: [] se não existir). */
  scienceTargets: ScienceTarget[];
}

/** Opções extras de planejamento (último parâmetro opcional das funções do core). */
export interface PlanOptions {
  /** Idioma dos textos gerados (labels, alertas, dossiê). Padrão: 'en'. */
  lang?: Lang;
  /** Paradas intermediárias, na ordem: a rota passa por todas antes do destino. */
  via?: LatLng[];
  /** Minutos de trabalho parado em cada `via` (mesmo tamanho de via); somam ao tempo/O₂. */
  viaWorkMin?: number[];
  /** Id do ScienceTarget de cada `via` (mesmo tamanho de via); vai para route.stops[].targetId. */
  viaTargetIds?: (string | undefined)[];
}

export type TimeOfDay = 'day' | 'night';

export interface SuitState {
  o2Pct: number; // 0..100
  batteryPct: number; // 0..100
  suitTempC: number;
}

export type RouteProfile = 'safest' | 'fastest' | 'balanced' | 'manual' | 'return';

export interface RoutePoint extends LatLng {
  /** distância acumulada desde o início (m) */
  distM: number;
  elevM?: number;
  slopeDeg?: number;
  surfaceTempC?: number;
  hazardIds?: string[];
}

export type AlertKind = 'cold' | 'heat' | 'slope' | 'hazard' | 'o2' | 'battery' | 'radiation' | 'no-data';

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: 'critical' | 'warning';
  /** índices em route.points (inclusive) */
  fromIdx: number;
  toIdx: number;
  at: LatLng;
  title: string; // curto, maiúsculo na UI
  detail: string; // o que é
  action: string; // o que fazer (obrigatório)
}

export interface Route {
  id: string;
  profile: RouteProfile;
  label: string; // 'Mais segura' etc.
  points: RoutePoint[];
  distanceM: number;
  durationMin: number;
  o2UsedPct: number;
  batteryUsedPct: number;
  /** O₂ que sobra ao chegar no destino E voltar à base (ida+volta) */
  o2RemainingPct: number;
  batteryRemainingPct: number;
  maxSlopeDeg: number;
  alerts: Alert[];
  /** Paradas (via) da rota: índice do ponto e minutos de trabalho incluídos em durationMin/O₂. */
  stops?: { index: number; workMin: number; targetId?: string }[];
}

export interface DossierEntry {
  key: string; // 'elevation' | 'slope' | 'temp' | 'minerals' | 'geology' | 'hazards' | 'radiation' | 'air'
  label: string;
  value: string; // já formatado
  source: string; // 'MOLA', 'THEMIS DIA', ...
  approximate?: boolean;
}

export interface Dossier {
  routeId: string;
  timeOfDay: TimeOfDay;
  entries: DossierEntry[];
}

export interface PointOfNoReturn {
  index: number;
  lat: number;
  lng: number;
  distM: number;
}

export interface RescuePlan {
  from: LatLng;
  shelter: Shelter;
  returnRoute: Route;
  pointOfNoReturn: PointOfNoReturn | null;
  passedPointOfNoReturn: boolean;
  etaMin: number;
  o2NeededPct: number; // já com margem
  o2AvailablePct: number;
  ok: boolean;
}

export interface OxygenMargin {
  o2AvailablePct: number;
  o2NeededRoundTripPct: number;
  marginPct: number;
  autonomyMin: number;
  ok: boolean;
}

/**
 * API pública do core (src/core/index.ts). A UI e a IA SÓ calculam por aqui.
 */
export interface CoreApi {
  planRoutes(from: LatLng, to: LatLng, data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions): Route[]; // [safest, balanced, fastest]
  routeFromPolyline(points: LatLng[], data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions): Route; // rota desenhada à mão
  buildDossier(route: Route, data: MapData, tod: TimeOfDay, opts?: PlanOptions): Dossier;
  evaluateRoute(route: Route, data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions): Alert[];
  oxygenMargin(route: Route, suit: SuitState): OxygenMargin;
  pointOfNoReturn(route: Route, suit: SuitState): PointOfNoReturn | null;
  computeRescue(position: LatLng, progressIdx: number, route: Route | null, data: MapData, suit: SuitState, tod: TimeOfDay, opts?: PlanOptions): RescuePlan;
  nearestPhoto(at: LatLng, data: MapData): RoverPhoto | null;
  distanceM(a: LatLng, b: LatLng): number;
  /** Alvos científicos a até radiusM (padrão 400 m) da rota, ordenados ao longo dela. */
  scienceAlongRoute(route: Route, data: MapData, radiusM?: number): ScienceStopOnRoute[];
}
