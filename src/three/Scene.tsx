import { Canvas } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import { EffectComposer, DepthOfField } from '@react-three/postprocessing';
import CameraController from './CameraController';
import SceneGizmos from './SceneGizmos';
import Product from './Product';
import { useStore, PIVOT, S } from '../store';
import { clamp } from '../lib/eval';

function Lights() {
  return (
    <>
      <hemisphereLight args={[0x4a525c, 0x14171a, 0.7]} />
      <spotLight position={[6, 9, 6]} angle={0.8} penumbra={0.5} intensity={3.4} distance={40} decay={1.2}
        color={0xfff2e0} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} />
      <directionalLight position={[-7, 4, -3]} intensity={0.5} color={0x88a0c0} />
      <directionalLight position={[-3, 6, -8]} intensity={0.8} color={0xbcd0ff} />
      <directionalLight position={[5, 4, 9]} intensity={0.7} color={0xf0f0f5} />
    </>
  );
}
function Floor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[26, 64]} /><meshStandardMaterial color={0x111417} roughness={0.85} metalness={0.1} />
      </mesh>
      <gridHelper args={[40, 40, 0x1c2126, 0x141719]} position={[0, 0.001, 0]} />
    </>
  );
}
function DoF() {
  useStore(s => s.rev);
  const ap = S().active().optics.aperture;
  const bokeh = clamp((1 / ap) * 14 - 0.8, 0, 12);
  return (
    <EffectComposer>
      <DepthOfField target={new THREE.Vector3(PIVOT.x, PIVOT.y, PIVOT.z)} focalLength={0.012} bokehScale={bokeh} height={480} />
    </EffectComposer>
  );
}

export default function Scene() {
  const mode = useStore(s => s.ui.viewMode);
  const gizmoDragging = useStore(s => s.ui.gizmoDragging);
  const renderCamRef = useRef<THREE.PerspectiveCamera>(null);

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ scene }) => { scene.background = new THREE.Color(0x0a0b0c); scene.fog = new THREE.Fog(0x0a0b0c, 16, 40); }}>
      <PerspectiveCamera ref={renderCamRef} makeDefault={mode === 'camera'} fov={45} near={0.1} far={200} position={[4, 2.2, 5]} />
      <PerspectiveCamera makeDefault={mode === 'scene'} fov={50} near={0.1} far={500} position={[8, 5, 9]} />
      <Lights />
      <Floor />
      <Suspense fallback={null}><Product /></Suspense>
      <CameraController renderCamRef={renderCamRef} />
      {mode === 'scene' && <OrbitControls makeDefault enableDamping dampingFactor={0.12} target={[0, 1.4, 0]} enabled={!gizmoDragging} enablePan minDistance={2} maxDistance={60} />}
      {mode === 'scene' && <SceneGizmos renderCamRef={renderCamRef} />}
      {mode === 'camera' && <DoF />}
    </Canvas>
  );
}
