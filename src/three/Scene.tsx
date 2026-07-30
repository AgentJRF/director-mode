import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { PerspectiveCamera, OrbitControls, Grid } from '@react-three/drei';
import { EffectComposer, DepthOfField } from '@react-three/postprocessing';
import CameraController from './CameraController';
import SceneGizmos from './SceneGizmos';
import CameraMarkers from './CameraMarkers';
import FocusPicker from './FocusPicker';
import TargetPicker from './TargetPicker';
import PoiControl from './PoiControl';
import EditorFly from './EditorFly';
import CameraMotionBlur from './CameraMotionBlur';
import Product from './Product';
import MultiviewRenderer from './multiview/MultiviewRenderer';
import { useStore, PIVOT, S } from '../store';
import { clamp, evalChannel } from '../lib/eval';

// Editor viewport uses a neutral Dimension-style gray; the Camera POV keeps the studio dark so the
// final render/backdrop is unchanged.
function ViewBackground() {
  const scene = useThree(s => s.scene);
  const mode = useStore(s => s.ui.viewMode);
  useEffect(() => {
    const col = mode === 'camera' ? 0x1a1e22 : 0x2c2f34;
    scene.background = new THREE.Color(col);
    scene.fog = new THREE.Fog(col, 22, mode === 'camera' ? 48 : 65);
  }, [mode, scene]);
  return null;
}
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
// Ground is viewport furniture (not a scene object) — always present as the shadow catcher.
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ focusPickable: true }}>
      <circleGeometry args={[26, 64]} /><meshStandardMaterial color={0x20252b} roughness={0.8} metalness={0.1} />
    </mesh>
  );
}
// Dimension/Stager-style ground grid: an INFINITE shader grid (single quad, ~free — not real geometry),
// independent of the environment (not tied to the Ground toggle). Editor (Scene) view only; hidden in
// the camera POV so it never appears in the final framing.
function EditorGrid() {
  useStore(s => s.rev);
  if (S().ui.viewMode === 'camera') return null;
  return (
    <Grid position={[0, 0.002, 0]} infiniteGrid followCamera={false}
      cellSize={1} cellThickness={0.6} cellColor="#3f3f3f"
      sectionSize={5} sectionThickness={1} sectionColor="#5b6470"
      fadeDistance={100} fadeStrength={1} />
  );
}
function DoF() {
  useStore(s => s.rev);
  const cam = S().active();
  const ap = evalChannel(cam, 'aperture', S().project.timeline.playhead) as number;
  const fp = cam.optics.focusPoint;
  // Aperture always drives blur strength + depth of the sharp slab (world units).
  // "General" focuses on the product centre; "Picked" focuses on the picked point.
  const bokeh = clamp((1 / ap) * 10, 1, 8);
  const range = clamp(ap * 0.4, 0.5, 8);
  const target = fp ? new THREE.Vector3(fp[0], fp[1], fp[2]) : new THREE.Vector3(PIVOT.x, PIVOT.y, PIVOT.z);
  return (
    <EffectComposer>
      <DepthOfField target={target} worldFocusRange={range} bokehScale={bokeh} height={720} />
      <CameraMotionBlur />
    </EffectComposer>
  );
}

export default function Scene() {
  const mode = useStore(s => s.ui.viewMode);
  const multiview = useStore(s => s.ui.multiview);
  const gizmoDragging = useStore(s => s.ui.gizmoDragging);
  const hasCam = useStore(s => s.project.cameras.length > 0);
  const renderCamRef = useRef<THREE.PerspectiveCamera>(null);
  const sceneCamRef = useRef<THREE.PerspectiveCamera>(null);
  const quad = mode === 'scene' && multiview;

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ scene, gl }) => { scene.background = new THREE.Color(0x1a1e22); scene.fog = new THREE.Fog(0x1a1e22, 22, 48); gl.toneMappingExposure = 1.25; }}>
      <PerspectiveCamera ref={renderCamRef} makeDefault={mode === 'camera'} fov={45} near={0.1} far={200} position={[4, 2.2, 5]} />
      <PerspectiveCamera ref={sceneCamRef} makeDefault={mode === 'scene'} fov={50} near={0.1} far={500} position={[8, 5, 9]} />
      <ViewBackground />
      <Lights />
      <Floor />
      <EditorGrid />
      <Suspense fallback={null}><Product /></Suspense>
      <CameraController renderCamRef={renderCamRef} />
      <FocusPicker />
      <TargetPicker />
      {/* Navigation always available (any tool): LEFT stays free for selection/gizmo, RIGHT = orbit,
          MIDDLE = pan, wheel = zoom — standard DCC feel, so Select mode no longer blocks the view. */}
      {mode === 'scene' && !multiview && <OrbitControls makeDefault enableDamping dampingFactor={0.12} target={[0, 1.4, 0]} enabled={!gizmoDragging}
        mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
        enablePan screenSpacePanning panSpeed={1.1} minDistance={1.5} maxDistance={120} />}
      {mode === 'scene' && !multiview && <EditorFly />}
      {mode === 'scene' && hasCam && <SceneGizmos renderCamRef={renderCamRef} />}
      {mode === 'scene' && !multiview && <CameraMarkers />}
      {mode === 'scene' && !multiview && hasCam && <PoiControl />}
      {quad && <MultiviewRenderer sceneCamRef={sceneCamRef} />}
      {mode === 'camera' && hasCam && <DoF />}
    </Canvas>
  );
}
