import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { Line, PivotControls } from '@react-three/drei';
import { useStore, S, upsertKeyOn } from '../store';
import { keysOf, evalChannel, lerp, round, evaluate, poiPoint } from '../lib/eval';
import type { Vec3 } from '../types';

const d2r = THREE.MathUtils.degToRad, r2d = THREE.MathUtils.radToDeg;
const ONE = new THREE.Vector3(1, 1, 1);

export default function SceneGizmos({ renderCamRef }: { renderCamRef: RefObject<THREE.PerspectiveCamera | null> }) {
  const rev = useStore(s => s.rev);
  const { gl, camera } = useThree();
  const st = S(); const cam = st.active(); const space = st.ui.gizmoSpace;
  const dragId = useRef<string | null>(null);
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

  // spline handle drag
  useEffect(() => {
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const move = (e: PointerEvent) => {
      if (!dragId.current) return;
      const k = S().active().keyframes.find(k => k.id === dragId.current); if (!k || !Array.isArray(k.value)) return;
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -k.value[1]); const p = new THREE.Vector3();
      if (rc.ray.intersectPlane(plane, p)) { S().setKeyValueComp(k.id, 0, round(p.x, 3)); S().setKeyValueComp(k.id, 2, round(p.z, 3)); }
    };
    const up = () => { if (dragId.current) { dragId.current = null; S().setGizmoDragging(false); } };
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
      {pk.map(k => {
        const sel = st.ui.selectedKeyIds.includes(k.id);
        return (
          <mesh key={k.id} position={k.value as Vec3}
            onPointerDown={e => { e.stopPropagation(); (e.nativeEvent as PointerEvent).stopImmediatePropagation?.(); dragId.current = k.id; S().selectKey(k.id); S().setGizmoDragging(true); }}>
            <sphereGeometry args={[0.09, 20, 20]} />
            <meshBasicMaterial color={sel ? '#ffffff' : '#f2a33c'} />
          </mesh>
        );
      })}
    </>
  );
}
