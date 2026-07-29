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
      <button className="tbtn" title="AI — match camera from an image" onClick={() => S().setModal('ai-image')}>✦ AI image</button>
      <button className="tbtn" title="AI — animation from a video" onClick={() => S().setModal('ai-video')}>✦ AI video</button>
      <button className="tbtn" onClick={() => S().setModal('export')}>Export</button>
    </div>
  );
}
