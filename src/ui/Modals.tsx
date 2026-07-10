import { useState } from 'react';
import { S, PIVOT } from '../store';
import { useRev, grad } from './bits';
import { evaluate, eulerFromLookAt } from '../lib/eval';
import { applyPreset, resampleChannel, fuseAB } from '../lib/presets';
import { LUT_PRESETS, applyLutToCanvas } from '../lib/lut';
import type { Vec3 } from '../types';

function Shell({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) S().setModal(null); }}>
      <div className="modal">
        <div className="modal-h">{title}</div>
        <div className="modal-b">{children}</div>
        <div className="modal-f">{footer}</div>
      </div>
    </div>
  );
}

const AI_IMAGES = [
  { name: 'Hero low-angle', thumb: grad('#243b55', '#141e30'), pose: { position: [2.6, 0.7, 4.4] as Vec3, focal: 35, aperture: 1.8 }, confidence: 0.88 },
  { name: 'Top-down produit', thumb: grad('#3a2e2a', '#171310'), pose: { position: [0.5, 6.2, 2.2] as Vec3, focal: 50, aperture: 5.6 }, confidence: 0.74 },
  { name: 'Profil serré', thumb: grad('#2b3a2e', '#12160f'), pose: { position: [5.4, 1.1, 0.6] as Vec3, focal: 85, aperture: 2.0 }, confidence: 0.81 },
  { name: '3/4 large', thumb: grad('#2e2a3a', '#13111a'), pose: { position: [4.2, 2.4, 5.0] as Vec3, focal: 28, aperture: 4.0 }, confidence: 0.69 },
  { name: 'Contre-plongée', thumb: grad('#3a2233', '#1a0f16'), pose: { position: [3.0, 0.35, 3.6] as Vec3, focal: 24, aperture: 2.8 }, confidence: 0.77 },
  { name: 'Détail macro', thumb: grad('#26323a', '#0f1418'), pose: { position: [2.2, 0.8, 2.4] as Vec3, focal: 100, aperture: 1.4 }, confidence: 0.63 },
];
const AI_VIDEOS = [
  { name: 'Reveal orbital', gesture: 'orbit', thumb: grad('#243b55', '#141e30'), params: { duration: 4, amplitude: 0.9, ease: 'easeInOut' as const }, confidence: 0.82 },
  { name: 'Push-in dramatique', gesture: 'dolly', thumb: grad('#3a2e2a', '#171310'), params: { duration: 3, amplitude: 1.1, ease: 'easeIn' as const }, confidence: 0.86 },
  { name: 'Vertigo / dolly-zoom', gesture: 'dollyZoom', thumb: grad('#2b3a2e', '#12160f'), params: { duration: 3.5, amplitude: 0.8, ease: 'easeInOut' as const }, confidence: 0.71 },
  { name: 'Pan balayage', gesture: 'pan', thumb: grad('#2e2a3a', '#13111a'), params: { duration: 2.5, amplitude: 1.2, ease: 'easeOut' as const }, confidence: 0.79 },
];

const ConfBar = ({ c }: { c: number }) => (
  <span className="conf" style={{ flex: 1 }}>
    <span className="conf-bar"><i style={{ width: Math.round(c * 100) + '%', background: c > 0.8 ? '#4fb477' : c > 0.7 ? '#e0a34a' : '#d9614e' }} /></span>
    <span className="val">{Math.round(c * 100)}%</span>
  </span>
);
const FileStub = ({ kind }: { kind: 'image' | 'video' }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
    <span>… ou importer :</span><input type="file" accept={kind === 'image' ? 'image/*' : 'video/*'} style={{ fontSize: 11 }} /><span className="badge proto">estimé</span>
  </span>
);

