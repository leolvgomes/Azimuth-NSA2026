/**
 * API pública do core (contrato CoreApi em ./types). UI e IA calculam SÓ por aqui.
 * Código puro: roda no navegador e no servidor.
 */
import { buildDossier } from './dossier';
import { distanceM } from './geo';
import { oxygenMargin, pointOfNoReturn } from './oxygen';
import { computeRescue, nearestPhoto } from './rescue';
import { planRoutes, routeFromPolyline } from './routes';
import { evaluateRoute } from './alerts';
import type { CoreApi } from './types';

export * from './types';

export {
  planRoutes, routeFromPolyline, buildDossier, evaluateRoute, oxygenMargin,
  pointOfNoReturn, computeRescue, nearestPhoto, distanceM,
};

export const core: CoreApi = {
  planRoutes, routeFromPolyline, buildDossier, evaluateRoute, oxygenMargin,
  pointOfNoReturn, computeRescue, nearestPhoto, distanceM,
};
