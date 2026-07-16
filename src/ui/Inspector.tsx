import { S, DEFAULT_APERTURE } from '../store';
import { useRev } from './bits';
import Outliner from './Outliner';
import { evaluate, keysOf, EASE_LIST, EASES, round, poiPoint } from '../lib/eval';

import type { Channel, Ease, Keyframe, Vec3 } from '../types';

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
  const fn = EASES[ease] || EASES.linear; let d = ''; const N = 32;
  for (let i = 0; i <= N; i++) { const t = i / N; const y = fn(t); d += (i ? 'L' : 'M') + (6 + t * 108).toFixed(1) + ',' + (58 - y * 52).toFixed(1) + ' '; }
  return (
    <svg width={120} height={64} style={{ background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 6, marginTop: 8 }}>
      <line x1={6} y1={58} x2={114} y2={58} stroke="#25292d" /><line x1={6} y1={6} x2={6} y2={58} stroke="#25292d" />
      <path d={d} fill="none" stroke="#f2a33c" strokeWidth={1.5} />
    </svg>
  );
}

function KeyInspector({ k }: { k: Keyframe }) {
  const st = S();
  return (
    <div className="sect" style={{ background: 'var(--panel-2)' }}>
      <div className="sect-t" style={{ color: 'var(--amber)' }}>Key — {CH_LABEL[k.channel]}<span className="st">{k.source}</span></div>
      <div className="row"><label>Time</label>
        <input type="number" step="0.05" min={0} max={st.project.timeline.duration} value={round(k.time, 3)}
          onChange={e => st.setKeyTime(k.id, parseFloat(e.target.value) || 0)} /></div>
      {k.channel === 'focalLength' ? (
        <div className="row"><label>Focal</label>
          <input type="number" step="1" value={round(k.value as number, 0)} onChange={e => st.setKeyFocal(k.id, parseFloat(e.target.value) || 0)} /></div>
      ) : (
        <div className="row"><label>{k.channel === 'position' ? 'Position' : k.channel === 'poi' ? 'Point of interest' : 'Rotation'}</label>
          <div className="vec3">{['X', 'Y', 'Z'].map((lb, i) => (
            <input key={lb} type="number" step="0.1" value={round((k.value as number[])[i], 2)}
              onChange={e => st.setKeyValueComp(k.id, i, parseFloat(e.target.value) || 0)} />))}</div></div>
      )}
      <div className="sect-t" style={{ marginTop: 10 }}>Curve (incoming ease)</div>
      <div className="ease-grid">
        {EASE_LIST.map(ez => <div key={ez} className={'ease-opt' + (k.ease === ez ? ' sel' : '')} onClick={() => st.setKeyEase(k.id, ez)}>{ez}</div>)}
      </div>
      <EaseCurve ease={k.ease} />
      <button className="btn-sm danger btn-full" style={{ marginTop: 10 }} onClick={() => st.removeKey(k.id)}>Delete key</button>
    </div>
  );
}

export default function Inspector() {
  useRev();
  const st = S(); const cam = st.active();
  const selKey = st.ui.selectedKeyIds.length === 1 ? cam.keyframes.find(k => k.id === st.ui.selectedKeyIds[0]) : undefined;
  const p = evaluate(cam, st.project.timeline.playhead);
  return (
    <div id="inspector">
      <Outliner />

      {selKey && <KeyInspector k={selKey} />}

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
        <Slider label="Motion blur" ch="motionBlur" value={p.motionBlur} min={0} max={360} step={1} unit="°" onChange={v => st.setOptic('motionBlurShutter', v)} />
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

    </div>
  );
}
