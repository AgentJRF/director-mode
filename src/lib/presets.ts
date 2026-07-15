import * as THREE from 'three';
import type { Camera, Channel, Ease, Vec3 } from '../types';
import { evaluate, eulerFromLookAt, keysOf, poseToSpherical, sphericalToPose, clamp, lerp, evalChannel } from './eval';
import { S, PIVOT, upsertKeyOn } from '../store';

export interface PresetOpts { duration?: number; amplitude?: number; ease?: Ease; }

export function applyPreset(kind: string, opts: PresetOpts = {}) {
  const st = S(); const cam = st.active();
  const tl = st.project.timeline;
  const t0 = tl.playhead; const dur = opts.duration ?? 2.5; const t1 = Math.min(t0 + dur, tl.duration);
  const ease = opts.ease ?? 'easeInOut'; const amp = opts.amplitude ?? 1;
  const base = evaluate(cam, t0); const pivot = PIVOT;
  const sph = poseToSpherical(base.position, pivot);
  const setKey = (ch: Channel, val: Vec3 | number, t: number, ez: Ease) => upsertKeyOn(cam, ch, val, t, 'preset', ez);

  switch (kind) {
    case 'dolly': {
      const dir = new THREE.Vector3(...base.position).sub(pivot).normalize();
      const p1 = new THREE.Vector3(...base.position).addScaledVector(dir, -2.4 * amp).toArray() as Vec3;
      setKey('position', base.position, t0, 'linear'); setKey('position', p1, t1, ease); break;
    }
    case 'orbit': {
      const mid = { ...sph, theta: sph.theta - Math.PI * 0.5 * amp };
      const end = { ...sph, theta: sph.theta - Math.PI * amp };
      setKey('position', base.position, t0, 'linear');
      setKey('position', sphericalToPose(mid, pivot), (t0 + t1) / 2, ease);
      setKey('position', sphericalToPose(end, pivot), t1, ease);
      if (!cam.target) {
        setKey('rotation', eulerFromLookAt(base.position, pivot.toArray() as Vec3), t0, 'linear');
        setKey('rotation', eulerFromLookAt(sphericalToPose(end, pivot), pivot.toArray() as Vec3), t1, ease);
      }
      break;
    }
    case 'pan': { const r0 = base.rotation.slice() as Vec3; const r1 = r0.slice() as Vec3; r1[1] -= 28 * amp; setKey('rotation', r0, t0, 'linear'); setKey('rotation', r1, t1, ease); break; }
    case 'tilt': { const r0 = base.rotation.slice() as Vec3; const r1 = r0.slice() as Vec3; r1[0] += 20 * amp; setKey('rotation', r0, t0, 'linear'); setKey('rotation', r1, t1, ease); break; }
    case 'rackFocus': { setKey('focalLength', cam.optics.focalLength, t0, 'linear'); setKey('focalLength', clamp(cam.optics.focalLength * 1.9 * amp, 14, 200), t1, ease); break; }
    case 'dollyZoom': {
      const dir = new THREE.Vector3(...base.position).sub(pivot).normalize();
      const p1 = new THREE.Vector3(...base.position).addScaledVector(dir, 2.6 * amp).toArray() as Vec3;
      setKey('position', base.position, t0, 'linear'); setKey('position', p1, t1, ease);
      setKey('focalLength', cam.optics.focalLength, t0, 'linear'); setKey('focalLength', clamp(cam.optics.focalLength * 0.5, 14, 200), t1, ease);
      break;
    }
  }
  const n = cam.keyframes.length;
  st.setPlayhead(t0); st.bump();
  st.toast(`Preset "${kind}" applied — ${n} editable keys`);
}

export function applyCurve(ease: Ease) {
  const cam = S().active();
  cam.keyframes.forEach(k => { const first = keysOf(cam, k.channel)[0]; if (k !== first) k.ease = ease; });
  S().toast('Curve "' + ease + '" applied (motion unchanged)'); S().bump();
}

export function fuseAB() {
  const st = S(); const cam = st.active(); const { poseA, poseB } = st.ui;
  if (!poseA || !poseB) { st.toast('Capture A and B first'); return; }
  cam.keyframes = cam.keyframes.filter(k => !['position', 'rotation', 'focalLength', 'poi'].includes(k.channel));
  const t0 = 0, t1 = st.project.timeline.duration;
  upsertKeyOn(cam, 'position', poseA.position, t0, 'interpolation', 'linear');
  upsertKeyOn(cam, 'position', poseB.position, t1, 'interpolation', 'easeInOut');
  if (!cam.target) {
    upsertKeyOn(cam, 'rotation', poseA.rotation, t0, 'interpolation', 'linear');
    upsertKeyOn(cam, 'rotation', poseB.rotation, t1, 'interpolation', 'easeInOut');
  }
  upsertKeyOn(cam, 'focalLength', poseA.focal, t0, 'interpolation', 'linear');
  upsertKeyOn(cam, 'focalLength', poseB.focal, t1, 'interpolation', 'easeInOut');
  st.setPoseAB('A', null); st.setPoseAB('B', null); st.setModal(null);
  st.toast('A→B merged: 1 camera, 2 keys per channel — editable spline'); st.bump();
}

export function resampleChannel(cam: Camera, ch: Channel, n: number) {
  const ks = keysOf(cam, ch); if (ks.length < 2) return;
  const t0 = ks[0].time, t1 = ks[ks.length - 1].time, ease = ks[ks.length - 1].ease;
  const samples: { t: number; v: Vec3 | number }[] = [];
  for (let i = 0; i < n; i++) { const t = lerp(t0, t1, i / (n - 1)); samples.push({ t, v: evalChannel(cam, ch, t) }); }
  cam.keyframes = cam.keyframes.filter(k => k.channel !== ch);
  samples.forEach((s, i) => upsertKeyOn(cam, ch, s.v, s.t, 'aiVideo', i ? ease : 'linear'));
}
