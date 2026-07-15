import { S } from '../store';
import { useRev } from './bits';

const CameraIcon = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <rect x="2" y="5.5" width="9" height="7" rx="1.4" /><path d="M11 7.7 L16 5.3 V12.7 L11 10.3 Z" />
  </svg>
);
const CubeIcon = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M9 2.2 L15 5.6 V12.4 L9 15.8 L3 12.4 V5.6 Z" /><path d="M9 2.2 V9 M9 9 L15 5.6 M9 9 L3 5.6" />
  </svg>
);
const FloorIcon = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M9 4 L16 9 L9 14 L2 9 Z" /><path d="M5.5 6.5 L12.5 11.5 M12.5 6.5 L5.5 11.5" strokeOpacity="0.5" />
  </svg>
);
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M1.6 9 C3.7 5.2, 14.3 5.2, 16.4 9 C14.3 12.8, 3.7 12.8, 1.6 9 Z" />
    {off ? <line x1="3" y1="15" x2="15" y2="3" /> : <circle cx="9" cy="9" r="2.1" />}
  </svg>
);

function Eye({ id }: { id: string }) {
  const off = !!S().ui.hidden[id];
  return (
    <span className="ol-eye" title={off ? 'Show' : 'Hide'} style={{ opacity: off ? 1 : undefined, color: off ? 'var(--ink-3)' : undefined }}
      onClick={e => { e.stopPropagation(); S().toggleHidden(id); }}><EyeIcon off={off} /></span>
  );
}

const OBJECTS: { id: string; label: string; icon: () => JSX.Element }[] = [
  { id: 'product', label: 'Product', icon: CubeIcon },
  { id: 'pedestal', label: 'Pedestal', icon: CubeIcon },
];
const ENVIRONMENT: { id: string; label: string; icon: () => JSX.Element }[] = [
  { id: 'floor', label: 'Ground', icon: FloorIcon },
];

export default function Outliner() {
  useRev();
  const st = S(); const proj = st.project;
  return (
    <>
      <div className="insp-h">Scene</div>
      <div className="sect">
        <div className="sect-t">Cameras</div>
        {proj.cameras.map(c => {
          const active = c.id === proj.activeCameraId;
          return (
            <div key={c.id} className={'ol-row' + (active ? ' sel' : '')} onClick={() => st.selectCamera(c.id)}>
              <span className="ol-ic"><CameraIcon /></span>
              <span className="nm">{c.name}</span>
              {active && <span className="ol-dot" />}
              <Eye id={'cam:' + c.id} />
            </div>
          );
        })}
        <button className="btn-sm btn-full" style={{ marginTop: 6 }} onClick={() => st.addCamera()}>+ New camera</button>

        <div className="sect-t" style={{ marginTop: 12 }}>Objects</div>
        {OBJECTS.map(o => (
          <div key={o.id} className="ol-row">
            <span className="ol-ic"><o.icon /></span>
            <span className="nm">{o.label}</span>
            <Eye id={o.id} />
          </div>
        ))}

        <div className="sect-t" style={{ marginTop: 12 }}>Environment</div>
        {ENVIRONMENT.map(o => (
          <div key={o.id} className="ol-row">
            <span className="ol-ic"><o.icon /></span>
            <span className="nm">{o.label}</span>
            <Eye id={o.id} />
          </div>
        ))}
      </div>
    </>
  );
}
