import { S, hasAnim } from '../store';
import { useRev } from './bits';
import { evaluate, keysOf, EASE_LIST, EASES, round } from '../lib/eval';
import { OBJECT_CENTERS } from '../lib/eval';
import type { Camera, Channel, Ease, Keyframe } from '../types';

const CH_LABEL: Record<Channel, string> = { position: 'POS', rotation: 'ROT', focalLength: 'FOCAL' };

function Slider({ label, value, min, max, step, unit, prefix, onChange, disabled }:
  { label: string; value: number; min: number; max: number; step: number; unit?: string; prefix?: string; onChange: (v: number) => void; disabled?: boolean }) {
  const disp = prefix ? prefix + value.toFixed(1) : round(value, step < 1 ? 1 : 0) + (unit ? ' ' + unit : '');
  return (
    <div className={'row' + (disabled ? ' locked' : '')}>
      <label>{label}</label>
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

function KeyInspector({ cam, k }: { cam: Camera; k: Keyframe }) {
  const st = S();
  return (
    <div className="sect" style={{ background: 'var(--panel-2)' }}>
      <div className="sect-t" style={{ color: 'var(--amber)' }}>Clé — {CH_LABEL[k.channel]}<span className="st">{k.source}</span></div>
      <div className="row"><label>Temps</label>
        <input type="number" step="0.05" min={0} max={st.project.timeline.duration} value={round(k.time, 3)}
          onChange={e => st.setKeyTime(k.id, parseFloat(e.target.value) || 0)} /></div>
      {k.channel === 'focalLength' ? (
        <div className="row"><label>Focale</label>
          <input type="number" step="1" value={round(k.value as number, 0)} onChange={e => st.setKeyFocal(k.id, parseFloat(e.target.value) || 0)} /></div>
      ) : (
        <div className="row"><label>{k.channel === 'position' ? 'Position' : 'Rotation'}</label>
          <div className="vec3">{['X', 'Y', 'Z'].map((lb, i) => (
            <input key={lb} type="number" step="0.1" value={round((k.value as number[])[i], 2)}
              onChange={e => st.setKeyValueComp(k.id, i, parseFloat(e.target.value) || 0)} />))}</div></div>
      )}
      <div className="sect-t" style={{ marginTop: 10 }}>Courbe (ease entrant)</div>
      <div className="ease-grid">
        {EASE_LIST.map(ez => <div key={ez} className={'ease-opt' + (k.ease === ez ? ' sel' : '')} onClick={() => st.setKeyEase(k.id, ez)}>{ez}</div>)}
      </div>
      <EaseCurve ease={k.ease} />
      <button className="btn-sm danger btn-full" style={{ marginTop: 10 }} onClick={() => st.removeKey(k.id)}>Supprimer la clé</button>
    </div>
  );
}

export default function Inspector() {
  useRev();
  const st = S(); const cam = st.active();
  const selKey = cam.keyframes.find(k => k.id === st.ui.selectedKeyId);
  const p = evaluate(cam, st.project.timeline.playhead);
  return (
    <div id="inspector">
      <div className="insp-h">Caméras</div>
      <div className="sect">
        {st.project.cameras.map(c => (
          <div key={c.id} className={'cam-item' + (c.id === st.project.activeCameraId ? ' sel' : '')} onClick={() => st.selectCamera(c.id)}>
            <span style={{ fontSize: 13 }}>🎥</span><span className="nm">{c.name}</span><span className="st">{hasAnim(c) ? 'anim' : 'shot'}</span>
          </div>
        ))}
        <button className="btn-sm btn-full" style={{ marginTop: 8 }} onClick={() => st.addCamera()}>+ Nouvelle caméra</button>
      </div>

      {selKey && <KeyInspector cam={cam} k={selKey} />}

      <div className="sect">
        <div className="sect-t">Optique</div>
        <Slider label="Focale" value={cam.optics.focalLength} min={14} max={200} step={1} unit="mm" onChange={v => st.setOptic('focalLength', v)} />
        <Slider label="Ouverture" value={cam.optics.aperture} min={1.4} max={16} step={0.1} prefix="f/" onChange={v => st.setOptic('aperture', v)} />
        <Slider label="Flou de mvt" value={cam.optics.motionBlurShutter} min={0} max={360} step={1} unit="°" onChange={v => st.setOptic('motionBlurShutter', v)} />
        <div className="hint">Ouverture pilote le bokeh (flou d'arrière-plan). Focale → cadrage.</div>
      </div>

      <div className="sect">
        <div className="sect-t">Target / visée{cam.target && <span className="st" style={{ color: 'var(--blue)' }}>actif</span>}</div>
        {cam.target ? (
          <>
            <div className="row"><label>Cible</label><span className="val">{cam.target.type === 'object' ? cam.target.objectId : 'point libre'}</span></div>
            <div className="lock-note">⚿ Rotation possédée par la target — édition manuelle verrouillée.</div>
            <button className="btn-sm btn-full" style={{ marginTop: 8 }} onClick={() => st.setTarget(null)}>Retirer la target</button>
          </>
        ) : (
          <>
            <div className="hint">Aucune target. Cible un objet ou un point ; la caméra reste alors cadrée dessus.</div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              {Object.keys(OBJECT_CENTERS).map(id => (
                <button key={id} className="btn-sm" onClick={() => st.setTarget({ type: 'object', objectId: id })}>◎ {id}</button>
              ))}
              <button className="btn-sm" onClick={() => st.setTarget({ type: 'point', point: [0, 0.9, 0] })}>◎ Point</button>
            </div>
          </>
        )}
      </div>

      <div className="sect">
        <div className="sect-t">Poser une clé<span className="val">{st.project.timeline.playhead.toFixed(2)}s</span></div>
        <div className="chip-row">
          <button className="btn-sm" onClick={() => st.upsertKey('position', p.position, st.project.timeline.playhead, 'manual')}>◆ Position</button>
          <button className={'btn-sm' + (cam.target ? ' locked' : '')} onClick={() => { if (!cam.target) st.upsertKey('rotation', p.rotation, st.project.timeline.playhead, 'manual'); }}>◆ Rotation</button>
          <button className="btn-sm" onClick={() => st.upsertKey('focalLength', cam.optics.focalLength, st.project.timeline.playhead, 'manual')}>◆ Focale</button>
        </div>
        <div className="hint">Orbite dans le viewport pour composer, puis pose une clé. Peu de clés = lisible et éditable.</div>
        {hasAnim(cam) && <button className="btn-sm danger btn-full" style={{ marginTop: 8 }} onClick={() => st.clearAnim()}>Effacer l'animation</button>}
      </div>
    </div>
  );
}
