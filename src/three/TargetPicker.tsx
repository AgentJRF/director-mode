import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useStore, S } from '../store';
import type { Vec3 } from '../types';

// Target picker: with the Target tool active, clicking the viewport sets the camera's
// look-at target to the clicked object (product / pedestal) or to a free point (floor).
export default function TargetPicker() {
  const { gl, camera, scene } = useThree();
  useStore(s => s.rev);
  const active = S().ui.tool === 'target';

  useEffect(() => {
    if (!active) return;
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const down = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const targets: THREE.Object3D[] = [];
      scene.traverse(o => { if ((o as any).isMesh && o.userData.focusPickable) targets.push(o); });
      const hits = rc.intersectObjects(targets, false);
      if (!hits.length) return;
      let o: THREE.Object3D | null = hits[0].object; let objectId: string | undefined;
      while (o) { if (o.userData && o.userData.objectId) { objectId = o.userData.objectId; break; } o = o.parent; }
      if (objectId) { S().setTarget({ type: 'object', objectId }); S().toast('Target: ' + objectId); }
      else { const p = hits[0].point; S().setTarget({ type: 'point', point: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] as Vec3 }); S().toast('Target: free point'); }
    };
    dom.style.cursor = 'crosshair';
    dom.addEventListener('pointerdown', down);
    return () => { dom.removeEventListener('pointerdown', down); dom.style.cursor = ''; };
  }, [active, gl, camera, scene]);

  return null;
}
