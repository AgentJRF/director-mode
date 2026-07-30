import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { S } from '../store';
import { useRev } from './bits';
import { IcCamera, IcCube, IcTarget, IcTrash, IcEye } from './icons';

function Eye({ id }: { id: string }) {
  const off = !!S().ui.hidden[id];
  return (
    <span className="ol-eye" title={off ? 'Show' : 'Hide'} style={{ opacity: off ? 1 : undefined, color: off ? 'var(--ink-3)' : undefined }}
      onClick={e => { e.stopPropagation(); S().toggleHidden(id); }}><IcEye off={off} size={14} /></span>
  );
}

// Target badge shown next to the object the ACTIVE camera aims at. Click to select (Del removes),
// right-click for a "Remove target" menu.
function TargetBadge() {
  const st = S(); const sel = st.ui.targetSelected;
  return (
    <span className="ol-target" title={sel ? 'Cible sélectionnée — Suppr pour retirer' : "Cible de la caméra active (clic pour sélectionner, clic droit pour retirer)"}
      onClick={e => { e.stopPropagation(); st.selectTarget(!sel); }}
      style={{ display: 'inline-flex', marginLeft: 'auto', marginRight: 4, cursor: 'pointer', color: sel ? 'var(--amber)' : 'var(--blue)' }}>
      <IcTarget size={13} />
    </span>
  );
}

// Scene objects only — the ground + grid are viewport furniture (not listed here).
const OBJECTS: { id: string; label: string; icon: () => ReactElement }[] = [
  { id: 'product', label: 'Product', icon: () => <IcCube size={14} /> },
  { id: 'pedestal', label: 'Pedestal', icon: () => <IcCube size={14} /> },
];

export default function Outliner() {
  useRev();
  const st = S(); const proj = st.project; const cam = st.active();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  const isTarget = (id: string) => cam.target?.type === 'object' && cam.target.objectId === id;
  const onTargetContext = (e: React.MouseEvent, id: string) => {
    if (!isTarget(id)) return;
    e.preventDefault(); e.stopPropagation();
    st.selectTarget(true);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div className="insp-h">Scene</div>
      <div className="sect">
        <div className="sect-t">Cameras</div>
        {proj.cameras.map(c => {
          const active = c.id === proj.activeCameraId;
          return (
            <div key={c.id} className={'ol-row' + (active ? ' sel' : '')} onClick={() => st.selectCamera(c.id)}>
              <span className="ol-ic" style={{ color: c.color }}><IcCamera size={14} /></span>
              <span className="nm">{c.name}</span>
              {active && <span className={'ol-dot' + (st.ui.viewMode === 'scene' ? ' scene' : '')}
                title={st.ui.viewMode === 'camera' ? 'Camera POV — click for Scene view' : 'Scene view — click for Camera POV'}
                onClick={e => { e.stopPropagation(); st.setViewMode(st.ui.viewMode === 'camera' ? 'scene' : 'camera'); }} />}
              {proj.cameras.length > 1 && (
                <span className="ol-eye" title="Delete camera"
                  onClick={e => { e.stopPropagation(); st.removeCamera(c.id); }}><IcTrash size={13} /></span>
              )}
              <Eye id={'cam:' + c.id} />
            </div>
          );
        })}
        <button className="btn-sm btn-full" style={{ marginTop: 6 }} onClick={() => st.addCamera()}>+ New camera</button>

        <div className="sect-t" style={{ marginTop: 12 }}>Objects</div>
        {OBJECTS.map(o => (
          <div key={o.id} className="ol-row" onContextMenu={e => onTargetContext(e, o.id)}>
            <span className="ol-ic">{o.icon()}</span>
            <span className="nm">{o.label}</span>
            {isTarget(o.id) && <TargetBadge />}
            <Eye id={o.id} />
          </div>
        ))}
      </div>

      {menu && (
        <div style={{
          position: 'fixed', left: menu.x, top: menu.y, zIndex: 100,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: 4, minWidth: 150,
        }} onPointerDown={e => e.stopPropagation()}>
          <button className="btn-sm btn-full" style={{ border: 'none', justifyContent: 'flex-start' }}
            onClick={() => { st.setTarget(null); setMenu(null); }}>Retirer la cible</button>
        </div>
      )}
    </>
  );
}
