import { Canvas } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import { EffectComposer, DepthOfField } from '@react-three/postprocessing';
import CameraController from './CameraController';
import SceneGizmos from './SceneGizmos';
import FocusPicker from './FocusPicker';
import TargetPicker from './TargetPicker';
import PoiControl from './PoiControl';
import EditorFly from './EditorFly';
import Product from './Product';
import { useStore, PIVOT, S } from '../store';
import { clamp } from '../lib/eval';

function Lights() {
  useStore(s => s.rev); const h = S().ui.hidden;
  return (
    <>
      <group visible={!h.ambient}>
        <ambientLight intensity={0.55} color={0xd8dee6} />
        <hemisphereLight args={[0x6b7480, 0x2a2f35, 1.0]} />
      </group>
      <spotLight visible={!h.key} position={[6, 9, 6]} angle={0.85} penumbra={0.5} intensity={4.6} distance={40} decay={1.2}
        color={0xfff4e6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} />
      <directionalLight visible={!h.fill} position={[-7, 4, -3]} intensity={0.8} color={0x9fb4cc} />
      <directionalLight visible={!h.rim} position={[-3, 6, -8]} intensity={1.0} color={0xbcd0ff} />
      <directionalLight visible={!h.front} position={[5, 4, 9]} intensity={1.0} color={0xf2f2f6} />
    </>
  );
}
function Floor() {
  useStore(s => s.rev); const h = S().ui.hidden;
  return (
    <group visible={!h.floor}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ focusPickable: true }}>
        <circleGeometry args={[26, 64]} /><meshStandardMaterial color={0x20252b} roughness={0.8} metalness={0.1} />
      </mesh>
      <gridHelper args={[40, 40, 0x1c2126, 0x141719]} position={[0, 0.001, 0]} />
    </group>
  );
}
function DoF() {
  useStore(s => s.rev);
  const cam = S().active();
  const ap = cam.optics.aperture;
  const fp = cam.optics.focusPoint;
  // Aperture always drives blur strength + depth of the sharp slab (world units).
  // "General" focuses on the product centre; "Picked" focuses on the picked point.
  const bokeh = clamp((1 / ap) * 10, 1, 8);
  const range = clamp(ap * 0.4, 0.5, 8);
  const target = fp ? new THREE.Vector3(fp[0], fp[1], fp[2]) : new THREE.Vector3(PIVOT.x, PIVOT.y, PIVOT.z);
  return (
    <EffectComposer>
      <DepthOfField target={target} worldFocusRange={range} bokehScale={bokeh} height={720} />
    </EffectComposer>
  );
}

export default function Scene() {
  const mode = useStore(s => s.ui.viewMode);
  const gizmoDragging = useStore(s => s.ui.gizmoDragging);
  const renderCamRef = useRef<THREE.PerspectiveCamera>(null);

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ scene, gl }) => { scene.background = new THREE.Color(0x1a1e22); scene.fog = new THREE.Fog(0x1a1e22, 22, 48); gl.toneMappingExposure = 1.25; }}>
      <PerspectiveCamera ref={renderCamRef} makeDefault={mode === 'camera'} fov={45} near={0.1} far={200} position={[4, 2.2, 5]} />
      <PerspectiveCamera makeDefault={mode === 'scene'} fov={50} near={0.1} far={500} position={[8, 5, 9]} />
      <Lights />
      <Floor />
      <Suspense fallback={null}><Product /></Suspense>
      <CameraController renderCamRef={renderCamRef} />
      <FocusPicker />
      <TargetPicker />
      {mode === 'scene' && <OrbitControls makeDefault enableDamping dampingFactor={0.12} target={[0, 1.4, 0]} enabled={!gizmoDragging} enablePan screenSpacePanning panSpeed={1.1} minDistance={1.5} maxDistance={120} />}
      {mode === 'scene' && <EditorFly />}
      {mode === 'scene' && <SceneGizmos renderCamRef={renderCamRef} />}
      {mode === 'scene' && <PoiControl />}
      {mode === 'camera' && <DoF />}
    </Canvas>
  );
}
