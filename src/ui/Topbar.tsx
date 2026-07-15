import { S } from '../store';
import { useRev } from './bits';

export default function Topbar() {
  useRev();
  const { width, height } = S().project.canvas;
  return (
    <div id="topbar">
      <span className="brand">Director<span className="dot">.</span>mode</span>
      <span className="badge proto">prototype</span>
      <span className="badge">{width}×{height}</span>
      <div className="top-spacer" />
      <button className="tbtn" onClick={() => S().setModal('color')}>Color / LUT</button>
      <button className="tbtn" onClick={() => S().setModal('export')}>Export</button>
    </div>
  );
}
