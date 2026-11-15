import { Vector3 } from 'three';

const DEG = Math.PI / 180;

/**
 * Planetocentric lat/lon (degrees, east-positive) -> point on a sphere, in the frame of
 * three.js `SphereGeometry` with an equirectangular texture whose left edge is lon -180
 * and whose top edge is lat +90 (the layout of public/textures/mars-*.jpg).
 *
 * SphereGeometry places texture coordinate u at azimuth phi = u * 2PI with
 *   x = -cos(phi) * sin(theta),  y = cos(theta),  z = sin(phi) * sin(theta)
 * where theta is the polar angle from +Y. Since u = (lon + 180) / 360, phi = lon + 180deg and
 * theta = 90deg - lat, which simplifies to:
 *   x =  r * cos(lat) * cos(lon)
 *   y =  r * sin(lat)
 *   z = -r * cos(lat) * sin(lon)
 * So lon 0 faces +X, lon 90E faces -Z, lon 90W faces +Z, and the north pole is +Y.
 */
export function latLngToVector3(lat: number, lng: number, radius = 1, target = new Vector3()): Vector3 {
  const la = lat * DEG;
  const lo = lng * DEG;
  return target.set(radius * Math.cos(la) * Math.cos(lo), radius * Math.sin(la), -radius * Math.cos(la) * Math.sin(lo));
}

/**
 * Y-rotation (radians) to apply to the planet so that longitude `lng` faces +Z
 * (i.e. the default camera side). Derivation: a point at lon L has azimuth
 * atan2(x, z) = atan2(cos L, -sin L) = 90deg + L; rotating by `a` around +Y adds `a`
 * to that azimuth, so a = -(L + 90deg).
 */
export function yRotationToFace(lng: number): number {
  return -(lng + 90) * DEG;
}

/** Unit vector in the YZ plane at a given latitude (where a facing point ends up after yRotationToFace). */
export function facingDirection(lat: number, target = new Vector3()): Vector3 {
  const la = lat * DEG;
  return target.set(0, Math.sin(la), Math.cos(la));
}
