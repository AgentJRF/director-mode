import { S, hasAnim } from '../store';
import { useRev } from './bits';
import { evaluate } from '../lib/eval';

export default function HUD() {
  useRev();
  const st = S(); const cam = st.active(); const tl = st.project.timeline;
  const p = evaluate(cam, tl.playhead);
  const rec = st.ui.recording;
  const badgeCls = rec ? 'shot-badge rec' : hasAnim(cam) ? 'shot-badge anim' : 'shot-badge';
  const badgeTxt = rec ? 'REC' : hasAnim(cam) ? 'Anim' : 'Shot';
  const g = Math.round; const gg = (a: number, b: number): number => (b ? gg(b, a % b) : a);
  const d = gg(st.project.canvas.width, st.project.canvas.height);
  return (
    <>
      <div className="hud tl"><div className={badgeCls}><span className="led" /><span>{badgeTxt}</span></div></div>
      <div className="hud tr">
        <div className="hud-optics">{g(p.focalLength)}&nbsp;mm · f/{p.aperture.toFixed(1)}</div>
        <div className="hud-sub">shutter {g(p.motionBlur)}° · {cam.name}</div>
      </div>
      <div className="hud bl">
        <span className="ratio-pill" onClick={() => S().setModal('export')}>
          {st.project.canvas.width / d}:{st.project.canvas.height / d} · {st.project.canvas.width}×{st.project.canvas.height} ⚙
        </span>
      </div>
      <div className="hud br">{tl.playhead.toFixed(2)}s / {tl.duration.toFixed(2)}s</div>
    </>
  );
}
