import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PIVOT, S, hasAnim } from '../store';
import { OBJECT_CENTERS, eulerFromLookAt, clamp } from '../lib/eval';
import type { Vec3 } from '../types';

const URL = '/asset/studio_packshot.gltf';

export default function Product() {
  const { scene } = useGLTF(URL);

  const data = useMemo(() => {
    scene.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 2.0 / Math.max(size.y, 1e-6);
    const pos: Vec3 = [-center.x * s, 0.5 - box.min.y * s, -center.z * s];
    const footR = clamp(Math.max(size.x, size.z) * s * 0.62, 0.6, 2.4);
    const centerY = 0.5 + (size.y * s) / 2;
    const maxDimS = Math.max(size.x, size.y, size.z) * s;
    return { s, pos, footR, centerY, maxDimS };
  }, [scene]);

  useEffect(() => {
    PIVOT.set(0, data.centerY, 0);
    OBJECT_CENTERS.product = [0, data.centerY, 0];
    OBJECT_CENTERS.pedestal = [0, 0.25, 0];
    const st = S(); const cam = st.active();
    if (!hasAnim(cam)) {
      const dist = Math.max(data.maxDimS * 2.2, 3.6);
      const dir = new THREE.Vector3(0.85, 0.5, 1.1).normalize();
      const p: Vec3 = [PIVOT.x + dir.x * dist, PIVOT.y + dir.y * dist, PIVOT.z + dir.z * dist];
      cam.transform.position = p;
      cam.transform.rotation = eulerFromLookAt(p, PIVOT.toArray() as Vec3);
      st.bump();
    }
  }, [data]);

  return (
    <group>
      <mesh position={[0, 0.25, 0]} scale={[data.footR / 1.15, 1, data.footR / 1.15]} castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.35, 0.5, 48]} />
        <meshStandardMaterial color="#1a1e22" roughness={0.6} metalness={0.3} />
      </mesh>
      <primitive object={scene} scale={data.s} position={data.pos} />
    </group>
  );
}
useGLTF.preload(URL);
