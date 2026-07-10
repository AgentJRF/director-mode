import { useLayoutEffect, useRef, useState } from 'react';
import { S } from '../store';
import { useRev } from './bits';
import { CHANNELS, keysOf, clamp, evaluate } from '../lib/eval';
import { toTimecode, snapToFrame, niceFrameStep } from '../lib/time';
import type { Channel } from '../types';

const LANE_H = 24, TOP_H = 20, LEFT = 8, RIGHT = 24;
const H = TOP_H + 8 + CHANNELS.length * LANE_H + 4;
const CH_COLOR: Record<Channel, string> = { position: '#5b9dd9', rotation: '#8f7bd0', focalLength: '#4fb477' };
const CH_LABEL: Record<Channel, string> = { position: 'POS', rotation: 'ROT', focalLength: 'FOCAL' };
const FPS_CHOICES = [24, 25, 30, 60];

export default function Timeline() {
  useRev();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [durUnit, setDurUnit] = useState<'s' | 'f'>('s');
  const drag = useRef<{ mode: 'scrub' | 'key'; keyId?: string } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current!; const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el); setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const st = S(); const cam = st.active(); const tl = st.project.timeline; const fps = st.project.fps;
  const dur = tl.duration;
  const fitPxPerSec = Math.max(4, (viewW - LEFT - RIGHT) / dur);
  const pxPerSec = fitPxPerSec * zoom;
  const contentW = Math.max(viewW, LEFT + dur * pxPerSec + RIGHT);
  const x = (t: number) => LEFT + t * pxPerSec;
  const timeFromX = (px: number) => clamp((px - LEFT) / pxPerSec, 0, dur);
  const snap = (t: number) => snapToFrame(t, fps);

  // virtualised ruler ticks
  const pxPerFrame = pxPerSec / fps;
  const minorStep = niceFrameStep(pxPerFrame, fps, 6);
  const labelStep = niceFrameStep(pxPerFrame, fps, 70);
  const durFrames = Math.round(dur * fps);
  const fFrom = Math.max(0, Math.floor((scrollLeft - LEFT - 40) / pxPerFrame));
  const fTo = Math.min(durFrames, Math.ceil((scrollLeft + viewW - LEFT + 40) / pxPerFrame));
  const ticks: { f: number; label: boolean }[] = [];
  for (let f = Math.floor(fFrom / minorStep) * minorStep; f <= fTo; f += minorStep) {
    if (f < 0) continue; ticks.push({ f, label: f % labelStep === 0 });
  }

  const svgPx = (e: React.PointerEvent) => e.clientX - (e.currentTarget as SVGElement).getBoundingClientRect().left;
  const onDown = (e: React.PointerEvent) => {
    const keyId = (e.target as SVGElement).getAttribute('data-key');
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
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

  const laneY = (i: number) => TOP_H + 8 + i * LANE_H;
  const playing = tl.playing;
  const durInputVal = durUnit === 's' ? +dur.toFixed(2) : Math.round(dur * fps);

  return (
    <div id="timeline">
      <div className="tl-top">
        <div className="transport">
          <button className="tbtn-round" title="Début" onClick={() => { S().setPlayhead(0); S().setPlaying(false); }}>⇤</button>
          <button className={'tbtn-round' + (playing ? '' : ' play')} title="Lecture/Pause"
            onClick={() => { if (tl.playhead >= dur) S().setPlayhead(0); S().setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
          <button className="tbtn-round" title="Poser une clé au playhead" onClick={keyAtPlayhead}>◆</button>
          <button className="tbtn-round" title="Supprimer la clé sélectionnée (Suppr)"
            style={{ opacity: st.ui.selectedKeyId ? 1 : 0.4 }}
            onClick={() => { if (st.ui.selectedKeyId) S().removeKey(st.ui.selectedKeyId); }}>🗑</button>
        </div>
        <span className="tc mono" title="Timecode H;MM;SS;FF">{toTimecode(tl.playhead, fps)}</span>
        <div className="tl-spacer" />
        <label className="tl-field">fps
          <select value={fps} onChange={e => S().setFps(+e.target.value)}>
            {FPS_CHOICES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="tl-field">Durée
          <input type="number" min={durUnit === 's' ? 0.1 : 1} step={durUnit === 's' ? 0.1 : 1} value={durInputVal}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) S().setDuration(durUnit === 's' ? v : v / fps); }} style={{ width: 60 }} />
          <div className="seg" style={{ marginLeft: 4 }}>
            <button className={durUnit === 's' ? 'sel' : ''} onClick={() => setDurUnit('s')}>s</button>
            <button className={durUnit === 'f' ? 'sel' : ''} onClick={() => setDurUnit('f')}>f</button>
          </div>
        </label>
      </div>

      <div className="tl-body" style={{ height: H }}>
        <div className="tl-gutter">
          {CHANNELS.map((ch, i) => (
            <div key={ch} className="gl" style={{ top: laneY(i) + LANE_H / 2 - 6 }}>{CH_LABEL[ch]}</div>
          ))}
        </div>
        <div className="tl-scroll" ref={scrollRef} onScroll={e => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}>
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
            {CHANNELS.map((ch, i) => {
              const y = laneY(i); const ks = keysOf(cam, ch); const locked = ch === 'rotation' && cam.target;
              return (
                <g key={ch}>
                  <line x1={0} y1={y + LANE_H - 1} x2={contentW} y2={y + LANE_H - 1} stroke="#1a1e21" />
                  {locked && <rect x={0} y={y} width={contentW} height={LANE_H - 1} fill="rgba(242,163,60,.05)" />}
                  {ks.length > 1 && <line x1={x(ks[0].time)} y1={y + LANE_H / 2} x2={x(ks[ks.length - 1].time)} y2={y + LANE_H / 2} stroke={CH_COLOR[ch]} strokeOpacity={0.4} strokeWidth={1.5} />}
                  {ks.map(k => {
                    const kx = x(k.time), ky = y + LANE_H / 2; const sel = k.id === st.ui.selectedKeyId;
                    const fill = k.source !== 'manual' ? '#f2a33c' : CH_COLOR[ch];
                    return <rect key={k.id} data-key={k.id} x={kx - 6} y={ky - 6} width={12} height={12}
                      transform={`rotate(45 ${kx} ${ky})`} fill={fill} fillOpacity={sel ? 1 : 0.85}
                      stroke={sel ? '#fff' : '#000'} strokeOpacity={sel ? 0.9 : 0.3} strokeWidth={sel ? 1.5 : 1} style={{ cursor: 'grab' }} />;
                  })}
                </g>
              );
            })}
            <line x1={x(tl.playhead)} y1={0} x2={x(tl.playhead)} y2={H} stroke="#f2a33c" strokeWidth={1.5} />
            <path d={`M${x(tl.playhead) - 6},0 L${x(tl.playhead) + 6},0 L${x(tl.playhead)},9 Z`} fill="#f2a33c" />
          </svg>
        </div>
      </div>

      <div className="tl-zoom">
        <span className="time-read" style={{ color: 'var(--ink-3)', marginRight: 'auto' }}>Clic : scrub · glisser une clé · Suppr / double-clic : supprimer · snap à la frame</span>
        <span className="mtn">▁</span>
        <input type="range" min={1} max={30} step={0.1} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} title="Zoom timeline" />
        <span className="mtn" style={{ fontSize: 15 }}>▂▄█</span>
        <button className="btn-sm" title="Ajuster à la vue" onClick={() => setZoom(1)}>Fit</button>
      </div>
    </div>
  );
}

function keyAtPlayhead() {
  const st = S(); const cam = st.active(); const t = st.project.timeline.playhead;
  const p = evaluate(cam, t);
  st.upsertKey('position', p.position, t, 'manual');
  if (!cam.target) st.upsertKey('rotation', p.rotation, t, 'manual');
}
