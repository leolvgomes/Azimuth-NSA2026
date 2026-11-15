'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { brand } from '@/config/brand';
import { BASE, JEZERO_BOUNDS } from '@/config/mission';
import { facingDirection, latLngToVector3, yRotationToFace } from './geo';
import { introCopy } from './copy';

/* ------------------------------------------------------------------ timeline */
/** Seconds: pull back to whole globe (with spin), then turn back + dive to Jezero. */
const T_PULLBACK = 1.1;
const T_DIVE_END = 3.2;
const T_FADE_START = 2.7;
const SPIN_SWING = -0.85; // rad the globe turns away during the pull back (toward the lit side)
const FOV = 35;

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* --------------------------------------------------------------- atmosphere */
const atmoVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

/** Outer halo (BackSide shell): bright next to the limb, fading to zero at the shell edge. */
const haloFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 v = normalize(-vViewPos);
    float f = clamp(-dot(normalize(vNormal), v) * 3.2, 0.0, 1.0);
    float a = pow(f, 1.8) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Thin limb haze over the planet disk (FrontSide shell). */
const rimFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 v = normalize(-vViewPos);
    float f = 1.0 - clamp(dot(normalize(vNormal), v), 0.0, 1.0);
    float a = pow(f, 3.5) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

function Atmosphere() {
  const color = useMemo(() => new THREE.Color(brand.colors.mars).lerp(new THREE.Color('#ffd2b8'), 0.55), []);
  const halo = useMemo(
    () => ({ uColor: { value: color }, uIntensity: { value: 0.9 } }),
    [color],
  );
  const rim = useMemo(
    () => ({ uColor: { value: color }, uIntensity: { value: 0.75 } }),
    [color],
  );
  return (
    <>
      <mesh scale={1.055} raycast={() => null}>
        <sphereGeometry args={[1, 96, 64]} />
        <shaderMaterial
          vertexShader={atmoVertex}
          fragmentShader={haloFragment}
          uniforms={halo}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={1.003} raycast={() => null}>
        <sphereGeometry args={[1, 96, 64]} />
        <shaderMaterial
          vertexShader={atmoVertex}
          fragmentShader={rimFragment}
          uniforms={rim}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------- marker */
const MARKER_POS = latLngToVector3(BASE.lat, BASE.lng, 1.0025);
const MARKER_QUAT = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 0, 1),
  MARKER_POS.clone().normalize(),
);

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns} · ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

