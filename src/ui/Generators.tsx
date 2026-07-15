import { S } from '../store';
import { useRev } from './bits';
import { applyPreset } from '../lib/presets';

const PRESETS = [
  { id: 'dolly', ic: '→', label: 'Dolly' },
  { id: 'orbit', ic: '↻', label: 'Orbit' },
  { id: 'pan', ic: '↔', label: 'Pan' },
  { id: 'tilt', ic: '↕', label: 'Tilt' },
  { id: 'rackFocus', ic: '◉', label: 'Rack focus' },
  { id: 'dollyZoom', ic: '◎', label: 'Dolly zoom' },
];

export default function Generators() {
  useRev();
  if (S().ui.tool !== 'generators') return null;
  return (
    <div id="gen-bar">
      <span className="g-label">Generate</span>
      {PRESETS.map(p => (
        <button key={p.id} className="gchip" onClick={() => applyPreset(p.id, {})}>
          <span className="ic">{p.ic}</span>{p.label}
        </button>
      ))}
      <div className="gsep" />
      <button className="gchip" onClick={() => S().setModal('interp')}><span className="ic">⇄</span>Interp A→B</button>
      <button className="gchip" onClick={() => S().setModal('ai-image')}><span className="ic">🖼</span>AI image</button>
      <button className="gchip" onClick={() => S().setModal('ai-video')}><span className="ic">🎬</span>AI video</button>
    </div>
  );
}
