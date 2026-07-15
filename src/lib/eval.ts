import * as THREE from 'three';
import type { Camera, Channel, Ease, Vec3, Keyframe } from '../types';

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const uid = () => Math.random().toString(36).slice(2, 9);
export const round = (v: number, d = 2) => { const p = 10 ** d; return Math.round(v * p) / p; };

export const EASES: Record<Ease, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInOutStrong: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
export const EASE_LIST: Ease[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInOutStrong'];

export const CHANNELS: Channel[] = ['position', 'rotation', 'focalLength'];

const cloneVal = (v: Vec3 | number) => (Array.isArray(v) ? (v.slice() as Vec3) : v);

export function keysOf(cam: Camera, ch: Channel): Keyframe[] {
  return cam.keyframes.filter(k => k.channel === ch).sort((a, b) => a.time - b.time);
}

export function evalChannel(cam: Camera, ch: Channel, t: number): Vec3 | number {
  const ks = keysOf(cam, ch);
  const base = ch === 'focalLength' ? cam.optics.focalLength : cam.transform[ch === 'position' ? 'position' : 'rotation'];
  if (ks.length === 0) return cloneVal(base);
  if (t <= ks[0].time) return cloneVal(ks[0].value);
  if (t >= ks[ks.length - 1].time) return cloneVal(ks[ks.length - 1].value);
  let i = 0; while (i < ks.length - 1 && ks[i + 1].time < t) i++;
  const a = ks[i], b = ks[i + 1];
  const raw = (t - a.time) / (b.time - a.time || 1);
  const e = (EASES[b.ease] || EASES.linear)(clamp(raw, 0, 1));
  if (ch === 'focalLength') return lerp(a.value as number, b.value as number, e);
  const av = a.value as Vec3, bv = b.value as Vec3;
  return [lerp(av[0], bv[0], e), lerp(av[1], bv[1], e), lerp(av[2], bv[2], e)];
}

// Object bounding-box centers, registered by the scene so target look-at can resolve them.
export const OBJECT_CENTERS: Record<string, Vec3> = { product: [0, 0.9, 0], pedestal: [0, 0.25, 0] };

// Scene objects exposed in the UI (target stack / outliner).
export const SCENE_OBJECTS: { id: string; label: string }[] = [
  { id: 'product', label: 'Product' },
  { id: 'pedestal', label: 'Pedestal' },
];

export function targetPoint(tg: NonNullable<Camera['target']>): Vec3 {
  if (tg.type === 'point' && tg.point) return tg.point;
  if (tg.objectId && OBJECT_CENTERS[tg.objectId]) return OBJECT_CENTERS[tg.objectId];
  return [0, 0.9, 0];
}

export function eulerFromLookAt(pos: Vec3, tp: Vec3): Vec3 {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...pos), new THREE.Vector3(...tp), new THREE.Vector3(0, 1, 0));
  const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
  return [THREE.MathUtils.radToDeg(e.x), THREE.MathUtils.radToDeg(e.y), THREE.MathUtils.radToDeg(e.z)];
}

export interface Pose { position: Vec3; rotation: Vec3; focalLength: number; }

export function evaluate(cam: Camera, t: number): Pose {
  const position = evalChannel(cam, 'position', t) as Vec3;
  let rotation = evalChannel(cam, 'rotation', t) as Vec3;
  const focalLength = evalChannel(cam, 'focalLength', t) as number;
  if (cam.target) rotation = eulerFromLookAt(position, targetPoint(cam.target));
  return { position, rotation, focalLength };
}

export const hasAnim = (cam: Camera) => cam.keyframes.length > 0;

// Point of Interest: the target point, or (free camera) a point along the view direction.
export function poiPoint(cam: Camera, t: number): Vec3 {
  if (cam.target) return targetPoint(cam.target);
  const p = evaluate(cam, t);
  const pos = new THREE.Vector3(...p.position);
  const e = new THREE.Euler(THREE.MathUtils.degToRad(p.rotation[0]), THREE.MathUtils.degToRad(p.rotation[1]), THREE.MathUtils.degToRad(p.rotation[2]), 'YXZ');
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
  const D = Math.max(2, pos.distanceTo(new THREE.Vector3(0, 0.9, 0)));
  return pos.addScaledVector(dir, D).toArray() as Vec3;
}

// spherical helpers around a pivot (orbit)
export function poseToSpherical(pos: Vec3, pivot: THREE.Vector3) {
  const v = new THREE.Vector3(...pos).sub(pivot);
  const r = v.length();
  const theta = Math.atan2(v.x, v.z);
  const phi = Math.acos(clamp(v.y / r, -1, 1));
  return { r, theta, phi };
}
export function sphericalToPose(s: { r: number; theta: number; phi: number }, pivot: THREE.Vector3): Vec3 {
  return [
    pivot.x + s.r * Math.sin(s.phi) * Math.sin(s.theta),
    pivot.y + s.r * Math.cos(s.phi),
    pivot.z + s.r * Math.sin(s.phi) * Math.cos(s.theta),
  ];
}