function Marker({
  opacityRef,
  showLabel,
  reducedMotion,
}: {
  opacityRef: RefObject<number>;
  showLabel: boolean;
  reducedMotion: boolean;
}) {
  const accent = brand.colors.accent;
  const diamondMat = useRef<THREE.MeshBasicMaterial>(null);
  const dotMat = useRef<THREE.MeshBasicMaterial>(null);
  const pulseMat = useRef<THREE.MeshBasicMaterial>(null);
  const pulse = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const o = opacityRef.current ?? 1;
    if (diamondMat.current) diamondMat.current.opacity = o;
    if (dotMat.current) dotMat.current.opacity = o;
    if (pulse.current && pulseMat.current) {
      const k = reducedMotion ? 0.35 : (clock.elapsedTime * 0.6) % 1;
      pulse.current.scale.setScalar(1 + k * 1.8);
      pulseMat.current.opacity = o * (1 - k) * 0.8;
    }
  });

  const font = {
    mono: `var(--font-mono, '${brand.fonts.mono}'), ui-monospace, monospace`,
  };

  return (
    <group position={MARKER_POS} quaternion={MARKER_QUAT}>
      {/* ringGeometry with 4 theta segments is a diamond */}
      <mesh renderOrder={2} raycast={() => null}>
        <ringGeometry args={[0.017, 0.023, 4, 1]} />
        <meshBasicMaterial ref={diamondMat} color={accent} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={2} raycast={() => null}>
        <circleGeometry args={[0.0075, 4]} />
        <meshBasicMaterial ref={dotMat} color={accent} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={pulse} renderOrder={2} raycast={() => null}>
        <ringGeometry args={[0.024, 0.0265, 64]} />
        <meshBasicMaterial ref={pulseMat} color={accent} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <Html zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'relative',
            opacity: showLabel ? 1 : 0,
            transition: 'opacity 350ms ease',
            fontFamily: font.mono,
            color: brand.colors.text,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 22,
              top: 0,
              transform: 'translateY(-50%)',
              background: 'rgba(5,5,5,0.55)',
              borderLeft: `2px solid ${accent}`,
              padding: '8px 12px',
              backdropFilter: 'blur(2px)',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: 2, color: accent }}>{introCopy.youAreHere}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{introCopy.placeName}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: brand.colors.textDim }}>
              {formatCoord(BASE.lat, BASE.lng)}
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              right: 22,
              top: 0,
              width: 'min(140px, 18vw)',
              borderTop: `1px dashed ${accent}`,
              opacity: 0.6,
            }}
          />
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------- Jezero patch */
const DEG = Math.PI / 180;
/** Curved decal with the CTX 6 m/px mosaic of Jezero, so the dive lands on real high-res imagery. */
function JezeroPatch({ url }: { url: string }) {
  const map = useTexture(url);
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);
  const b = JEZERO_BOUNDS;
  // SphereGeometry segment: phi = lon + 180deg, theta = 90deg - lat (see geo.ts); UVs span 0..1.
  const args = useMemo(
    () =>
      [
        1.0006,
        48,
        48,
        (b.west + 180) * DEG,
        (b.east - b.west) * DEG,
        (90 - b.north) * DEG,
        (b.north - b.south) * DEG,
      ] as const,
    [b],
  );
  return (
    <mesh raycast={() => null} renderOrder={1}>
      <sphereGeometry args={[...args]} />
      <meshStandardMaterial
        map={map}
        transparent
        depthWrite={false}
        roughness={1}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------- planet */
function Planet({
  textureUrl,
  patchUrl,
  onClick,
  onReady,
  spinRef,
  markerOpacity,
  showLabel,
  reducedMotion,
}: {
  textureUrl: string;
  patchUrl: string;
  onClick: () => void;
  onReady: () => void;
  spinRef: RefObject<THREE.Group | null>;
  markerOpacity: RefObject<number>;
  showLabel: boolean;
  reducedMotion: boolean;
}) {
  const map = useTexture(textureUrl);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    map.needsUpdate = true;
    onReady();
  }, [map, gl, onReady]);

  return (
    <group rotation-y={yRotationToFace(BASE.lng)}>
      <group ref={spinRef}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <sphereGeometry args={[1, 160, 112]} />
          <meshStandardMaterial map={map} bumpMap={map} bumpScale={1.2} roughness={1} metalness={0} />
        </mesh>
        <JezeroPatch url={patchUrl} />
        <Marker opacityRef={markerOpacity} showLabel={showLabel} reducedMotion={reducedMotion} />
      </group>
    </group>
  );
}

/* --------------------------------------------------------------- camera rig */
interface Pose {
  dir: THREE.Vector3;
  dist: number;
  target: THREE.Vector3;
}

/** Initial framing like Tela 1: big planet low on screen, Jezero just below the screen center. */
function idlePose(aspect: number): Pose {
  // Distance so the disk is ~1.2x the viewport height (or ~1.05x the width on portrait screens).
  const halfV = (FOV / 2) * (Math.PI / 180);
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const wantV = Math.atan(Math.tan(halfV) * 1.22);
  const wantH = Math.atan(Math.tan(halfH) * 1.05);
  const dist = 1 / Math.sin(Math.min(wantV, wantH));
  // Camera below Jezero's latitude, looking above the planet center.
  const camLat = BASE.lat - (aspect >= 1 ? 34 : 26);
  const dir = facingDirection(camLat);
  const pos = dir.clone().multiplyScalar(dist);
  const look = dir
    .clone()
    .negate()
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), (aspect >= 1.9 ? 19 : aspect >= 1 ? 17 : 13) * (Math.PI / 180));
  return { dir, dist, target: pos.clone().add(look.multiplyScalar(dist)) };
}

function farPose(aspect: number): Pose {
  const halfV = (FOV / 2) * (Math.PI / 180);
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const dist = 1.3 / Math.sin(Math.min(halfV, halfH));
  return { dir: facingDirection(8), dist, target: new THREE.Vector3() };
}

/** End of the dive: ~22 km above the base, the CTX patch overfills the view. */
const DIVE_POSE: Pose = { dir: facingDirection(BASE.lat), dist: 1.0065, target: new THREE.Vector3() };

