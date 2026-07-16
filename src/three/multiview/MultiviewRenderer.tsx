import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { PIVOT } from '../../store';
import { orthoState, configOrtho, orthoCams } from './views';
import useMultiviewInput from './useMultiviewInput';

// Takes over the render loop (useFrame priority 1 disables r3f auto-render) and paints the single
// shared scene into four scissored quadrants with four cameras. Mounted only while multiview is on;
// on unmount, r3f resumes normal single-camera rendering.
export default function MultiviewRenderer({ sceneCamRef }: { sceneCamRef: RefObject<THREE.PerspectiveCamera | null> }) {
  const { gl, scene, size } = useThree();
  const orthos = orthoCams;
  useMultiviewInput(sceneCamRef);

  // frame the ortho views on the product pivot once on entry
  useEffect(() => {
    orthoState.top.center.set(PIVOT.x, 0, PIVOT.z);
    orthoState.front.center.set(PIVOT.x, PIVOT.y, 0);
    orthoState.side.center.set(0, PIVOT.y, PIVOT.z);
  }, []);

  // restore full viewport / scissor state when leaving multiview
  useEffect(() => () => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.setScissor(0, 0, size.width, size.height);
    gl.autoClear = true;
  }, [gl, size.width, size.height]);

  useFrame(() => {
    const persp = sceneCamRef.current; if (!persp) return;
    const w = size.width, h = size.height;
    const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
    const aspect = hw / hh;

    configOrtho(orthos.top, 'top', aspect);
    configOrtho(orthos.front, 'front', aspect);
    configOrtho(orthos.side, 'side', aspect);
    persp.aspect = aspect; persp.updateProjectionMatrix();

    gl.autoClear = false;
    gl.setScissorTest(false);
    gl.clear(); // clear whole framebuffer once (scissor off)
    gl.setScissorTest(true);

    // GL viewport origin is bottom-left → top row sits at y=hh, bottom row at y=0.
    const quads: [THREE.Camera, number, number][] = [
      [persp, 0, hh],        // TL  Perspective
      [orthos.top, hw, hh],  // TR  Top
      [orthos.front, 0, 0],  // BL  Front
      [orthos.side, hw, 0],  // BR  Side
    ];
    for (const [cam, x, y] of quads) {
      gl.setViewport(x, y, hw, hh);
      gl.setScissor(x, y, hw, hh);
      gl.render(scene, cam);
    }

    gl.setScissorTest(false);
    gl.setViewport(0, 0, w, h);
    gl.autoClear = true;
  }, 1);

  return null;
}
