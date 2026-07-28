import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { PIVOT } from '../store';
import { clamp } from '../lib/eval';

const URL = '/asset/studio_packshot.gltf';

// Windowed render of the studio scene from a candidate camera — a faithful-ish thumbnail of the shot
// (framing from focal length, bokeh from aperture). Read-only: it never touches the app's store.
function Content() {
  const { scene } = useGLTF(URL);
  const d = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 2.0 / Math.max(size.y, 1e-6);
    const pos: [number, number, number] = [-center.x * s, 0.5 - box.min.y * s, -center.z * s];
    const footR = clamp(Math.max(size.x, size.z) * s * 0.62, 0.6, 2.4);
    return { obj: scene.clone(true), s, pos, footR }; // clone → shares geometry, safe in a 2nd canvas
  }, [scene]);
  return (
    <group>
      <mesh position={[0, 0.25, 0]} scale={[d.footR / 1.15, 1, d.footR / 1.15]}>
        <cylinderGeometry args={[1.15, 1.35, 0.5, 48]} /><meshStandardMaterial color="#1a1e22" roughness={0.6} metalness={0.3} />
      </mesh>
      <primitive object={d.obj} scale={d.s} position={d.pos} />
    </group>
  );
}

function Rig({ pos, focal, aspect }: { pos: [number, number, number]; focal: number; aspect: number }) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  useFrame(() => {
    camera.position.set(...pos); camera.lookAt(PIVOT);
    camera.filmGauge = 36; camera.setFocalLength(focal); // same mapping as CameraController
    camera.aspect = aspect; camera.near = 0.1; camera.far = 200; camera.updateProjectionMatrix();
  });
  return null;
}

// NB: no DepthOfField here — a 2nd postprocessing EffectComposer in this extra WebGL context renders
// black. The preview shows framing/focal faithfully; the bokeh (aperture) is applied on the real
// camera and is visible in the main viewport (Camera POV) after "Apply pose".
export default function MatchPreview({ azimuth, elevation, distance, focal, aspect }:
  { azimuth: number; elevation: number; distance: number; focal: number; aperture: number; aspect: number }) {
  const r = clamp(distance * 2, 1.6, 14);
  const theta = azimuth * Math.PI / 180;
  const phi = clamp((90 - elevation) * Math.PI / 180, 0.12, Math.PI - 0.12);
  const pos: [number, number, number] = [
    PIVOT.x + r * Math.sin(phi) * Math.sin(theta),
    PIVOT.y + r * Math.cos(phi),
    PIVOT.z + r * Math.sin(phi) * Math.cos(theta),
  ];
  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true }} style={{ width: '100%', height: '100%' }}
      onCreated={({ scene, gl }) => { scene.background = new THREE.Color(0x1a1e22); scene.fog = new THREE.Fog(0x1a1e22, 22, 48); gl.toneMappingExposure = 1.25; }}>
      <ambientLight intensity={0.55} color={0xd8dee6} />
      <hemisphereLight args={[0x6b7480, 0x2a2f35, 1.0]} />
      <spotLight position={[6, 9, 6]} angle={0.85} penumbra={0.5} intensity={4.6} distance={40} decay={1.2} color={0xfff4e6} />
      <directionalLight position={[-7, 4, -3]} intensity={0.8} color={0x9fb4cc} />
      <directionalLight position={[5, 4, 9]} intensity={1.0} color={0xf2f2f6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[26, 64]} /><meshStandardMaterial color={0x20252b} roughness={0.8} metalness={0.1} />
      </mesh>
      <Suspense fallback={null}><Content /></Suspense>
      <Rig pos={pos} focal={focal} aspect={aspect} />
    </Canvas>
  );
}
