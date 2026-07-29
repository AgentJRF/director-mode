import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { S } from '../store';
import { useRev } from './bits';

// Adobe Spectrum 2 workflow icons (filled, currentColor) — match the toolbar.
const CameraIcon = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="m16.75,17H3.25c-1.24072,0-2.25-1.00977-2.25-2.25v-7.5c0-1.24023,1.00928-2.25,2.25-2.25h1.82275c.28613,0,.54297-.15918.6709-.41406l.1709-.3418c.38379-.76758,1.15479-1.24414,2.0127-1.24414h4.14551c.85791,0,1.62891.47656,2.0127,1.24414l.1709.3418c.12793.25488.38477.41406.6709.41406h1.82275c1.24072,0,2.25,1.00977,2.25,2.25v7.5c0,1.24023-1.00928,2.25-2.25,2.25ZM3.25,6.5c-.41357,0-.75.33691-.75.75v7.5c0,.41309.33643.75.75.75h13.5c.41357,0,.75-.33691.75-.75v-7.5c0-.41309-.33643-.75-.75-.75h-1.82275c-.85791,0-1.62891-.47656-2.0127-1.24414l-.1709-.3418c-.12793-.25488-.38477-.41406-.6709-.41406h-4.14551c-.28613,0-.54297.15918-.6709.41406l-.1709.3418c-.38379.76758-1.15479,1.24414-2.0127,1.24414h-1.82275Z" />
    <path d="m10,14.5c-2.20557,0-4-1.79395-4-4s1.79443-4,4-4,4,1.79395,4,4-1.79443,4-4,4Zm0-6.5c-1.37842,0-2.5,1.12109-2.5,2.5s1.12158,2.5,2.5,2.5,2.5-1.12109,2.5-2.5-1.12158-2.5-2.5-2.5Z" />
  </svg>
);
const CubeIcon = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="m17.77148,5.08203l-2.78906-1.60938c-.52832-.30664-1.18945-.3125-1.72168-.01758l-3.26074,1.79785-3.2627-1.79785c-.53418-.29297-1.19336-.28809-1.71973.01758l-2.79004,1.60938c-.75684.43848-1.22754,1.25391-1.22754,2.12793v4.55566c0,.875.4707,1.69043,1.22852,2.12695l6.54297,3.77832c.37891.21875.80371.32812,1.22852.32812s.84961-.10938,1.22852-.32812l6.54297-3.77832c.75781-.43652,1.22852-1.25195,1.22852-2.12695v-4.55566c0-.87402-.4707-1.68945-1.22852-2.12793Zm-12.00391-.31055c.03809-.02246.08203-.0332.125-.0332.04102,0,.08301.01074.12012.03125l3.625,1.99707c.22656.12305.49805.12305.72461,0l3.62305-1.99805c0-.00098.00098-.00098.00098-.00098.07617-.04199.16797-.04102.24414.00293l2.56055,1.47791-6.79028,3.74573-6.79541-3.74414,2.56226-1.47852Zm-2.78906,7.82227c-.29492-.16992-.47852-.4873-.47852-.82812v-4.19055l6.75,3.71887v4.92139l-6.27148-3.62158Zm14.04297,0l-6.27148,3.62158v-4.92236l6.75-3.72339v4.19604c0,.34082-.18359.6582-.47852.82812Z" />
  </svg>
);
const FloorIcon = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M15.75,2H4.25c-1.24072,0-2.25,1.00977-2.25,2.25v11.5c0,1.24023,1.00928,2.25,2.25,2.25h11.5c1.24072,0,2.25-1.00977,2.25-2.25V4.25c0-1.24023-1.00928-2.25-2.25-2.25ZM16.5,4.25v2.625h-3.375v-3.375h2.625c.41357,0,.75.33691.75.75ZM8.125,11.875v-3.75h3.75v3.75h-3.75ZM11.875,13.125v3.375h-3.75v-3.375h3.75ZM6.875,11.875h-3.375v-3.75h3.375v3.75ZM8.125,6.875v-3.375h3.75v3.375h-3.75ZM13.125,8.125h3.375v3.75h-3.375v-3.75ZM4.25,3.5h2.625v3.375h-3.375v-2.625c0-.41309.33643-.75.75-.75ZM3.5,15.75v-2.625h3.375v3.375h-2.625c-.41357,0-.75-.33691-.75-.75ZM15.75,16.5h-2.625v-3.375h3.375v2.625c0,.41309-.33643.75-.75.75Z" />
  </svg>
);
const TargetIcon = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden>
    <circle cx="10" cy="10" r="1.5" />
    <path d="M10,18.75c-4.82471,0-8.75-3.9248-8.75-8.75S5.17529,1.25,10,1.25s8.75,3.9248,8.75,8.75-3.92529,8.75-8.75,8.75ZM10,2.75c-3.99756,0-7.25,3.25195-7.25,7.25s3.25244,7.25,7.25,7.25,7.25-3.25195,7.25-7.25-3.25244-7.25-7.25-7.25Z" />
    <path d="M10,15c-2.75684,0-5-2.24316-5-5s2.24316-5,5-5,5,2.24316,5,5-2.24316,5-5,5ZM10,6.5c-1.92969,0-3.5,1.57031-3.5,3.5s1.57031,3.5,3.5,3.5,3.5-1.57031,3.5-3.5-1.57031-3.5-3.5-3.5Z" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden>
    <path d="m8.24902,15.02148c-.40039,0-.7334-.31738-.74805-.7207l-.25-6.5c-.0166-.41406.30664-.7627.71973-.77832.01074-.00098.02051-.00098.03027-.00098.40039,0,.7334.31738.74805.7207l.25,6.5c.0166.41406-.30664.7627-.71973.77832-.01074.00098-.02051.00098-.03027.00098Z" />
    <path d="m11.75098,15.02148c-.00977,0-.01953,0-.03027-.00098-.41309-.01562-.73633-.36426-.71973-.77832l.25-6.5c.01465-.40332.34766-.7207.74805-.7207.00977,0,.01953,0,.03027.00098.41309.01562.73633.36426.71973.77832l-.25,6.5c-.01465.40332-.34766.7207-.74805.7207Z" />
    <path d="m17,4h-3.5v-.75c0-1.24023-1.00977-2.25-2.25-2.25h-2.5c-1.24023,0-2.25,1.00977-2.25,2.25v.75h-3.5c-.41406,0-.75.33594-.75.75s.33594.75.75.75h.52002l.42236,10.3418c.04785,1.20996,1.03613,2.1582,2.24805,2.1582h7.61914c1.21191,0,2.2002-.94824,2.24805-2.1582l.42236-10.3418h.52002c.41406,0,.75-.33594.75-.75s-.33594-.75-.75-.75Zm-9-.75c0-.41309.33691-.75.75-.75h2.5c.41309,0,.75.33691.75.75v.75h-4v-.75Zm6.55957,12.53125c-.0166.40332-.3457.71875-.75.71875h-7.61914c-.4043,0-.7334-.31543-.75-.71875l-.41968-10.28125h9.9585l-.41968,10.28125Z" />
  </svg>
);
const EyeIcon = ({ off }: { off: boolean }) => off ? (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="m9.96582,16.68262C5.11035,16.68262.75,12.29395.75,10.22168c0-.91992.86426-2.35938,2.20117-3.66797.29492-.28809.76953-.28418,1.06055.01172.29004.2959.28418.77051-.01172,1.06055-1.30957,1.28125-1.75,2.31934-1.75,2.5957,0,1.14453,3.64746,4.96094,7.71582,4.96094.60449,0,1.23145-.08496,1.86328-.25195.39746-.10156.81055.13379.91699.53418.10547.40039-.13379.81055-.53418.91699-.75586.19922-1.51172.30078-2.24609.30078Z" />
    <path d="m16.60352,13.84277c-.20312,0-.40527-.08203-.55371-.24414-.2793-.30566-.25781-.78027.04785-1.05957,1.13965-1.04199,1.65234-1.98242,1.65234-2.31738,0-.80176-1.9043-3.27637-4.51074-4.55176-1.00879-.50977-2.12891-.78418-3.24902-.79785-.62012,0-1.26465.09375-1.90527.2793-.40039.10938-.81445-.11523-.92871-.5127-.11523-.39746.11426-.81348.5127-.92871.77539-.22461,1.55957-.33789,2.33105-.33789,1.35645.0166,2.7041.34668,3.90723.9541,2.74219,1.34277,5.34277,4.20996,5.34277,5.89551,0,.91895-.7998,2.19922-2.14062,3.4248-.14355.13184-.3252.19629-.50586.19629Z" />
    <path d="m18.78027,17.74121l-5.77808-5.77808c.20337-.29639.35767-.61475.45886-.94604.20886-.68457-.45813-1.25049-1.11877-.97607-.49548.20581-.9458.14062-1.18115.08105l-1.37183-1.37183c-.09448-.36938-.07935-.74487.03979-1.08569.22266-.63672-.47266-1.25879-1.09985-1.01025-.23547.09326-.4624.21338-.67676.35913L2.28027,1.24121c-.29297-.29297-.76758-.29297-1.06055,0s-.29297.76758,0,1.06055l16.5,16.5c.14648.14648.33789.21973.53027.21973s.38379-.07324.53027-.21973c.29297-.29297.29297-.76758,0-1.06055Z" />
    <path d="m8.20459,12.9978c.69531.43384,1.52295.5874,2.31909.48462l-3.98169-3.98169c-.16833,1.31567.38574,2.7002,1.6626,3.49707Z" />
  </svg>
) : (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="m10.03418,16.66162C5.14258,16.66162.75,12.27295.75,10.20068c0-1.68506,2.59814-4.55029,5.34717-5.89746,1.20117-.60596,2.54736-.93506,3.89307-.95264,5.15771,0,9.25977,4.91943,9.25977,6.8501,0,2.07227-4.36035,6.46094-9.21582,6.46094Zm-.03418-11.81104c-1.11084.01465-2.23145.28906-3.23096.79346-.00244.00146-.00537.00293-.0083.00439-2.60596,1.27539-4.51074,3.75-4.51074,4.55225,0,1.14453,3.67969,4.96094,7.78418,4.96094,4.06836,0,7.71582-3.81641,7.71582-4.96094,0-1.04883-3.48145-5.3501-7.75-5.3501Zm-3.56885.12402h.00977-.00977Z" />
    <path d="m9.82907,7.64351c.22275-.63691-.47262-1.25888-1.09987-1.01025-.47319.18757-.91275.48099-1.28245.88097-1.49146,1.6136-1.20734,4.23592.75785,5.46243,1.20025.7491,2.79762.68815,3.93958-.14712.6684-.48889,1.10383-1.13556,1.31685-1.83367.20882-.68436-.45803-1.25043-1.1188-.97598-.5365.22284-1.03207.12822-1.24493.06689-.57058-.16439-1.03427-.59003-1.24706-1.14381-.16744-.43575-.16335-.8929-.02115-1.29947Z" />
  </svg>
);

