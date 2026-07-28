import { useState } from 'react';
import { S, DEFAULT_APERTURE } from '../store';
import { useRev } from './bits';
import Outliner from './Outliner';
import { evaluate, keysOf, EASE_LIST, EASES, round, poiPoint } from '../lib/eval';
import { applyPreset } from '../lib/presets';

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

const CH_LABEL: Record<Channel, string> = { position: 'POS', rotation: 'ROT', focalLength: 'FOCAL', poi: 'POI', aperture: 'APERTURE', motionBlur: 'SHUTTER' };

function Slider({ label, value, min, max, step, unit, prefix, onChange, disabled, ch }:
  { label: string; value: number; min: number; max: number; step: number; unit?: string; prefix?: string; onChange: (v: number) => void; disabled?: boolean; ch?: Channel }) {
  const disp = prefix ? prefix + value.toFixed(1) : round(value, step < 1 ? 1 : 0) + (unit ? ' ' + unit : '');
  return (
    <div className={'row' + (disabled ? ' locked' : '')}>
      <span className="row-lead">{ch ? <KeyDot ch={ch} value={value} disabled={disabled} /> : <span className="kf-spacer" />}<label>{label}</label></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
        <span className="val" style={{ minWidth: 52, textAlign: 'right' }}>{disp}</span>
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
      <div className="sect-t" style={{ color: 'var(--amber)' }}>
        {single ? <>Key — {CH_LABEL[ks[0].channel]}<span className="st">{ks[0].source}</span></> : <>{ks.length} keys<span className="st">selected</span></>}
      </div>
      {/* Time is edited on the timeline, value in the Transform panel below — this panel is the ease curve. */}
      <div className="sect-t" style={{ marginTop: 2 }}>Curve (incoming ease){!single && common === null && <span className="st">mixed</span>}</div>
      <div className="ease-grid">
        {EASE_LIST.map(ez => <div key={ez} className={'ease-opt' + (common === ez ? ' sel' : '')} onClick={() => st.setKeysEase(ids, ez)}>{ez}</div>)}
      </div>
      <EaseCurve ease={common ?? ks[0].ease} />
      <button className="btn-sm danger btn-full" style={{ marginTop: 10 }} onClick={() => st.removeKeys(ids)}>{single ? 'Delete key' : `Delete ${ks.length} keys`}</button>
    </div>
  );
}

// Movement presets, relative to the camera's target. Gated: you must target an asset first.
function CameraMoves({ cam }: { cam: Camera }) {
  const [dur, setDur] = useState(2.5);
  const [amp, setAmp] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const targeted = cam.target?.type === 'object';
  const run = (kind: string, d: 1 | -1 = dir) => applyPreset(kind, { duration: dur, amplitude: amp, ease: 'easeInOut', dir: d });
  const sliderRow = (label: string, v: number, min: number, max: number, step: number, disp: string, on: (n: number) => void) => (
    <div className="row"><span className="row-lead"><span className="kf-spacer" /><label>{label}</label></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
        <input type="range" min={min} max={max} step={step} value={v} onChange={e => on(parseFloat(e.target.value))} />
        <span className="val" style={{ minWidth: 44, textAlign: 'right' }}>{disp}</span>
      </div>
    </div>
  );
  return (
    <div className="sect">
      <div className="sect-t">Camera moves</div>
      {!targeted ? (
        <>
          <div className="hint">① Cible un asset pour activer les mouvements (orbit, push, crane…).</div>
          <button className="btn-sm btn-full" style={{ marginTop: 6 }} onClick={() => S().setTool('target')}>◎ Cibler un asset</button>
        </>
      ) : (
        <>
          {sliderRow('Durée', dur, 0.5, 8, 0.1, dur.toFixed(1) + 's', setDur)}
          {sliderRow('Amplitude', amp, 0.25, 2, 0.05, amp.toFixed(2) + '×', setAmp)}
          <div className="row"><span className="row-lead"><span className="kf-spacer" /><label>Sens</label></span>
            <div className="seg">
              <button className={dir === 1 ? 'sel' : ''} onClick={() => setDir(1)}>↻</button>
              <button className={dir === -1 ? 'sel' : ''} onClick={() => setDir(-1)}>↺</button>
            </div>
          </div>
          <div className="chip-row" style={{ marginTop: 8 }}>
            <button className="btn-sm" onClick={() => run('orbit')}>Orbit</button>
            <button className="btn-sm" onClick={() => run('arc')}>Arc</button>
            <button className="btn-sm" onClick={() => run('dolly', 1)}>Push in</button>
            <button className="btn-sm" onClick={() => run('dolly', -1)}>Push out</button>
            <button className="btn-sm" onClick={() => run('crane', 1)}>Crane ↑</button>
            <button className="btn-sm" onClick={() => run('crane', -1)}>Crane ↓</button>
            <button className="btn-sm" onClick={() => run('rackFocus')}>Rack focus</button>
            <button className="btn-sm" onClick={() => run('dollyZoom')}>Dolly zoom</button>
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

      {selKeys.length > 0 && <KeyInspector ks={selKeys} />}

      <div className="sect">
        <div className="sect-t">Transform</div>
        <Vec3Row label="Position" ch="position" value={p.position} onChange={(i, v) => st.editPose('position', i, v)} />
        <Vec3Row label="Rotation" ch="rotation" value={p.rotation} step={1} disabled={!!cam.target} onChange={(i, v) => st.editPose('rotation', i, v)} />
        {cam.target && <div className="lock-note">⚿ Orientation pilotée par la cible.</div>}
        <Vec3Row label="POI" ch="poi" value={poiPoint(cam, st.project.timeline.playhead)} disabled={cam.target?.type === 'object'} onChange={(i, v) => st.editPoi(i, v)} />
      </div>

      <div className="sect">
        <div className="sect-t">Optics</div>
        <Slider label="Focal" ch="focalLength" value={p.focalLength} min={14} max={200} step={1} unit="mm" onChange={v => st.setOptic('focalLength', v)} />
        <Slider label="Aperture" ch="aperture" value={p.aperture} min={1.4} max={16} step={0.1} prefix="f/" onChange={v => st.setOptic('aperture', v)} />
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
          <button className={'btn-sm' + (st.ui.focusPicking ? ' amber' : '')} onClick={() => st.setFocusPicking(!st.ui.focusPicking)}>
            ⊙ {st.ui.focusPicking ? 'Picking…' : 'Pick focus'}
          </button>
          <button className={'btn-sm' + (cam.optics.focusPoint || cam.optics.aperture !== DEFAULT_APERTURE ? '' : ' locked')}
            title="General focus + default aperture" onClick={() => st.resetFocus()}>↺ Reset</button>
        </div>
      </div>

      <CameraMoves cam={cam} />

    </div>
  );
}
