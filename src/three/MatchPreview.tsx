import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PIVOT } from '../store';
import { clamp } from '../lib/eval';
import { StudioCanvas } from './previewScene';
import type { Vec3 } from '../types';

const d2r = THREE.MathUtils.degToRad;

// Windowed render of the studio scene from a candidate camera — a faithful-ish thumbnail of the shot
// (framing from focal length). Read-only. No DoF: a 2nd postprocessing EffectComposer in this extra
// WebGL context renders black; the bokeh (aperture) is applied on the real camera after "Apply pose".
function Rig({ pos, focal, aspect, rot }: { pos: [number, number, number]; focal: number; aspect: number; rot?: [number, number, number] }) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  useFrame(() => {
    camera.position.set(...pos);
    if (rot) { camera.rotation.set(d2r(rot[0]), d2r(rot[1]), d2r(rot[2]), 'YXZ'); } // exact composed pose
    else camera.lookAt(PIVOT);                                                       // spherical → aim at pivot
    camera.filmGauge = 36; camera.setFocalLength(focal); // same mapping as CameraController
    camera.aspect = aspect; camera.near = 0.1; camera.far = 200; camera.updateProjectionMatrix();
  });
  return null;
}

export default function MatchPreview({ azimuth, elevation, distance, focal, aspect, pose }:
  { azimuth: number; elevation: number; distance: number; focal: number; aperture: number; aspect: number;
    pose?: { position: [number, number, number]; rotation: [number, number, number]; focal: number } }) {
  if (pose) return <StudioCanvas><Rig pos={pose.position} rot={pose.rotation} focal={pose.focal} aspect={aspect} /></StudioCanvas>;
  const r = clamp(distance * 2, 1.6, 14);
  const theta = azimuth * Math.PI / 180;
  const phi = clamp((90 - elevation) * Math.PI / 180, 0.12, Math.PI - 0.12);
  const pos: [number, number, number] = [
    PIVOT.x + r * Math.sin(phi) * Math.sin(theta),
    PIVOT.y + r * Math.cos(phi),
    PIVOT.z + r * Math.sin(phi) * Math.cos(theta),
  ];
  return <StudioCanvas><Rig pos={pos} focal={focal} aspect={aspect} /></StudioCanvas>;
}

// Looping preview of a MOVE (AI video match): ping-pongs the camera from → to (ease-in-out), aiming at
// the product — a live thumbnail of the gesture before it's committed as keyframes.
function AnimRig({ from, to, focal, aspect, duration }: { from: Vec3; to: Vec3; focal: number; aspect: number; duration: number }) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const t0 = useRef(performance.now());
  const a = useRef(new THREE.Vector3()); const b = useRef(new THREE.Vector3());
  useFrame(() => {
    const per = Math.max(0.2, duration);
    const el = ((performance.now() - t0.current) / 1000) % (per * 2);
    let u = el < per ? el / per : 1 - (el - per) / per;            // ping-pong 0→1→0
    u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;      // ease-in-out
    camera.position.lerpVectors(a.current.set(...from), b.current.set(...to), u);
    camera.lookAt(PIVOT);
    camera.filmGauge = 36; camera.setFocalLength(focal);
    camera.aspect = aspect; camera.near = 0.1; camera.far = 200; camera.updateProjectionMatrix();
  });
  return null;
}

export function MotionPreview({ from, to, focal, aspect, duration }:
  { from: Vec3; to: Vec3; focal: number; aspect: number; duration: number }) {
  return <StudioCanvas><AnimRig from={from} to={to} focal={focal} aspect={aspect} duration={duration} /></StudioCanvas>;
}