function Eye({ id }: { id: string }) {
  const off = !!S().ui.hidden[id];
  return (
    <span className="ol-eye" title={off ? 'Show' : 'Hide'} style={{ opacity: off ? 1 : undefined, color: off ? 'var(--ink-3)' : undefined }}
      onClick={e => { e.stopPropagation(); S().toggleHidden(id); }}><EyeIcon off={off} /></span>
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
      <TargetIcon />
    </span>
  );
}

const OBJECTS: { id: string; label: string; icon: () => ReactElement }[] = [
  { id: 'product', label: 'Product', icon: CubeIcon },
  { id: 'pedestal', label: 'Pedestal', icon: CubeIcon },
];
const ENVIRONMENT: { id: string; label: string; icon: () => ReactElement }[] = [
  { id: 'floor', label: 'Ground', icon: FloorIcon },
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
              <span className="ol-ic"><CameraIcon /></span>
              <span className="nm">{c.name}</span>
              {active && <span className={'ol-dot' + (st.ui.viewMode === 'scene' ? ' scene' : '')}
                title={st.ui.viewMode === 'camera' ? 'Camera POV — click for Scene view' : 'Scene view — click for Camera POV'}
                onClick={e => { e.stopPropagation(); st.setViewMode(st.ui.viewMode === 'camera' ? 'scene' : 'camera'); }} />}
              {proj.cameras.length > 1 && (
                <span className="ol-eye" title="Delete camera"
                  onClick={e => { e.stopPropagation(); st.removeCamera(c.id); }}><TrashIcon /></span>
              )}
              <Eye id={'cam:' + c.id} />
            </div>
          );
        })}
        <button className="btn-sm btn-full" style={{ marginTop: 6 }} onClick={() => st.addCamera()}>+ New camera</button>

        <div className="sect-t" style={{ marginTop: 12 }}>Objects</div>
        {OBJECTS.map(o => (
          <div key={o.id} className="ol-row" onContextMenu={e => onTargetContext(e, o.id)}>
            <span className="ol-ic"><o.icon /></span>
            <span className="nm">{o.label}</span>
            {isTarget(o.id) && <TargetBadge />}
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
