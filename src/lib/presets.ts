import * as THREE from 'three';
import type { Camera, Channel, Ease, Keyframe, Vec3 } from '../types';
import { evaluate, eulerFromLookAt, keysOf, poseToSpherical, sphericalToPose, clamp, lerp, evalChannel, targetPoint } from './eval';
import { S, PIVOT, upsertKeyOn } from '../store';

export interface PresetOpts { duration?: number; amplitude?: number; ease?: Ease; dir?: 1 | -1; }

export function applyPreset(kind: string, opts: PresetOpts = {}) {
  const st = S(); const cam = st.active();
  const tl = st.project.timeline;
  const t0 = tl.playhead; const dur = opts.duration ?? 2.5; const t1 = Math.min(t0 + dur, tl.duration);
  const ease = opts.ease ?? 'easeInOut'; const amp = opts.amplitude ?? 1; const dir = opts.dir ?? 1;
  const base = evaluate(cam, t0);
  // Movement presets pivot around the camera's TARGET (fallback: global pivot).
  const pivot = cam.target ? new THREE.Vector3(...targetPoint(cam.target)) : PIVOT;
  const sph = poseToSpherical(base.position, pivot);
  const setKey = (ch: Channel, val: Vec3 | number, t: number, ez: Ease) => upsertKeyOn(cam, ch, val, t, 'preset', ez);
  cam.keyframes = []; // a preset REPLACES the current move (presets don't stack)

  switch (kind) {
    case 'dolly': {
      // dir = +1 push in (toward the target), -1 push out
      const vdir = new THREE.Vector3(...base.position).sub(pivot).normalize();
      const p1 = new THREE.Vector3(...base.position).addScaledVector(vdir, -2.4 * amp * dir).toArray() as Vec3;
      setKey('position', base.position, t0, 'linear'); setKey('position', p1, t1, ease); break;
    }
    case 'orbit': case 'arc': {
      const sweep = (kind === 'orbit' ? Math.PI : Math.PI / 2) * amp * dir; // orbit = ½ tour, arc = ¼
      // True circular arc: 3 keys on the circle with tangents = circular Bézier handles per segment
      // (handle length = R·4/3·tan(segAngle/4), segAngle = |sweep|/2), so the path follows the circle.
      const R = Math.hypot(base.position[0] - pivot.x, base.position[2] - pivot.z) || 1;
      const L = R * (4 / 3) * Math.tan(Math.abs(sweep) / 8);
      const poses: Vec3[] = [base.position, sphericalToPose({ ...sph, theta: sph.theta - sweep / 2 }, pivot), sphericalToPose({ ...sph, theta: sph.theta - sweep }, pivot)];
      const times = [t0, (t0 + t1) / 2, t1];
      poses.forEach((pos, i) => {
        const k = setKey('position', pos, times[i], i ? ease : 'linear') as Keyframe;
        const radial = new THREE.Vector3(pos[0] - pivot.x, 0, pos[2] - pivot.z).normalize();
        const tang = new THREE.Vector3(radial.z, 0, -radial.x).multiplyScalar(-Math.sign(sweep) * L); // circle tangent, travel dir
        if (i < poses.length - 1) k.tangentOut = [tang.x, 0, tang.z];
        if (i > 0) k.tangentIn = [-tang.x, 0, -tang.z];
      });
      if (!cam.target) {
        setKey('rotation', eulerFromLookAt(base.position, pivot.toArray() as Vec3), t0, 'linear');
        setKey('rotation', eulerFromLookAt(poses[2], pivot.toArray() as Vec3), t1, ease);
      }
      break;
    }
    case 'crane': {
      // dir = +1 up, -1 down: change elevation (phi) around the target, keep look-at
      const end = { ...sph, phi: clamp(sph.phi - 0.5 * amp * dir, 0.12, Math.PI - 0.12) };
      setKey('position', base.position, t0, 'linear');
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
