import { useEffect, useLayoutEffect, useRef } from 'react';
import Scene from './three/Scene';
import Topbar from './ui/Topbar';
import Toolbar from './ui/Toolbar';
import Inspector from './ui/Inspector';
import Timeline from './ui/Timeline';
import Generators from './ui/Generators';
import HUD from './ui/HUD';
import ViewPills from './ui/ViewPills';
import Modals from './ui/Modals';
import { Toast, Loading } from './ui/Toast';
import ErrorBoundary from './ui/ErrorBoundary';
import SplineOverlay from './three/SplineOverlay';
import { S, useStore } from './store';
import { applyLutToCanvas } from './lib/lut';
import { R3 } from './three/shared';
import type { Tool } from './types';

export default function App() {
  const rev = useStore(s => s.rev);
  const frameRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const frame = frameRef.current, wrap = wrapRef.current; if (!frame || !wrap) return;
      const { width, height } = S().project.canvas; const ar = width / height;
      const availW = frame.clientWidth - 44, availH = frame.clientHeight - 44;
      let w = availW, h = w / ar; if (h > availH) { h = availH; w = h * ar; }
      wrap.style.width = Math.floor(w) + 'px'; wrap.style.height = Math.floor(h) + 'px';
    };
    R3.wrap = wrapRef.current; fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rev]);

  useEffect(() => { applyLutToCanvas(S().project); }, [rev]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const st = S();
      if (e.key === ' ') { e.preventDefault(); const tl = st.project.timeline; if (tl.playhead >= tl.duration) st.setPlayhead(0); st.setPlaying(!tl.playing); }
      const map: Record<string, Tool> = { v: 'select', c: 'camera', t: 'target', o: 'optics' };
      if (map[e.key]) st.setTool(map[e.key]);
      if (e.key === 'g') st.setTool(st.ui.tool === 'generators' ? 'select' : 'generators');
      if (e.key === 'r') st.setGizmoSpace(st.ui.gizmoSpace === 'world' ? 'local' : 'world');
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.ui.targetSelected && st.active().target) st.setTarget(null); // selected target badge → remove target
        else if (st.ui.selectedKeyIds.length) st.removeKeys(st.ui.selectedKeyIds);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div id="app">
      <Topbar />
      <Toolbar />
      <div id="stage">
        <div id="viewport-frame" ref={frameRef}>
          <div id="canvas-wrap" ref={wrapRef}>
            <ErrorBoundary label="Scene 3D">
              <Scene />
            </ErrorBoundary>
            <SplineOverlay />
          </div>
        </div>
        <HUD />
        <ViewPills />
        <Generators />
        <Loading />
      </div>
      <Inspector />
      <Timeline />
      <Modals />
      <Toast />
    </div>
  );
}
