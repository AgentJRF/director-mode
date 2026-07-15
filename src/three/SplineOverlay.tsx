import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { R3 } from './shared';
import { S } from '../store';
import { keysOf, evalChannel, poiPoint, lerp, round } from '../lib/eval';
import type { Vec3 } from '../types';

export default function SplineOverlay() {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragKey = useRef<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const project = (v: Vec3) => {
      const cam = R3.cam!, wrap = R3.wrap!;
      const p = new THREE.Vector3(...v).project(cam);
      return { x: (p.x * 0.5 + 0.5) * wrap.clientWidth, y: (-p.y * 0.5 + 0.5) * wrap.clientHeight, z: p.z };
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const svg = svgRef.current, cam = R3.cam, wrap = R3.wrap; if (!svg || !cam || !wrap) return;
      const st = S();
      if (st.ui.viewMode !== 'camera') { if (svg.innerHTML) svg.innerHTML = ''; return; }
      svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
      const c = st.active(); const tool = st.ui.tool; let out = '';
      const pk = keysOf(c, 'position');
      if (pk.length >= 2 && (tool === 'select' || tool === 'camera')) {
        let d = ''; const N = 48;
        for (let i = 0; i <= N; i++) { const t = lerp(pk[0].time, pk[pk.length - 1].time, i / N); const s = project(evalChannel(c, 'position', t) as Vec3); d += (i ? 'L' : 'M') + s.x.toFixed(1) + ',' + s.y.toFixed(1) + ' '; }
        out += `<path d="${d}" fill="none" stroke="#f2a33c" stroke-width="1.5" stroke-opacity="0.7"/>`;
        pk.forEach(k => { const s = project(k.value as Vec3); if (s.z < 1) { const sel = st.ui.selectedKeyIds.includes(k.id); out += `<circle class="handle" data-key="${k.id}" cx="${s.x}" cy="${s.y}" r="6" fill="${sel ? '#fff' : '#f2a33c'}" stroke="#000" stroke-opacity="0.5"/>`; } });
      }
      if (c.target && c.target.type === 'point') { const s = project(poiPoint(c, st.project.timeline.playhead)); if (s.z < 1) out += `<g><circle cx="${s.x}" cy="${s.y}" r="10" fill="none" stroke="#5b9dd9" stroke-width="1.5"/><line x1="${s.x - 14}" y1="${s.y}" x2="${s.x + 14}" y2="${s.y}" stroke="#5b9dd9"/><line x1="${s.x}" y1="${s.y - 14}" x2="${s.x}" y2="${s.y + 14}" stroke="#5b9dd9"/></g>`; }
      svg.innerHTML = out;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const raycastPlane = (e: React.PointerEvent, planeY: number) => {
    const cam = R3.cam!, svg = svgRef.current!; const r = svg.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY); const pt = new THREE.Vector3();
    return rc.ray.intersectPlane(plane, pt) ? pt : null;
  };
  const onDown = (e: React.PointerEvent) => {
    const id = (e.target as SVGElement).getAttribute('data-key'); if (!id) return;
    e.stopPropagation(); dragKey.current = id; S().selectKey(id); svgRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragKey.current) return; const st = S(); const k = st.active().keyframes.find(k => k.id === dragKey.current); if (!k || !Array.isArray(k.value)) return;
    const y = k.value[1]; const p = raycastPlane(e, y); if (p) { st.setKeyValueComp(k.id, 0, round(p.x, 3)); st.setKeyValueComp(k.id, 2, round(p.z, 3)); }
  };
  const onUp = () => { dragKey.current = null; };

  return <svg id="overlay-svg" ref={svgRef} preserveAspectRatio="none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />;
}
