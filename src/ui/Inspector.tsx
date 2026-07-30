import { useEffect, useState } from 'react';
import { S, DEFAULT_APERTURE } from '../store';
import { useRev } from './bits';
import Outliner from './Outliner';
import { evaluate, keysOf, EASE_LIST, EASES, round, poiPoint, clamp } from '../lib/eval';
import { applyPreset } from '../lib/presets';
import { IcTarget, IcEyedropper } from './icons';

import type { Camera, Channel, Ease, Keyframe, Vec3 } from '../types';

// Clickable keyframe marker: ◆ = key at playhead, dim ◆ = animated elsewhere, ◇ = no keys.
// Click toggles a key at the playhead for this channel; disabled when the channel is locked.
function KeyDot({ ch, value, disabled }: { ch: Channel; value: Vec3 | number; disabled?: boolean }) {
  const st = S(); const cam = st.active(); const t = st.project.timeline.playhead;
  const ks = keysOf(cam, ch);
  const at = ks.some(k => Math.abs(k.time - t) < 0.02);
  const cls = 'kf' + (disabled ? ' off' : at ? ' on' : ks.length ? ' anim' : '');
  return <button type="button" className={cls} disabled={disabled}
    title={disabled ? 'Locked' : at ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
    onClick={e => { e.stopPropagation(); st.toggleKeyAt(ch, value); }}>{at || ks.length ? '◆' : '◇'}</button>;
}

function Vec3Row({ label, value, step = 0.1, disabled, ch, onChange }:
  { label: string; value: number[]; step?: number; disabled?: boolean; ch: Channel; onChange: (i: number, v: number) => void }) {
  return (
    <div className={'row vec-row' + (disabled ? ' locked' : '')}>
      <span className="row-lead"><KeyDot ch={ch} value={value as Vec3} disabled={disabled} /><label>{label}</label></span>
      <div className="vec3">{['X', 'Y', 'Z'].map((lb, i) => (
        <input key={lb} type="number" step={step} value={round(value[i], 2)} onChange={e => onChange(i, parseFloat(e.target.value) || 0)} />
      ))}</div>
    </div>
  );
}


// Hand-editable numeric box: shows the (rounded) value; while focused it holds free text and commits
// a clamped value on blur / Enter, so typing isn't fought by the min/max clamp mid-keystroke.
function NumInput({ value, min, max, step, dec, onChange }:
  { value: number; min: number; max: number; step: number; dec: number; onChange: (v: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? String(round(value, dec));
  const commit = () => { if (txt !== null) { const v = parseFloat(txt); if (!isNaN(v)) onChange(clamp(v, min, max)); setTxt(null); } };
  return (
    <input className="val-input" type="number" min={min} max={max} step={step} value={shown}
      onChange={e => setTxt(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTxt(null); }} />
  );
}

function Slider({ label, value, min, max, step, unit, prefix, onChange, disabled, ch }:
  { label: string; value: number; min: number; max: number; step: number; unit?: string; prefix?: string; onChange: (v: number) => void; disabled?: boolean; ch?: Channel }) {
  const dec = step < 1 ? 1 : 0;
  return (
    <div className={'row' + (disabled ? ' locked' : '')}>
      <span className="row-lead">{ch ? <KeyDot ch={ch} value={value} disabled={disabled} /> : <span className="kf-spacer" />}<label>{label}</label></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} disabled={disabled} />
        <span className="val-box">
          {prefix && <span className="val-fix">{prefix}</span>}
          <NumInput value={value} min={min} max={max} step={step} dec={dec} onChange={onChange} />
          {unit && <span className="val-fix">{unit}</span>}
        </span>
      </div>
    </div>
  );
}

function EaseCurve({ ease }: { ease: Ease }) {
  const fn = EASES[ease] || EASES.linear; let d = ''; const N = 48;
  for (let i = 0; i <= N; i++) { const t = i / N; const y = fn(t); d += (i ? 'L' : 'M') + (t * 100).toFixed(1) + ',' + (100 - y * 100).toFixed(1) + ' '; }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={128}
      style={{ display: 'block', background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 6, marginTop: 8 }}>
      <line x1="0" y1="50" x2="100" y2="50" stroke="#1c2024" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1="50" y1="0" x2="50" y2="100" stroke="#1c2024" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={`${d} L100,100 L0,100 Z`} fill="rgba(242,163,60,0.14)" stroke="none" />
      <path d={d} fill="none" stroke="#f2a33c" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyInspector({ ks }: { ks: Keyframe[] }) {
  const st = S();
  const ids = ks.map(k => k.id);
  const single = ks.length === 1;
  const eases = new Set(ks.map(k => k.ease));
  const common = eases.size === 1 ? ks[0].ease : null; // null = mixed
  return (
    <div className="sect" style={{ background: 'var(--panel-2)' }}>
      {/* Time is edited on the timeline, value in the Transform panel below — this panel is the ease curve. */}
      <div className="sect-t">Speed curve presets{!single && <span className="st">{ks.length} keys</span>}{!single && common === null && <span className="st">mixed</span>}</div>
      <div className="ease-grid">
        {EASE_LIST.map(ez => <div key={ez} className={'ease-opt' + (common === ez ? ' sel' : '')} onClick={() => st.setKeysEase(ids, ez)}>{ez}</div>)}
      </div>
      <EaseCurve ease={common ?? ks[0].ease} />
      <button className="btn-sm danger btn-full" style={{ marginTop: 10 }} onClick={() => st.removeKeys(ids)}>{single ? 'Delete key' : `Delete ${ks.length} keys`}</button>
    </div>
  );
}

// Speed-curve presets for the WHOLE move — shown as soon as a camera has an animation (≥2 position
// keys) even with nothing selected. Applies the ease to every segment; selecting a key tunes just one.
function MoveCurve({ cam }: { cam: Camera }) {
  const st = S();
  const seg = keysOf(cam, 'position').slice(1); // each non-first key ends a segment (carries its ease)
  if (seg.length === 0) return null;
  const ids = seg.map(k => k.id);
  const eases = new Set(seg.map(k => k.ease));
  const common = eases.size === 1 ? seg[0].ease : null;
  return (
    <div className="sect" style={{ background: 'var(--panel-2)' }}>
      <div className="sect-t">Speed curve presets{common === null && <span className="st">mixed</span>}</div>
      <div className="ease-grid">
        {EASE_LIST.map(ez => <div key={ez} className={'ease-opt' + (common === ez ? ' sel' : '')} onClick={() => st.setKeysEase(ids, ez)}>{ez}</div>)}
      </div>
      <EaseCurve ease={common ?? seg[0].ease} />
      <p className="hint" style={{ marginTop: 6 }}>Applies to the whole move. Select a key on the timeline to tune one segment.</p>
    </div>
  );
}

// A small diagram illustrating each camera move. The filled dot is the target; arrows/paths show
// how the camera moves relative to it.
function MoveIcon({ kind }: { kind: string }) {
  const P = { viewBox: '0 0 28 28', width: 26, height: 26, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const dot = (x: number, y: number) => <circle cx={x} cy={y} r={1.8} fill="currentColor" stroke="none" />;
  switch (kind) {
    case 'orbit': return <svg {...P}>{dot(14, 14)}<circle cx={14} cy={14} r={8} /><path d="M14 6 l2.6 1.3 -1.6 2.5" /></svg>;
    case 'arc': return <svg {...P}>{dot(14, 19)}<path d="M6 19 A8 8 0 0 1 22 19" /><path d="M22 19 l-0.4 -2.9 -2.6 1.3" /></svg>;
    case 'pushIn': return <svg {...P}>{dot(22, 14)}<rect x={4} y={11} width={5} height={6} rx={1} /><line x1={10} y1={14} x2={18} y2={14} /><path d="M18 14 l-3 -2.2 M18 14 l-3 2.2" /></svg>;
    case 'pushOut': return <svg {...P}>{dot(22, 14)}<rect x={12} y={11} width={5} height={6} rx={1} /><line x1={11} y1={14} x2={4} y2={14} /><path d="M4 14 l3 -2.2 M4 14 l3 2.2" /></svg>;
    case 'craneUp': return <svg {...P}>{dot(14, 22)}<line x1={14} y1={21} x2={14} y2={7} /><path d="M14 7 l-2.4 3 M14 7 l2.4 3" /></svg>;
    case 'craneDown': return <svg {...P}>{dot(14, 6)}<line x1={14} y1={7} x2={14} y2={21} /><path d="M14 21 l-2.4 -3 M14 21 l2.4 -3" /></svg>;
    case 'rackFocus': return <svg {...P}>{dot(14, 14)}<circle cx={14} cy={14} r={6.5} /><path d="M14 3.5 v3 M14 21.5 v3 M3.5 14 h3 M21.5 14 h3" /></svg>;
    case 'dollyZoom': return <svg {...P}>{dot(14, 15)}<path d="M4 22 L10 8 L18 8 L24 22" /><path d="M14 22 v-4 M12 20 l2 2 2 -2" /></svg>;
    default: return null;
  }
}

// Movement presets, relative to the camera's target. Gated: you must target an asset first.
function CameraMoves({ cam }: { cam: Camera }) {
  const [dur, setDur] = useState(2.5);
  const [amp, setAmp] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [last, setLast] = useState<{ preset: string; d?: 1 | -1 } | null>(null);
  const targeted = cam.target?.type === 'object';
  const run = (preset: string, d?: 1 | -1) => { setLast({ preset, d }); applyPreset(preset, { duration: dur, amplitude: amp, ease: 'linear', dir: d ?? dir }); };
  // Live update: moving a slider (or flipping direction) re-applies the current preset so the effect is visible immediately.
  useEffect(() => { if (last) applyPreset(last.preset, { duration: dur, amplitude: amp, ease: 'linear', dir: last.d ?? dir }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dur, amp, dir]);
  const sliderRow = (label: string, v: number, min: number, max: number, step: number, disp: string, on: (n: number) => void) => (
    <div className="row"><span className="row-lead"><span className="kf-spacer" /><label>{label}</label></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        <input type="range" min={min} max={max} step={step} value={v} onChange={e => on(parseFloat(e.target.value))} />
        <span className="val" style={{ minWidth: 44, textAlign: 'right' }}>{disp}</span>
      </div>
    </div>
  );
  // preset → the applyPreset kind + fixed direction (Orbit/Arc use the Direction toggle)
  const MOVES: { key: string; label: string; preset: string; d?: 1 | -1 }[] = [
    { key: 'orbit', label: 'Orbit', preset: 'orbit' },
    { key: 'arc', label: 'Arc', preset: 'arc' },
    { key: 'pushIn', label: 'Push in', preset: 'dolly', d: 1 },
    { key: 'pushOut', label: 'Push out', preset: 'dolly', d: -1 },
    { key: 'craneUp', label: 'Crane up', preset: 'crane', d: 1 },
    { key: 'craneDown', label: 'Crane down', preset: 'crane', d: -1 },
    { key: 'rackFocus', label: 'Rack focus', preset: 'rackFocus' },
    { key: 'dollyZoom', label: 'Dolly zoom', preset: 'dollyZoom' },
  ];
  return (
    <div className="sect">
      <div className="sect-t">Camera moves</div>
      {!targeted ? (
        <>
          <div className="hint">① Target an asset to enable moves (orbit, push, crane…).</div>
          <button className="btn-sm btn-full" style={{ marginTop: 6, gap: 6 }} onClick={() => S().setTool('target')}><IcTarget size={13} /> Target an asset</button>
        </>
      ) : (
        <>
          {sliderRow('Duration', dur, 0.5, 8, 0.1, dur.toFixed(1) + 's', setDur)}
          {sliderRow('Amount', amp, 0.25, 2, 0.05, amp.toFixed(2) + '×', setAmp)}
          <div className="row"><span className="row-lead"><span className="kf-spacer" /><label>Direction</label></span>
            <div className="seg">
              <button className={dir === 1 ? 'sel' : ''} title="Clockwise" onClick={() => setDir(1)}>↻</button>
              <button className={dir === -1 ? 'sel' : ''} title="Counter-clockwise" onClick={() => setDir(-1)}>↺</button>
            </div>
          </div>
          <div className="move-grid">
            {MOVES.map(m => (
              <button key={m.key} className={'move-card' + (last?.preset === m.preset && (m.d ?? undefined) === (last?.d ?? undefined) ? ' sel' : '')} title={m.label}
                onClick={() => run(m.preset, m.d)}>
                <MoveIcon kind={m.key} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Inspector() {
  useRev();
  const st = S(); const cam = st.active();
  const selKeys = cam.keyframes.filter(k => st.ui.selectedKeyIds.includes(k.id));
  const p = evaluate(cam, st.project.timeline.playhead);
  return (
    <div id="inspector">
      <Outliner />

      {selKeys.length > 0 ? <KeyInspector ks={selKeys} /> : <MoveCurve cam={cam} />}

      <div className="sect">
        <div className="sect-t">Transform</div>
        <Vec3Row label="Position" ch="position" value={p.position} onChange={(i, v) => st.editPose('position', i, v)} />
        {cam.target && <div className="hint" style={{ margin: '2px 0' }}>⚿ Rotation driven by target</div>}
        <Vec3Row label="Rotation" ch="rotation" value={p.rotation} step={1} disabled={!!cam.target} onChange={(i, v) => st.editPose('rotation', i, v)} />
        <Vec3Row label="POI" ch="poi" value={poiPoint(cam, st.project.timeline.playhead)} disabled={cam.target?.type === 'object'} onChange={(i, v) => st.editPoi(i, v)} />
      </div>

      <div className="sect">
        <div className="sect-t">Optics</div>
        {/* Focal & aperture are static per shot — you don't change lens/aperture mid-move, so no keyframes. */}
        <Slider label="Focal" value={p.focalLength} min={14} max={200} step={1} prefix="mm" onChange={v => st.setOptic('focalLength', v)} />
        <Slider label="Aperture" value={p.aperture} min={1.4} max={16} step={0.1} prefix="f/" onChange={v => st.setOptic('aperture', v)} />
        {/* Motion blur is a global On/Off (like AE) with a non-animatable shutter — not a keyframable channel */}
        <div className="row">
          <span className="row-lead"><span className="kf-spacer" /><label>Motion blur</label></span>
          <button className={'btn-sm' + (st.ui.motionBlur ? ' amber' : '')} onClick={() => st.setMotionBlur(!st.ui.motionBlur)}>{st.ui.motionBlur ? 'On' : 'Off'}</button>
        </div>
        {st.ui.motionBlur && <Slider label="Shutter" value={cam.optics.motionBlurShutter} min={0} max={360} step={1} unit="°" onChange={v => st.setOptic('motionBlurShutter', v)} />}
        <div className="row">
          <span className="row-lead"><span className="kf-spacer" /><label>Focus</label></span>
          <span className="val">{cam.optics.focusPoint ? 'Picked' : 'General'}</span>
        </div>
        <div className="chip-row">
          <button className={'btn-sm' + (st.ui.focusPicking ? ' amber' : '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => st.setFocusPicking(!st.ui.focusPicking)}>
            <IcEyedropper size={13} /> {st.ui.focusPicking ? 'Picking…' : 'Pick focus'}
          </button>
          <button className={'btn-sm' + (cam.optics.focusPoint || cam.optics.aperture !== DEFAULT_APERTURE ? '' : ' locked')}
            title="General focus + default aperture" onClick={() => st.resetFocus()}>↺ Reset</button>
        </div>
      </div>

      <CameraMoves cam={cam} />

    </div>
  );
}
