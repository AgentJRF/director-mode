import { useLayoutEffect, useRef, useState } from 'react';
import { S } from '../store';
import { useRev } from './bits';
import { clamp, evaluate, keysOf, poiPoint } from '../lib/eval';
import { toTimecode, snapToFrame, niceFrameStep } from '../lib/time';
import type { Channel, Keyframe } from '../types';

const TRACK_H = 34, ROW_H = 18, GAP = 8, TOP_H = 22, LEFT = 8, RIGHT = 24;
const PLAYHEAD = '#29b6f6';

type RowDef = { label: string; ch: Channel; lock?: boolean };

export default function Timeline() {
  useRev();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [durUnit, setDurUnit] = useState<'s' | 'f'>('s');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const drag = useRef<{ mode: 'scrub' | 'key'; keyId?: string } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current!; const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el); setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const st = S(); const proj = st.project; const cams = proj.cameras.filter(c => !st.ui.hidden['cam:' + c.id]); const tl = proj.timeline; const fps = proj.fps;
  const dur = tl.duration;
  const fitPxPerSec = Math.max(4, (viewW - LEFT - RIGHT) / dur);
  const pxPerSec = fitPxPerSec * zoom;
  const contentW = Math.max(viewW, LEFT + dur * pxPerSec + RIGHT);
  const x = (t: number) => LEFT + t * pxPerSec;
  const barW = Math.max(6, dur * pxPerSec);
  const timeFromX = (px: number) => clamp((px - LEFT) / pxPerSec, 0, dur);
  const snap = (t: number) => snapToFrame(t, fps);

  const rowsFor = (c: typeof cams[number]): RowDef[] => ([
    { label: 'Point of Interest', ch: 'poi', lock: c.target?.type === 'object' },
    { label: 'Position', ch: 'position' },
    { label: 'Orientation', ch: 'rotation', lock: !!c.target },
    { label: 'Focal length', ch: 'focalLength' },
  ]);

  let yCur = TOP_H + 8;
  const layout = cams.map(c => {
    const headerY = yCur; yCur += TRACK_H;
    const exp = !!expanded[c.id];
    const defs = exp ? rowsFor(c) : [];
    const rows = defs.map(def => { const ry = yCur; yCur += ROW_H; return { def, ry }; });
    yCur += GAP;
    return { c, headerY, exp, rows };
  });
  const H = yCur + 4;

  const pxPerFrame = pxPerSec / fps;
  const minorStep = niceFrameStep(pxPerFrame, fps, 6);
  const labelStep = niceFrameStep(pxPerFrame, fps, 70);
  const durFrames = Math.round(dur * fps);
  const fFrom = Math.max(0, Math.floor((scrollLeft - LEFT - 40) / pxPerFrame));
  const fTo = Math.min(durFrames, Math.ceil((scrollLeft + viewW - LEFT + 40) / pxPerFrame));
  const ticks: { f: number; label: boolean }[] = [];
  for (let f = Math.floor(fFrom / minorStep) * minorStep; f <= fTo; f += minorStep) { if (f >= 0) ticks.push({ f, label: f % labelStep === 0 }); }

  const svgPx = (e: React.PointerEvent) => e.clientX - (e.currentTarget as SVGElement).getBoundingClientRect().left;
  const onDown = (e: React.PointerEvent) => {
    const el = e.target as SVGElement;
    const toggle = el.getAttribute('data-toggle');
    if (toggle) { setExpanded(x0 => ({ ...x0, [toggle]: !x0[toggle] })); return; }
    const keyId = el.getAttribute('data-key'); const camId = el.getAttribute('data-cam');
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    if (camId && camId !== proj.activeCameraId) S().selectCamera(camId);
    if (keyId) { drag.current = { mode: 'key', keyId }; S().selectKey(keyId); }
    else { drag.current = { mode: 'scrub' }; S().setPlayhead(snap(timeFromX(svgPx(e)))); }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return; const t = snap(timeFromX(svgPx(e)));
    if (drag.current.mode === 'scrub') S().setPlayhead(t);
    else if (drag.current.keyId) S().setKeyTime(drag.current.keyId, t);
  };
  const onUp = () => { drag.current = null; };
  const onDbl = (e: React.MouseEvent) => { const id = (e.target as SVGElement).getAttribute('data-key'); if (id) S().removeKey(id); };

  const diamond = (k: Keyframe, cx: number, cy: number, camId: string, half: number) => {
    const sel = k.id === st.ui.selectedKeyId;
    return <rect key={k.id} data-key={k.id} data-cam={camId} x={cx - half} y={cy - half} width={half * 2} height={half * 2}
      transform={`rotate(45 ${cx} ${cy})`} fill="#f5c400" stroke={sel ? '#ffffff' : '#8a6d00'} strokeWidth={sel ? 1.6 : 1} style={{ cursor: 'grab' }} />;
  };

  const playing = tl.playing;
  const durInputVal = durUnit === 's' ? +dur.toFixed(2) : Math.round(dur * fps);
  const phx = x(tl.playhead);

  return (
    <div id="timeline">
      <div className="tl-top">
        <div className="transport">
          <button className="tbtn-round" title="Start" onClick={() => { S().setPlayhead(0); S().setPlaying(false); }}>⇤</button>
          <button className={'tbtn-round' + (playing ? '' : ' play')} title="Play/Pause"
            onClick={() => { if (tl.playhead >= dur) S().setPlayhead(0); S().setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
          <button className="tbtn-round" title="Add key at playhead" onClick={keyAtPlayhead}>◆</button>
          <button className="tbtn-round" title="Delete selected key (Del)"
            style={{ opacity: st.ui.selectedKeyId ? 1 : 0.4 }}
            onClick={() => { if (st.ui.selectedKeyId) S().removeKey(st.ui.selectedKeyId); }}>🗑</button>
        </div>
        <span className="tc mono" title="Timecode H;MM;SS;FF">{toTimecode(tl.playhead, fps)}</span>
        <div className="tl-spacer" />
        <label className="tl-field">fps
          <select value={fps} onChange={e => S().setFps(+e.target.value)}>
            {[24, 25, 30, 60].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="tl-field">Duration
          <input type="number" min={durUnit === 's' ? 0.1 : 1} step={durUnit === 's' ? 0.1 : 1} value={durInputVal}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) S().setDuration(durUnit === 's' ? v : v / fps); }} style={{ width: 60 }} />
          <div className="seg" style={{ marginLeft: 4 }}>
            <button className={durUnit === 's' ? 'sel' : ''} onClick={() => setDurUnit('s')}>s</button>
            <button className={durUnit === 'f' ? 'sel' : ''} onClick={() => setDurUnit('f')}>f</button>
          </div>
        </label>
      </div>

      <div className="tl-scroll" ref={scrollRef} style={{ flex: 1 }} onScroll={e => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}>
        <svg id="tl-svg" width={contentW} height={H} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDbl}>
          <rect x={0} y={0} width={contentW} height={TOP_H} fill="#101315" />
          {ticks.map(({ f, label }) => {
            const px = x(f / fps);
            return (
              <g key={f}>
                <line x1={px} y1={label ? TOP_H - 8 : TOP_H - 4} x2={px} y2={label ? H : TOP_H} stroke={label ? '#232a2f' : '#1a1e21'} />
                {label && <text x={px + 3} y={13} fill="#6b747c" fontSize={9} fontFamily="monospace">{toTimecode(f / fps, fps)}</text>}
              </g>
            );
          })}

          {layout.map(({ c, headerY, exp, rows }) => {
            const cy = headerY + TRACK_H / 2; const active = c.id === proj.activeCameraId;
            const ks = c.keyframes;
            return (
              <g key={c.id}>
                <rect data-cam={c.id} x={LEFT} y={headerY} width={barW} height={TRACK_H} rx={9}
                  fill={active ? '#a64ce0' : '#4a3a5c'} style={{ cursor: 'pointer' }} />
                {/* collapsed: one small rectangle per keyframe time (merged) to locate the keys */}
                {!exp && [...new Set(ks.map(k => Math.round(k.time * 1000)))].map(ms => {
                  const kx = x(ms / 1000);
                  return <rect key={ms} x={kx - 3} y={headerY + 9} width={6} height={TRACK_H - 18} rx={2}
                    fill="#f5c400" stroke="#8a6d00" strokeWidth={1} pointerEvents="none" />;
                })}
                <text x={LEFT + 12} y={cy + 4} fill={active ? '#f4ebfb' : '#c3b3d1'} fontSize={11} pointerEvents="none">{exp ? '▾' : '▸'}</text>
                <text x={LEFT + 28} y={cy + 4} fill={active ? '#f4ebfb' : '#c3b3d1'} fontSize={12} pointerEvents="none">{c.name}</text>
                <rect data-toggle={c.id} x={LEFT} y={headerY} width={24} height={TRACK_H} fill="none" pointerEvents="all" style={{ cursor: 'pointer' }} />

                {exp && rows.length > 0 && <rect x={LEFT} y={rows[0].ry - 2} width={barW} height={rows.length * ROW_H + 4} rx={6} fill="rgba(166,76,224,0.10)" />}
                {rows.map(({ def, ry }) => {
                  const rcy = ry + ROW_H / 2;
                  const grey = !!def.lock;
                  return (
                    <g key={def.label}>
                      <text x={LEFT + 30} y={rcy + 3} fill={grey ? '#6b6270' : '#9aa3ab'} fontSize={10}>{def.label}{def.lock ? ' ⚿' : ''}</text>
                      <line x1={LEFT} y1={ry + ROW_H - 1} x2={LEFT + barW} y2={ry + ROW_H - 1} stroke="#2a2130" />
                      {keysOf(c, def.ch).map(k => diamond(k, x(k.time), rcy, c.id, 5))}
                    </g>
                  );
                })}
              </g>
            );
          })}

          <line x1={phx} y1={TOP_H - 4} x2={phx} y2={H} stroke={PLAYHEAD} strokeWidth={1.5} />
          <path d={`M${phx - 8},${TOP_H - 12} L${phx + 8},${TOP_H - 12} L${phx},${TOP_H - 1} Z`} fill={PLAYHEAD} />
        </svg>
      </div>

      <div className="tl-zoom">
        <span className="mtn" style={{ marginLeft: 'auto' }}>▁</span>
        <input type="range" min={1} max={30} step={0.1} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} title="Zoom timeline" />
        <span className="mtn" style={{ fontSize: 13 }}>▂▄█</span>
        <button className="btn-sm tl-fit" title="Fit to view" onClick={() => setZoom(1)}>Fit</button>
      </div>
    </div>
  );
}

function keyAtPlayhead() {
  const st = S(); const cam = st.active(); const t = st.project.timeline.playhead;
  const p = evaluate(cam, t);
  st.upsertKey('position', p.position, t, 'manual');
  if (!cam.target) st.upsertKey('rotation', p.rotation, t, 'manual');
  else if (cam.target.type === 'point') st.upsertKey('poi', poiPoint(cam, t), t, 'manual');
}
