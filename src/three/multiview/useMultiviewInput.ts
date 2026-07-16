import { useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { S, upsertKeyOn } from '../../store';
import { keysOf, handleOffset, evaluate, poiPoint, round } from '../../lib/eval';
import type { Vec3 } from '../../types';
import { quadrantFor, subRectFor, ndcInSub, orthoCams, orthoState, planeAndAxesFor, type ViewId, type OrthoId, type SubRect } from './views';

type Kind = 'key' | 'in' | 'out' | 'camera' | 'camera-axis' | 'poi' | 'poi-axis';
type GizmoTag = { id?: string; kind: Kind; axis?: number };
type DragState = { id?: string; kind: Kind; axis?: number; viewId: ViewId };

// Single input owner for quad multiview: resolves the quadrant + its camera for every pointer
// event, picks gizmo handles in screen space, and drags them on the correct per-view plane.
// Replaces SceneGizmos' single-view drag while multiview is active.
export default function useMultiviewInput(sceneCamRef: RefObject<THREE.PerspectiveCamera | null>) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const dom = gl.domElement;
    const rc = new THREE.Raycaster();
    let drag: DragState | null = null;
    let pan: { id: OrthoId; lastX: number; lastY: number } | null = null;

    const active = () => S().ui.viewMode === 'scene' && S().ui.multiview;
    const camFor = (v: ViewId): THREE.Camera | null => (v === 'persp' ? sceneCamRef.current : orthoCams[v as OrthoId]);
    // scalar offset along world axis `ax` (through `ref`) of the point closest to the current ray
    const axisScalar = (ref: Vec3, ax: number): number => {
      const U = new THREE.Vector3(ax === 0 ? 1 : 0, ax === 1 ? 1 : 0, ax === 2 ? 1 : 0);
      const w0 = new THREE.Vector3(...ref).sub(rc.ray.origin);
      const bb = U.dot(rc.ray.direction), cc2 = rc.ray.direction.dot(rc.ray.direction);
      const denom = cc2 - bb * bb;
      return Math.abs(denom) < 1e-6 ? 0 : (bb * rc.ray.direction.dot(w0) - cc2 * U.dot(w0)) / denom;
    };
    const gizmos = (): THREE.Object3D[] => { const o: THREE.Object3D[] = []; scene.traverse(n => { if ((n.userData as { gizmo?: GizmoTag }).gizmo) o.push(n); }); return o; };

    // screen-space pick: nearest tagged gizmo within a px threshold, projected with the view camera
    const pick = (cam: THREE.Camera, sub: SubRect, cx: number, cy: number): GizmoTag | null => {
      let best: GizmoTag | null = null, bestD = 15;
      const wp = new THREE.Vector3();
      for (const m of gizmos()) {
        m.getWorldPosition(wp); const n = wp.clone().project(cam);
        if (n.z > 1) continue;
        const sx = sub.left + (n.x * 0.5 + 0.5) * sub.w, sy = sub.top + (-n.y * 0.5 + 0.5) * sub.h;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bestD) { bestD = d; best = (m.userData as { gizmo: GizmoTag }).gizmo; }
      }
      return best;
    };

    const down = (e: PointerEvent) => {
      if (!active()) return;
      const rect = dom.getBoundingClientRect();
      const { viewId, sub } = quadrantFor(e.clientX, e.clientY, rect);
      const cam = camFor(viewId); if (!cam) return;
      const hit = pick(cam, sub, e.clientX, e.clientY);
      if (hit) {
        drag = { ...hit, viewId };
        S().selectKey(hit.id ?? null); S().setGizmoDragging(true);
        try { dom.setPointerCapture(e.pointerId); } catch { /* best effort */ }
      } else if (viewId !== 'persp') {
        pan = { id: viewId as OrthoId, lastX: e.clientX, lastY: e.clientY };
      }
    };

    const move = (e: PointerEvent) => {
      if (drag) { applyDrag(e); return; }
      if (pan) {
        const st = orthoState[pan.id]; const cam = orthoCams[pan.id];
        const worldPerPx = (cam.top - cam.bottom) / subRectFor(pan.id, dom.getBoundingClientRect()).h;
        const dx = (e.clientX - pan.lastX) * worldPerPx, dy = (e.clientY - pan.lastY) * worldPerPx;
        pan.lastX = e.clientX; pan.lastY = e.clientY;
        // pan opposite to cursor, in the view's in-plane axes
        if (pan.id === 'top') { st.center.x -= dx; st.center.z -= dy; }
        else if (pan.id === 'front') { st.center.x -= dx; st.center.y += dy; }
        else { st.center.z += dx; st.center.y += dy; }
        S().bump();
      }
    };

    const applyDrag = (e: PointerEvent) => {
      const c = S().active();
      const d = drag!; const rect = dom.getBoundingClientRect();
      const sub = subRectFor(d.viewId, rect); const cam = camFor(d.viewId); if (!cam) return;
      rc.setFromCamera(ndcInSub(e.clientX, e.clientY, sub), cam);
      const p = new THREE.Vector3();

      // camera body: translate the camera pose at the playhead (upsert a key if animated)
      if (d.kind === 'camera') {
        const t = S().project.timeline.playhead;
        const ref = evaluate(c, t).position;
        const np = [...ref] as Vec3;
        if (d.viewId === 'persp') {
          if (e.shiftKey) {
            const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
            if (!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, new THREE.Vector3(...ref)), p)) return;
            np[1] = round(p.y, 3);
          } else {
            if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ref[1]), p)) return;
            np[0] = round(p.x, 3); np[2] = round(p.z, 3);
          }
        } else {
          const { plane, axes } = planeAndAxesFor(d.viewId as OrthoId, ref);
          if (!rc.ray.intersectPlane(plane, p)) return;
          const world = [p.x, p.y, p.z]; axes.forEach(a => { np[a] = round(world[a], 3); });
        }
        if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', np, t, 'manual'); else c.transform.position = np;
        S().bump();
        return;
      }

      // camera axis arrow: translate the camera along one world axis
      if (d.kind === 'camera-axis') {
        const t = S().project.timeline.playhead;
        const ref = evaluate(c, t).position; const ax = d.axis ?? 0;
        const s = axisScalar(ref, ax);
        const np = [...ref] as Vec3; np[ax] = round(ref[ax] + s, 3);
        if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', np, t, 'manual'); else c.transform.position = np;
        S().bump();
        return;
      }

      // point of interest: move the look-at point at the playhead
      if (d.kind === 'poi') {
        const t = S().project.timeline.playhead;
        if (c.target?.type === 'object') return; // aim locked by an object target
        if (!c.target || c.target.type !== 'point') S().setTarget({ type: 'point', point: [...poiPoint(c, t)] as Vec3 });
        const cc = S().active(); const ref = poiPoint(cc, t); const np = [...ref] as Vec3;
        if (d.viewId === 'persp') {
          if (e.shiftKey) {
            const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
            if (!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, new THREE.Vector3(...ref)), p)) return;
            np[1] = round(p.y, 3);
          } else {
            if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ref[1]), p)) return;
            np[0] = round(p.x, 3); np[2] = round(p.z, 3);
          }
        } else {
          const { plane, axes } = planeAndAxesFor(d.viewId as OrthoId, ref);
          if (!rc.ray.intersectPlane(plane, p)) return;
          const world = [p.x, p.y, p.z]; axes.forEach(a => { np[a] = round(world[a], 3); });
        }
        if (keysOf(cc, 'poi').length) upsertKeyOn(cc, 'poi', np, t, 'manual'); else if (cc.target?.type === 'point') cc.target.point = np;
        S().bump();
        return;
      }

      // POI axis arrow: constrain movement to a single world axis (closest point on the axis to the ray)
      if (d.kind === 'poi-axis') {
        const t = S().project.timeline.playhead;
        if (c.target?.type === 'object') return;
        if (!c.target || c.target.type !== 'point') S().setTarget({ type: 'point', point: [...poiPoint(c, t)] as Vec3 });
        const cc = S().active(); const ref = poiPoint(cc, t); const ax = d.axis ?? 0;
        const np = [...ref] as Vec3; np[ax] = round(ref[ax] + axisScalar(ref, ax), 3);
        if (keysOf(cc, 'poi').length) upsertKeyOn(cc, 'poi', np, t, 'manual'); else if (cc.target?.type === 'point') cc.target.point = np;
        S().bump();
        return;
      }

      const k = c.keyframes.find(x => x.id === d.id); if (!k || !Array.isArray(k.value)) return;
      const kv = k.value as Vec3;
      const pk = keysOf(c, 'position'); const idx = pk.findIndex(x => x.id === k.id);
      const curOff = d.kind === 'key' ? ([0, 0, 0] as Vec3) : handleOffset(pk, idx, d.kind as 'in' | 'out');

      const which = d.kind as 'in' | 'out';
      if (d.viewId === 'persp') {
        if (e.shiftKey) {
          const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
          const anchor = d.kind === 'key' ? new THREE.Vector3(...kv) : new THREE.Vector3(kv[0] + curOff[0], kv[1] + curOff[1], kv[2] + curOff[2]);
          if (!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, anchor), p)) return;
          if (d.kind === 'key') S().setKeyValueComp(k.id, 1, round(p.y, 3));
          else S().setKeyTangent(k.id, which, [curOff[0], round(p.y - kv[1], 3), curOff[2]]);
        } else {
          if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -kv[1]), p)) return;
          if (d.kind === 'key') { S().setKeyValueComp(k.id, 0, round(p.x, 3)); S().setKeyValueComp(k.id, 2, round(p.z, 3)); }
          else S().setKeyTangent(k.id, which, [round(p.x - kv[0], 3), curOff[1], round(p.z - kv[2], 3)]);
        }
        return;
      }
      // orthographic view: plane + the two in-plane axes it edits
      const { plane, axes } = planeAndAxesFor(d.viewId as OrthoId, kv);
      if (!rc.ray.intersectPlane(plane, p)) return;
      const world = [p.x, p.y, p.z];
      if (d.kind === 'key') { axes.forEach(a => S().setKeyValueComp(k.id, a, round(world[a], 3))); }
      else { const off = curOff.slice() as Vec3; axes.forEach(a => { off[a] = round(world[a] - kv[a], 3); }); S().setKeyTangent(k.id, which, off); }
    };

    const up = () => { if (drag) { drag = null; S().setGizmoDragging(false); } pan = null; };
    const wheel = (e: WheelEvent) => {
      if (!active()) return;
      const rect = dom.getBoundingClientRect();
      const { viewId } = quadrantFor(e.clientX, e.clientY, rect);
      if (viewId === 'persp') return; // perspective zoom handled elsewhere
      e.preventDefault();
      const st = orthoState[viewId as OrthoId];
      st.halfHeight = Math.min(60, Math.max(0.4, st.halfHeight * (1 + e.deltaY * 0.0012)));
      S().bump();
    };

    dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    return () => {
      dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
    };
  }, [gl, scene, sceneCamRef]);
}