function InterpModal() {
  useRev(); const st = S(); const cam = st.active();
  const capture = (which: 'A' | 'B') => { const p = evaluate(cam, st.project.timeline.playhead); st.setPoseAB(which, { position: p.position, rotation: p.rotation, focal: cam.optics.focalLength }); };
  const Card = ({ which }: { which: 'A' | 'B' }) => {
    const pose = which === 'A' ? st.ui.poseA : st.ui.poseB;
    return (
      <div className="ref" style={{ padding: 12, cursor: 'default' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Pose {which}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {pose ? `pos ${pose.position.map(v => v.toFixed(1)).join(', ')}\nfocale ${Math.round(pose.focal)}mm` : '— non capturée —'}
        </div>
        <button className="btn-sm btn-full" style={{ marginTop: 8 }} onClick={() => capture(which)}>Capturer la vue courante</button>
      </div>
    );
  };
  return (
    <Shell title="Interpolation A → B"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Annuler</button><button className="tbtn primary" onClick={fuseAB}>Fusionner en 1 caméra</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Compose une vue, capture-la comme A, compose-en une autre, capture B. La fusion crée UNE caméra animée à 2 clés (A et B ne restent pas comme caméras fantômes).</p>
      <div className="ref-grid" style={{ gridTemplateColumns: '1fr 1fr' }}><Card which="A" /><Card which="B" /></div>
    </Shell>
  );
}

function AIImageModal() {
  const [sel, setSel] = useState<number | null>(null);
  const [review, setReview] = useState(false);
  const [pose, setPose] = useState({ focal: 35, aperture: 2, position: [0, 0, 0] as Vec3 });
  const ref = sel != null ? AI_IMAGES[sel] : null;
  if (review && ref) {
    return (
      <Shell title="Revue IA · Shot fixe"
        footer={<><button className="tbtn" onClick={() => setReview(false)}>← Retour</button>
          <button className="tbtn primary" onClick={() => {
            const st = S(); const cam = st.active();
            cam.transform.position = pose.position;
            cam.transform.rotation = eulerFromLookAt(pose.position, PIVOT.toArray() as Vec3);
            cam.optics.focalLength = pose.focal; cam.optics.aperture = pose.aperture;
            st.setModal(null); st.toast('Pose composée (aucune clé) — timeline inchangée'); st.bump();
          }}>Valider la pose</button></>}>
        <div className="row"><label>Confiance</label><ConfBar c={ref.confidence} /></div>
        <p className="hint">Valeurs estimées — ajustables avant validation. Rien n'est appliqué de façon irréversible.</p>
        <div className="row"><label>Focale</label><input type="number" value={pose.focal} onChange={e => setPose({ ...pose, focal: +e.target.value })} /></div>
        <div className="row"><label>Ouverture</label><input type="number" step="0.1" value={pose.aperture} onChange={e => setPose({ ...pose, aperture: +e.target.value })} /></div>
        <div className="row"><label>Position</label><span className="val">{pose.position.map(v => v.toFixed(1)).join(', ')}</span></div>
        <label className="checkline"><input type="checkbox" defaultChecked /> Définir comme pose de départ</label>
      </Shell>
    );
  }
  return (
    <Shell title="IA · Match caméra depuis image"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Annuler</button>
        <button className="tbtn primary" onClick={() => { if (sel == null) { S().toast('Choisis une référence'); return; } setPose({ ...AI_IMAGES[sel].pose }); setReview(true); }}>Analyser</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>IA — shot fixe depuis une image (mocké). Compose un plan : place la caméra + règle focale/ouverture/angle. N'écrit AUCUNE clé.</p>
      <div className="ref-grid">
        {AI_IMAGES.map((r, i) => (
          <div key={i} className={'ref' + (sel === i ? ' sel' : '')} onClick={() => setSel(i)}>
            <div className="thumb" style={{ background: r.thumb }} /><div className="cap">{r.name}</div>
          </div>
        ))}
      </div>
      <label className="checkline" style={{ marginTop: 12 }}><FileStub kind="image" /></label>
    </Shell>
  );
}

function AIVideoModal() {
  const [sel, setSel] = useState<number | null>(null);
  const [review, setReview] = useState(false);
  const [fidelity, setFidelity] = useState(3);
  const ref = sel != null ? AI_VIDEOS[sel] : null;
  if (review && ref) {
    return (
      <Shell title="Revue IA · Animation"
        footer={<><button className="tbtn" onClick={() => setReview(false)}>← Retour</button>
          <button className="tbtn primary" onClick={() => {
            const st = S(); const cam = st.active(); cam.keyframes = [];
            applyPreset(ref.gesture, { ...ref.params });
            resampleChannel(cam, 'position', fidelity);
            cam.keyframes.forEach(k => (k.source = 'aiVideo'));
            st.setModal(null); st.toast('Animation IA appliquée — ' + fidelity + ' clés éditables'); st.bump();
          }}>Valider l'animation</button></>}>
        <div className="row"><label>Geste détecté</label><span className="val">{ref.gesture}</span></div>
        <div className="row"><label>Confiance</label><ConfBar c={ref.confidence} /></div>
        <div className="row"><label>Clés générées</label><span className="val">{fidelity}</span></div>
        <p className="hint">Résultat = mouvement éditable, de même nature qu'un preset appliqué. Ajuste puis valide.</p>
      </Shell>
    );
  }
  return (
    <Shell title="IA · Animation depuis vidéo"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Annuler</button>
        <button className="tbtn primary" onClick={() => { if (sel == null) { S().toast('Choisis une vidéo'); return; } setReview(true); }}>Analyser</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>IA — animation depuis une vidéo (mocké). Déduit un geste global → preset + params. Sort peu de clés porteuses (jamais une par frame).</p>
      <div className="ref-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {AI_VIDEOS.map((r, i) => (
          <div key={i} className={'ref' + (sel === i ? ' sel' : '')} onClick={() => setSel(i)}>
            <div className="thumb" style={{ background: r.thumb }} /><div className="cap">{r.name} · {r.gesture}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}><label>Fidélité ↔ éditable</label>
        <input className="amber" type="range" min={2} max={6} step={1} value={fidelity} onChange={e => setFidelity(+e.target.value)} />
        <span className="val">{fidelity} clés</span></div>
      <label className="checkline"><FileStub kind="video" /></label>
    </Shell>
  );
}

function ColorModal() {
  useRev(); const st = S(); const proj = st.project;
  if (proj.luts.length === 0) { st.addLut({ name: LUT_PRESETS[0].name, grade: { ...LUT_PRESETS[0].grade }, swatch: LUT_PRESETS[0].swatch }); }
  return (
    <Shell title="Couleur / LUT" footer={<button className="tbtn" onClick={() => S().setModal(null)}>Fermer</button>}>
      <p className="hint" style={{ marginTop: 0 }}>Couleur / LUT (mocké). Déduit une LUT depuis une seule frame → grade appliqué au viewport. Seule sortie hors timeline : va dans ce panneau, jamais dans la timeline.</p>
      <div className="sect-t" style={{ padding: 0, margin: '10px 0 4px' }}>Bibliothèque de LUT</div>
      <div className="lut-lib">
        {proj.luts.map(l => (
          <div key={l.id} className={'lut-sw' + (l.id === proj.activeLutId ? ' sel' : '')} onClick={() => { st.setActiveLut(l.id); applyLutToCanvas(proj); }}>
            <div className="sw" style={{ background: l.swatch }} /><div className="nm">{l.name}</div>
          </div>
        ))}
        <div className={'lut-sw' + (proj.activeLutId === null ? ' sel' : '')} onClick={() => { st.setActiveLut(null); applyLutToCanvas(proj); }}>
          <div className="sw" style={{ background: '#111' }} /><div className="nm">Aucune</div>
        </div>
      </div>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 4px' }}>Dériver depuis une frame</div>
      <div className="tabs">
        {LUT_PRESETS.map(p => (
          <div key={p.name} className="tab" onClick={() => {
            st.addLut({ name: p.name, grade: { ...p.grade }, swatch: p.swatch });
            const last = proj.luts[proj.luts.length - 1]; st.setActiveLut(last.id); applyLutToCanvas(proj); st.toast('LUT « ' + p.name + ' » ajoutée');
          }}>{p.name}</div>
        ))}
      </div>
      <label className="checkline"><FileStub kind="image" /> (échantillonnage palette)</label>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 4px' }}>Depuis une référence IA</div>
      <label className="checkline"><input type="checkbox" /> Matcher la caméra (pose + optique)</label>
      <label className="checkline"><input type="checkbox" defaultChecked /> Matcher la couleur (LUT)</label>
      <div className="hint">Les deux options sont indépendantes (cases séparées).</div>
    </Shell>
  );
}

const RATIOS: [string, number, number][] = [['16:9', 1920, 1080], ['9:16', 1080, 1920], ['1:1', 1080, 1080], ['2.39:1', 2048, 858], ['4:5', 1080, 1350]];

function ExportModal() {
  useRev(); const st = S(); const canvas = st.project.canvas;
  const [fps, setFps] = useState(30);
  const [prog, setProg] = useState(0);

  const canvasEl = () => document.querySelector('#canvas-wrap canvas') as HTMLCanvasElement | null;
  const exportStatic = () => { const c = canvasEl(); if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'director-shot.png'; a.click(); st.toast('Shot statique exporté (PNG)'); };
  const exportVideo = async () => {
    const c = canvasEl(); if (!c) return; const cam = st.active();
    if (cam.keyframes.length === 0) { st.toast('Caméra statique : anime d\'abord'); return; }
    let rec: MediaRecorder;
    const stream = c.captureStream(fps);
    try { rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' }); }
    catch { try { rec = new MediaRecorder(stream, { mimeType: 'video/webm' }); } catch { st.toast('MediaRecorder indisponible'); return; } }
    const chunks: Blob[] = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise<void>(res => { rec.onstop = () => res(); });
    st.setRecording(true); rec.start();
    const dur = st.project.timeline.duration; st.setPlaying(false); st.setPlayhead(0);
    const t0 = performance.now();
    await new Promise<void>(res => {
      const step = () => { const e = (performance.now() - t0) / 1000; st.setPlayhead(Math.min(e, dur)); setProg(Math.min(e / dur, 1) * 100); if (e < dur) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    });
    rec.stop(); await done; st.setRecording(false); setProg(0);
    const blob = new Blob(chunks, { type: 'video/webm' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'director-shot.webm'; a.click();
    st.toast('Vidéo exportée (WebM · ' + fps + 'fps)');
  };

  return (
    <Shell title="Sortie / export"
      footer={<>
        <button className="tbtn" onClick={exportStatic}>⬇ Shot statique (PNG)</button>
        <button className="tbtn primary" onClick={exportVideo}>⬇ Exporter la vidéo</button>
        <button className="tbtn" onClick={() => S().setModal(null)}>Fermer</button></>}>
      <div className="sect-t" style={{ padding: 0, marginBottom: 6 }}>Taille de canvas (réglage projet)</div>
      <div className="seg">
        {RATIOS.map(([lbl, w, h]) => (
          <button key={lbl} className={w === canvas.width && h === canvas.height ? 'sel' : ''} onClick={() => st.setCanvas(w, h)}>{lbl}</button>
        ))}
      </div>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 6px' }}>Export vidéo — caméra active</div>
      <div className="row"><label>Images / s</label>
        <div className="seg">{[24, 30, 60].map(f => <button key={f} className={f === fps ? 'sel' : ''} onClick={() => setFps(f)}>{f}</button>)}</div></div>
      <div className="row"><label>Format</label><span className="val">WebM (VP9)</span></div>
      <div className="hint">Décision ouverte (non tranchée) : « caméra active uniquement » vs « cuts entre caméras ». Implémenté d'abord : caméra active.</div>
      <div className="progress"><i style={{ width: prog + '%' }} /></div>
    </Shell>
  );
}

export default function Modals() {
  useRev();
  const m = S().ui.modal;
  if (m === 'interp') return <InterpModal />;
  if (m === 'ai-image') return <AIImageModal />;
  if (m === 'ai-video') return <AIVideoModal />;
  if (m === 'color') return <ColorModal />;
  if (m === 'export') return <ExportModal />;
  return null;
}
