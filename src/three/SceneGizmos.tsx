import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { Line, PivotControls } from '@react-three/drei';
import { useStore, S, upsertKeyOn } from '../store';
import { keysOf, evalChannel, lerp, round, evaluate, poiPoint, handleOffset } from '../lib/eval';
import type { Vec3 } from '../types';

const d2r = THREE.MathUtils.degToRad, r2d = THREE.MathUtils.radToDeg;
const ONE = new THREE.Vector3(1, 1, 1);

export default function SceneGizmos({ renderCamRef }: { renderCamRef: RefObject<THREE.PerspectiveCamera | null> }) {
  const rev = useStore(s => s.rev);
  const { gl, camera } = useThree();
  const st = S(); const cam = st.active(); const space = st.ui.gizmoSpace;
  const dragTarget = useRef<{ id: string; kind: 'key' | 'in' | 'out' } | null>(null);
  const gizmoDrag = useRef(false);
  const frozen = useRef<THREE.Matrix4 | null>(null);
  const dragStart = useRef<{ base: THREE.Quaternion; start: THREE.Quaternion } | null>(null);

  // frustum showing what the (state-driven) render camera sees
  const frustumCam = useMemo(() => new THREE.PerspectiveCamera(45, 1.777, 0.12, 2.4), []);
  const helper = useMemo(() => new THREE.CameraHelper(frustumCam), [frustumCam]);
  const bodyRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const rc = renderCamRef.current; if (!rc) return;
    const poi = poiPoint(S().active(), S().project.timeline.playhead);
    frustumCam.position.copy(rc.position); frustumCam.quaternion.copy(rc.quaternion);
    frustumCam.fov = rc.fov; frustumCam.aspect = S().project.canvas.width / S().project.canvas.height;
    frustumCam.far = Math.max(0.5, rc.position.distanceTo(new THREE.Vector3(poi[0], poi[1], poi[2])));
    frustumCam.updateProjectionMatrix(); frustumCam.updateMatrixWorld(true); helper.update();
    // NB: the camera body is a child of PivotControls (positioned by `matrix` at the camera
    // pose). It must stay at local origin — do NOT copy the world camera transform onto it.
  });

  // current camera pose (from state)
  const pose = evaluate(cam, st.project.timeline.playhead);
  const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(pose.rotation[0]), d2r(pose.rotation[1]), d2r(pose.rotation[2]), 'YXZ'));
  const baseQuat = space === 'local' ? camQuat : new THREE.Quaternion();
  const liveMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...pose.position), baseQuat, ONE);
  const matrix = gizmoDrag.current && frozen.current ? frozen.current : liveMatrix;

  const onDragStart = () => {
    gizmoDrag.current = true; S().setGizmoDragging(true);
    const p = evaluate(S().active(), S().project.timeline.playhead);
    const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(p.rotation[0]), d2r(p.rotation[1]), d2r(p.rotation[2]), 'YXZ'));
    dragStart.current = { base: baseQuat.clone(), start: sq };
    frozen.current = liveMatrix.clone();
  };
  const onDrag = (_l: THREE.Matrix4, _dl: THREE.Matrix4, w: THREE.Matrix4) => {
    if (!dragStart.current) return;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); w.decompose(p, q, s);
    const c = S().active(); const time = S().project.timeline.playhead;
    const pos: Vec3 = [round(p.x, 3), round(p.y, 3), round(p.z, 3)];
    if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', pos, time, 'manual'); else c.transform.position = pos;
    if (!c.target) {
      const deltaQ = q.clone().multiply(dragStart.current.base.clone().invert());
      const newQ = deltaQ.multiply(dragStart.current.start);
      const e = new THREE.Euler().setFromQuaternion(newQ, 'YXZ');
      const rot: Vec3 = [r2d(e.x), r2d(e.y), r2d(e.z)];
      if (keysOf(c, 'rotation').length) upsertKeyOn(c, 'rotation', rot, time, 'manual'); else c.transform.rotation = rot;
    }
    S().bump();
  };
  const onDragEnd = () => { gizmoDrag.current = false; frozen.current = null; dragStart.current = null; S().setGizmoDragging(false); };

  // spline keyframe + tangent-handle drag (both constrained to the key's horizontal plane)
  useEffect(() => {
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const move = (e: PointerEvent) => {
      const dt = dragTarget.current; if (!dt) return;
      const c = S().active();
      const k = c.keyframes.find(k => k.id === dt.id); if (!k || !Array.isArray(k.value)) return;
      const kv = k.value as Vec3;
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      // current tangent offset (for handles), to preserve axes we're not editing
      let off: Vec3 = [0, 0, 0];
      if (dt.kind !== 'key') { const pk2 = keysOf(c, 'position'); const i = pk2.findIndex(x => x.id === k.id); off = handleOffset(pk2, i, dt.kind); }
      if (e.shiftKey) {
        // vertical (Y): intersect a camera-facing vertical plane through the drag target
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
        const anchor = dt.kind === 'key' ? new THREE.Vector3(...kv) : new THREE.Vector3(kv[0] + off[0], kv[1] + off[1], kv[2] + off[2]);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, anchor);
        if (!rc.ray.intersectPlane(plane, p)) return;
        if (dt.kind === 'key') S().setKeyValueComp(k.id, 1, round(p.y, 3));
        else S().setKeyTangent(k.id, dt.kind, [off[0], round(p.y - kv[1], 3), off[2]]);
      } else {
        // horizontal (X/Z): plane at the key's height
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -kv[1]);
        if (!rc.ray.intersectPlane(plane, p)) return;
        if (dt.kind === 'key') { S().setKeyValueComp(k.id, 0, round(p.x, 3)); S().setKeyValueComp(k.id, 2, round(p.z, 3)); }
        else S().setKeyTangent(k.id, dt.kind, [round(p.x - kv[0], 3), off[1], round(p.z - kv[2], 3)]);
      }
    };
    const up = () => { if (dragTarget.current) { dragTarget.current = null; S().setGizmoDragging(false); } };
    dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up);
    return () => { dom.removeEventListener('pointermove', move); dom.removeEventListener('pointerup', up); };
  }, [gl, camera]);

  const pk = keysOf(cam, 'position');
  const pts = useMemo(() => {
    if (pk.length < 2) return [] as Vec3[]; const a: Vec3[] = [];
    for (let i = 0; i <= 64; i++) { const t = lerp(pk[0].time, pk[pk.length - 1].time, i / 64); a.push(evalChannel(cam, 'position', t) as Vec3); }
    return a;
  }, [rev]);

  return (
    <>
      <primitive object={helper} />
      <PivotControls matrix={matrix} autoTransform fixed scale={50} lineWidth={2} depthTest={false}
        disableScaling activeAxes={[true, true, true]}
        onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}>
        <group ref={bodyRef}>
          <mesh position={[0, 0, 0.08]}><boxGeometry args={[0.22, 0.16, 0.26]} /><meshStandardMaterial color="#15181b" roughness={0.5} metalness={0.6} /></mesh>
          <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.09, 0.14, 20]} /><meshStandardMaterial color="#0c0e10" roughness={0.4} metalness={0.7} /></mesh>
        </group>
      </PivotControls>
      {pts.length >= 2 && <Line points={pts} color="#f2a33c" lineWidth={2} transparent opacity={0.9} />}
      {pk.map((k, i) => {
        const sel = st.ui.selectedKeyIds.includes(k.id);
        const kv = k.value as Vec3;
        const grab = (kind: 'key' | 'in' | 'out') => (e: { stopPropagation: () => void; nativeEvent: Event }) => {
          e.stopPropagation(); (e.nativeEvent as PointerEvent).stopImmediatePropagation?.();
          dragTarget.current = { id: k.id, kind }; S().selectKey(k.id); S().setGizmoDragging(true);
        };
        // tangent handles: 'out' for every key but the last, 'in' for every key but the first
        const handles: { which: 'in' | 'out'; pos: Vec3 }[] = [];
        if (i < pk.length - 1) { const o = handleOffset(pk, i, 'out'); handles.push({ which: 'out', pos: [kv[0] + o[0], kv[1] + o[1], kv[2] + o[2]] }); }
        if (i > 0) { const o = handleOffset(pk, i, 'in'); handles.push({ which: 'in', pos: [kv[0] + o[0], kv[1] + o[1], kv[2] + o[2]] }); }
        return (
          <group key={k.id}>
            <mesh position={kv} onPointerDown={grab('key')}>
              <sphereGeometry args={[0.09, 20, 20]} />
              <meshBasicMaterial color={sel ? '#ffffff' : '#f2a33c'} />
            </mesh>
            {handles.map(h => (
              <group key={h.which}>
                <Line points={[kv, h.pos]} color="#29b6f6" lineWidth={1.5} transparent opacity={0.7} />
                <mesh position={h.pos} onPointerDown={grab(h.which)}
                  onDoubleClick={e => { e.stopPropagation(); S().setKeyTangent(k.id, h.which, null); }}>
                  <sphereGeometry args={[0.06, 16, 16]} />
                  <meshBasicMaterial color="#29b6f6" />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
    </>
  );
}
