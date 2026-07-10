import { useLayoutEffect, useRef, useState } from 'react';
import { S } from '../store';
import { useRev } from './bits';
import { CHANNELS, keysOf, round, clamp } from '../lib/eval';
import type { Channel } from '../types';

const PAD = 54, LANE_H = 30, TOP_H = 22;
const CH_COLOR: Record<Channel, string> = { position: '#5b9dd9', rotation: '#8f7bd0', focalLength: '#4fb477' };
const CH_LABEL: Record<Channel, string> = { position: 'POS', rotation: 'ROT', focalLength: 'FOCAL' };

export default function Timeline() {
  useRev();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 120 });
  const drag = useRef<{ mode: 'scrub' | 'key'; keyId?: string } | null>(null);

  useLayoutEffect(() => {
    const elm = wrapRef.current!; const ro = new ResizeObserver(() => setSize({ w: elm.clientWidth, h: elm.clientHeight }));
    ro.observe(elm); setSize({ w: elm.clientWidth, h: elm.clientHeight });
    return () => ro.disconnect();
  }, []);

  const st = S(); const cam = st.active(); const tl = st.project.timeline;
  const { w: W, h: H } = size; const dur = tl.duration;
  const x = (t: number) => PAD + (t / dur) * (W - PAD - 16);
  const laneY = (i: number) => TOP_H + 8 + i * LANE_H;
  const timeFromX = (px: number) => clamp(((px - PAD) / (W - PAD - 16)) * dur, 0, dur);

  const svgPt = (e: React.PointerEvent) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const onDown = (e: React.PointerEvent) => {
    const target = e.target as SVGElement; const keyId = target.getAttribute('data-key');
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    if (keyId) { drag.current = { mode: 'key', keyId }; S().selectKey(keyId); }
    else { drag.current = { mode: 'scrub' }; S().setPlayhead(timeFromX(svgPt(e).x)); }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return; const t = timeFromX(svgPt(e).x);
    if (drag.current.mode === 'scrub') S().setPlayhead(t);
    else if (drag.current.keyId) S().setKeyTime(drag.current.keyId, round(t, 3));
  };
  const onUp = () => { drag.current = null; };
  const onDbl = (e: React.MouseEvent) => { const id = (e.target as SVGElement).getAttribute('data-key'); if (id) S().removeKey(id); };

  const ticks: number[] = []; const step = dur <= 6 ? 0.5 : 1;
  for (let t = 0; t <= dur + 1e-6; t += step) ticks.push(t);

  const playing = tl.playing;
  return (
    <div id="timeline">
      <div className="tl-top">
        <div className="transport">
          <button className="tbtn-round" title="Début" onClick={() => { S().setPlayhead(0); S().setPlaying(false); }}>⇤</button>
          <button className={'tbtn-round' + (playing ? '' : ' play')} title="Lecture/Pause"
            onClick={() => { if (tl.playhead >= dur) S().setPlayhead(0); S().setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
          <button className="tbtn-round" title="Poser une clé au playhead" onClick={keyAtPlayhead}>◆</button>
        </div>
        <div className="time-read"><b>{tl.playhead.toFixed(2)}</b> / {dur.toFixed(2)}s</div>
        <div className="tl-spacer" />
        <div className="time-read" style={{ color: 'var(--ink-3)' }}>Clic : scrub · glisser une clé · double-clic : supprimer</div>
      </div>
      <div className="tl-wrap" ref={wrapRef}>
        <svg id="tl-svg" viewBox={`0 0 ${W} ${H}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDbl}>
          <rect x={0} y={0} width={W} height={TOP_H} fill="#101315" />
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={x(t)} y1={TOP_H - 5} x2={x(t)} y2={H} stroke="#1a1e21" />
              <text x={x(t) + 3} y={14} fill="#5f686f" fontSize={9} fontFamily="monospace">{t.toFixed(t % 1 ? 1 : 0)}s</text>
            </g>
          ))}
          {CHANNELS.map((ch, i) => {
            const y = laneY(i); const ks = keysOf(cam, ch); const locked = ch === 'rotation' && cam.target;
            return (
              <g key={ch}>
                <text x={8} y={y + LANE_H / 2 + 3} fill="#7a828a" fontSize={9} fontFamily="monospace">{CH_LABEL[ch]}</text>
                <line x1={PAD} y1={y + LANE_H - 1} x2={W - 16} y2={y + LANE_H - 1} stroke="#1a1e21" />
                {locked && <rect x={PAD} y={y} width={W - PAD - 16} height={LANE_H - 1} fill="rgba(242,163,60,.05)" />}
                {ks.length > 1 && <line x1={x(ks[0].time)} y1={y + LANE_H / 2} x2={x(ks[ks.length - 1].time)} y2={y + LANE_H / 2} stroke={CH_COLOR[ch]} strokeOpacity={0.4} strokeWidth={1.5} />}
                {ks.map(k => {
                  const kx = x(k.time), ky = y + LANE_H / 2; const sel = k.id === st.ui.selectedKeyId;
                  const fill = k.source !== 'manual' ? '#f2a33c' : CH_COLOR[ch];
                  return <rect key={k.id} data-key={k.id} x={kx - 7} y={ky - 7} width={14} height={14}
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
  );
}

function keyAtPlayhead() {
  const st = S(); const cam = st.active(); const t = st.project.timeline.playhead;
  const p = evaluatePose(cam, t);
  st.upsertKey('position', p.position, t, 'manual');
  if (!cam.target) st.upsertKey('rotation', p.rotation, t, 'manual');
}
import { evaluate as evaluatePose } from '../lib/eval';