function CameraRig({
  flying,
  reducedMotion,
  spinRef,
  markerOpacity,
  fadeRef,
  onFlightEnd,
}: {
  flying: boolean;
  reducedMotion: boolean;
  spinRef: RefObject<THREE.Group | null>;
  markerOpacity: RefObject<number>;
  fadeRef: RefObject<HTMLDivElement | null>;
  onFlightEnd: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const start = useRef<number | null>(null);
  const ended = useRef(false);
  const tmp = useMemo(
    () => ({ dir: new THREE.Vector3(), target: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion() }),
    [],
  );

  const aspect = size.width / Math.max(1, size.height);
  const k0 = useMemo(() => idlePose(aspect), [aspect]);
  const k1 = useMemo(() => farPose(aspect), [aspect]);

  /** p = direction/target progress, pa = altitude progress. */
  const apply = (a: Pose, b: Pose, p: number, pa = p) => {
    // slerp direction (via quaternions from +Z) and interpolate ALTITUDE in log space,
    // so the approach keeps accelerating visually all the way down to the surface
    tmp.q0.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.dir);
    tmp.q1.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.dir);
    tmp.q0.slerp(tmp.q1, p);
    tmp.dir.set(0, 0, 1).applyQuaternion(tmp.q0);
    const dist = 1 + Math.exp(THREE.MathUtils.lerp(Math.log(a.dist - 1), Math.log(b.dist - 1), pa));
    camera.position.copy(tmp.dir).multiplyScalar(dist);
    tmp.target.lerpVectors(a.target, b.target, p);
    camera.lookAt(tmp.target);
  };

  useFrame(({ clock }) => {
    const spin = spinRef.current;
    if (!flying) {
      start.current = null;
      apply(k0, k0, 0);
      if (spin) spin.rotation.y = reducedMotion ? 0 : 0.035 * Math.sin(clock.elapsedTime * 0.22);
      markerOpacity.current = 1;
      return;
    }
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;

    if (t < T_PULLBACK) {
      const p = easeInOutCubic(clamp01(t / T_PULLBACK));
      apply(k0, k1, p);
      if (spin) spin.rotation.y = SPIN_SWING * p;
      markerOpacity.current = 1;
    } else {
      // Turn back to Jezero first (first ~55% of the phase), descend the whole time.
      const q = clamp01((t - T_PULLBACK) / (T_DIVE_END - T_PULLBACK));
      const turn = easeInOutCubic(clamp01(q / 0.55));
      const pa = easeInOutCubic(q);
      apply(k1, DIVE_POSE, turn, pa);
      if (spin) spin.rotation.y = SPIN_SWING * (1 - turn);
      markerOpacity.current = 1 - clamp01((q - 0.2) / 0.2);
    }

    if (fadeRef.current) {
      fadeRef.current.style.opacity = String(clamp01((t - T_FADE_START) / (T_DIVE_END - T_FADE_START)));
    }
    if (t >= T_DIVE_END + 0.05 && !ended.current) {
      ended.current = true;
      onFlightEnd();
    }
  });

  return null;
}

/* -------------------------------------------------------------------- scene */
export interface MarsSceneProps {
  textureUrl: string;
  patchUrl: string;
  flying: boolean;
  reducedMotion: boolean;
  showLabel: boolean;
  fadeRef: RefObject<HTMLDivElement | null>;
  onPlanetClick: () => void;
  onFlightEnd: () => void;
  onReady: () => void;
}

export default function MarsScene(props: MarsSceneProps) {
  const spinRef = useRef<THREE.Group>(null);
  const markerOpacity = useRef(1);
  const stars = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (stars.current && !props.reducedMotion) stars.current.rotation.y += dt * 0.004;
  });

  return (
    <>
      <color attach="background" args={[brand.colors.bg]} />
      <ambientLight intensity={0.22} />
      <directionalLight position={[-4, 2.6, 3.2]} intensity={2.7} />
      <group ref={stars}>
        <Stars radius={80} depth={40} count={2600} factor={2.6} saturation={0} fade speed={0.4} />
      </group>
      <Planet
        textureUrl={props.textureUrl}
        patchUrl={props.patchUrl}
        onClick={props.onPlanetClick}
        onReady={props.onReady}
        spinRef={spinRef}
        markerOpacity={markerOpacity}
        showLabel={props.showLabel}
        reducedMotion={props.reducedMotion}
      />
      <Atmosphere />
      <CameraRig
        flying={props.flying}
        reducedMotion={props.reducedMotion}
        spinRef={spinRef}
        markerOpacity={markerOpacity}
        fadeRef={props.fadeRef}
        onFlightEnd={props.onFlightEnd}
      />
    </>
  );
}

export { FOV as MARS_FOV };
