import { useState } from 'react';
import { S, PIVOT } from '../store';
import MatchPreview from '../three/MatchPreview';
import { useRev, grad } from './bits';
import { evaluate, eulerFromLookAt, sphericalToPose, clamp } from '../lib/eval';
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

// Camera estimate returned by /api/match-camera (Claude vision or heuristic fallback).
type Estimate = { azimuth_deg: number; elevation_deg: number; distance_factor: number; focal_mm: number; aperture_f: number; confidence: number; reasoning: string; mocked?: boolean };
type MatchForm = { azimuth: number; elevation: number; distance: number; focal: number; aperture: number };

const AI_VIDEOS = [
  { name: 'Orbital reveal', gesture: 'orbit', thumb: grad('#243b55', '#141e30'), params: { duration: 4, amplitude: 0.9, ease: 'easeInOut' as const }, confidence: 0.82 },
  { name: 'Dramatic push-in', gesture: 'dolly', thumb: grad('#3a2e2a', '#171310'), params: { duration: 3, amplitude: 1.1, ease: 'easeIn' as const }, confidence: 0.86 },
  { name: 'Vertigo / dolly-zoom', gesture: 'dollyZoom', thumb: grad('#2b3a2e', '#12160f'), params: { duration: 3.5, amplitude: 0.8, ease: 'easeInOut' as const }, confidence: 0.71 },
  { name: 'Sweeping pan', gesture: 'pan', thumb: grad('#2e2a3a', '#13111a'), params: { duration: 2.5, amplitude: 1.2, ease: 'easeOut' as const }, confidence: 0.79 },
];

const ConfBar = ({ c }: { c: number }) => (
  <span className="conf" style={{ flex: 1 }}>
    <span className="conf-bar"><i style={{ width: Math.round(c * 100) + '%', background: c > 0.8 ? '#4fb477' : c > 0.7 ? '#e0a34a' : '#d9614e' }} /></span>
    <span className="val">{Math.round(c * 100)}%</span>
  </span>
);
const FileStub = ({ kind }: { kind: 'image' | 'video' }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
    <span>… or import:</span><input type="file" accept={kind === 'image' ? 'image/*' : 'video/*'} style={{ fontSize: 11 }} /><span className="badge proto">estimated</span>
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
          {pose ? `pos ${pose.position.map(v => v.toFixed(1)).join(', ')}\nfocal ${Math.round(pose.focal)}mm` : '— not captured —'}
        </div>
        <button className="btn-sm btn-full" style={{ marginTop: 8 }} onClick={() => capture(which)}>Capture current view</button>
      </div>
    );
  };
  return (
    <Shell title="Interpolation A → B"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Cancel</button><button className="tbtn primary" onClick={fuseAB}>Merge into 1 camera</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Compose a view and capture A, compose another and capture B. Merging creates ONE 2-key camera (A and B don't remain as ghost cameras).</p>
      <div className="ref-grid" style={{ gridTemplateColumns: '1fr 1fr' }}><Card which="A" /><Card which="B" /></div>
    </Shell>
  );
}

function AIImageModal() {
  const [img, setImg] = useState<{ data: string; media: string; url: string; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [form, setForm] = useState<MatchForm | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const url = rd.result as string;
      const data = url.slice(url.indexOf(',') + 1);
      const media = url.slice(5, url.indexOf(';'));
      const im = new Image();
      im.onload = () => setImg({ data, media, url, w: im.naturalWidth, h: im.naturalHeight });
      im.src = url;
    };
    rd.readAsDataURL(f);
  };

  const analyze = async () => {
    if (!img) { S().toast('Upload an image first'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/match-camera', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: img.data, mediaType: img.media, width: img.w, height: img.h }) });
      const e = await r.json() as Estimate;
      setEst(e);
      setForm({ azimuth: e.azimuth_deg, elevation: e.elevation_deg, distance: e.distance_factor, focal: e.focal_mm, aperture: e.aperture_f });
    } catch { S().toast('AI request failed'); }
    setBusy(false);
  };

  // Apply a framing to the ACTIVE camera (no keys) — used both for the live preview and the final apply.
  const applyForm = (f: MatchForm) => {
    const r = clamp(f.distance * 2, 1.6, 14); // product is ~2 units tall (Product.tsx normalises height→2)
    const theta = f.azimuth * Math.PI / 180;
    const phi = clamp((90 - f.elevation) * Math.PI / 180, 0.12, Math.PI - 0.12);
    const pos = sphericalToPose({ r, theta, phi }, PIVOT);
    const st = S(); const cam = st.active();
    cam.transform.position = pos;
    cam.transform.rotation = eulerFromLookAt(pos, PIVOT.toArray() as Vec3);
    cam.optics.focalLength = clamp(f.focal, 14, 200);
    cam.optics.aperture = clamp(f.aperture, 1.4, 16); // aperture drives the bokeh strength (DoF)
    cam.optics.focusPoint = null; // anchor focus on the product (General) — clears any stale picked point
    st.bump();
  };

  const back = () => { setEst(null); setForm(null); };          // return to upload (real camera untouched)
  const cancel = () => S().setModal(null);
  const apply = () => {                                          // commit the framing to the active camera
    if (form) { applyForm(form); S().setViewMode('camera'); }
    S().setModal(null); S().toast('Pose composed from image (no keys)');
  };

  if (est && form) {
    const aspect = S().project.canvas.width / S().project.canvas.height;
    const num = (label: string, key: keyof MatchForm, step: number, min: number, max: number) => (
      <div className="row"><label>{label}</label>
        <input type="number" step={step} value={form[key]} style={{ width: 80 }}
          onChange={e => setForm({ ...form, [key]: clamp(parseFloat(e.target.value) || 0, min, max) })} /></div>
    );
    // Floating window with a windowed render preview next to the reference — nothing is applied to the
    // real camera until "Apply pose".
    return (
      <Shell title="AI review · Match camera from image"
        footer={<><button className="tbtn" onClick={back}>← Back</button>
          <button className="tbtn primary" onClick={apply}>Apply pose</button></>}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Reference</div>
            {img && <img src={img.url} alt="reference" style={{ width: '100%', aspectRatio: String(aspect), objectFit: 'contain', borderRadius: 6, border: '1px solid var(--line-2)', background: '#000' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Preview render</div>
            <div style={{ width: '100%', aspectRatio: String(aspect), borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line-2)' }}>
              <MatchPreview azimuth={form.azimuth} elevation={form.elevation} distance={form.distance} focal={form.focal} aperture={form.aperture} aspect={aspect} />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}><label>Confidence</label><ConfBar c={est.confidence} /></div>
        {est.mocked && <span className="badge proto">estimated (heuristic)</span>}
        <p className="hint" style={{ marginTop: 6 }}>{est.reasoning}</p>
        <div className="sect-t" style={{ padding: 0, margin: '12px 0 2px' }}>Estimated framing — adjustable</div>
        {num('Azimuth °', 'azimuth', 1, -180, 180)}
        {num('Elevation °', 'elevation', 1, -25, 85)}
        {num('Distance ×', 'distance', 0.1, 1.2, 7)}
        {num('Focal mm', 'focal', 1, 14, 200)}
        {num('Aperture f/', 'aperture', 0.1, 1.4, 16)}
        <p className="hint">Composes a shot — writes no keyframes. The timeline is unchanged.</p>
      </Shell>
    );
  }

  return (
    <Shell title="AI · Match camera from image"
      footer={<><button className="tbtn" onClick={cancel}>Cancel</button>
        <button className="tbtn primary" onClick={analyze}>{busy ? 'Analyzing…' : 'Analyze'}</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Upload a reference photo — the AI estimates the camera angle, focal length and aperture, then composes the shot (writes NO keys).</p>
      <label className="ai-drop">
        {img ? <img src={img.url} alt="reference" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
          : <span style={{ color: 'var(--ink-2)' }}>⬆ Click to upload an image (JPG / PNG)</span>}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
      </label>
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
      <Shell title="AI review · Animation"
        footer={<><button className="tbtn" onClick={() => setReview(false)}>← Back</button>
          <button className="tbtn primary" onClick={() => {
            const st = S(); const cam = st.active(); cam.keyframes = [];
            applyPreset(ref.gesture, { ...ref.params });
            resampleChannel(cam, 'position', fidelity);
            cam.keyframes.forEach(k => (k.source = 'aiVideo'));
            st.setModal(null); st.toast('AI animation applied — ' + fidelity + ' editable keys'); st.bump();
          }}>Apply animation</button></>}>
        <div className="row"><label>Detected gesture</label><span className="val">{ref.gesture}</span></div>
        <div className="row"><label>Confidence</label><ConfBar c={ref.confidence} /></div>
        <div className="row"><label>Keys generated</label><span className="val">{fidelity}</span></div>
        <p className="hint">Result = editable motion, same as an applied preset. Adjust then apply.</p>
      </Shell>
    );
  }
  return (
    <Shell title="AI · Animation from video"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Cancel</button>
        <button className="tbtn primary" onClick={() => { if (sel == null) { S().toast('Pick a video'); return; } setReview(true); }}>Analyze</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>AI — animation from a video (mocked). Infers a global gesture → preset + params. Outputs few carrier keys (never one per frame).</p>
      <div className="ref-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {AI_VIDEOS.map((r, i) => (
          <div key={i} className={'ref' + (sel === i ? ' sel' : '')} onClick={() => setSel(i)}>
            <div className="thumb" style={{ background: r.thumb }} /><div className="cap">{r.name} · {r.gesture}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}><label>Fidelity ↔ editable</label>
        <input className="amber" type="range" min={2} max={6} step={1} value={fidelity} onChange={e => setFidelity(+e.target.value)} />
        <span className="val">{fidelity} keys</span></div>
      <label className="checkline"><FileStub kind="video" /></label>
    </Shell>
  );
}

function ColorModal() {
  useRev(); const st = S(); const proj = st.project;
  if (proj.luts.length === 0) { st.addLut({ name: LUT_PRESETS[0].name, grade: { ...LUT_PRESETS[0].grade }, swatch: LUT_PRESETS[0].swatch }); }
  return (
    <Shell title="Color / LUT" footer={<button className="tbtn" onClick={() => S().setModal(null)}>Close</button>}>
      <p className="hint" style={{ marginTop: 0 }}>Color / LUT (mocked). Derives a LUT from a single frame → grade applied to the viewport. Off-timeline: lives here, never in the timeline.</p>
      <div className="sect-t" style={{ padding: 0, margin: '10px 0 4px' }}>LUT library</div>
      <div className="lut-lib">
        {proj.luts.map(l => (
          <div key={l.id} className={'lut-sw' + (l.id === proj.activeLutId ? ' sel' : '')} onClick={() => { st.setActiveLut(l.id); applyLutToCanvas(proj); }}>
            <div className="sw" style={{ background: l.swatch }} /><div className="nm">{l.name}</div>
          </div>
        ))}
        <div className={'lut-sw' + (proj.activeLutId === null ? ' sel' : '')} onClick={() => { st.setActiveLut(null); applyLutToCanvas(proj); }}>
          <div className="sw" style={{ background: '#111' }} /><div className="nm">None</div>
        </div>
      </div>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 4px' }}>Derive from a frame</div>
      <div className="tabs">
        {LUT_PRESETS.map(p => (
          <div key={p.name} className="tab" onClick={() => {
            st.addLut({ name: p.name, grade: { ...p.grade }, swatch: p.swatch });
            const last = proj.luts[proj.luts.length - 1]; st.setActiveLut(last.id); applyLutToCanvas(proj); st.toast('LUT "' + p.name + '" added');
          }}>{p.name}</div>
        ))}
      </div>
      <label className="checkline"><FileStub kind="image" /> (palette sampling)</label>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 4px' }}>From an AI reference</div>
      <label className="checkline"><input type="checkbox" /> Match camera (pose + optics)</label>
      <label className="checkline"><input type="checkbox" defaultChecked /> Match color (LUT)</label>
      <div className="hint">Both options are independent (separate checkboxes).</div>
    </Shell>
  );
}

const RATIOS: [string, number, number][] = [['16:9', 1920, 1080], ['9:16', 1080, 1920], ['1:1', 1080, 1080], ['2.39:1', 2048, 858], ['4:5', 1080, 1350]];

function ExportModal() {
  useRev(); const st = S(); const canvas = st.project.canvas;
  const [fps, setFps] = useState(30);
  const [prog, setProg] = useState(0);

  const canvasEl = () => document.querySelector('#canvas-wrap canvas') as HTMLCanvasElement | null;
  const exportStatic = () => { const c = canvasEl(); if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'director-shot.png'; a.click(); st.toast('Still shot exported (PNG)'); };
  const exportVideo = async () => {
    const c = canvasEl(); if (!c) return; const cam = st.active();
    if (cam.keyframes.length === 0) { st.toast('Static camera: animate first'); return; }
    let rec: MediaRecorder;
    const stream = c.captureStream(fps);
    try { rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' }); }
    catch { try { rec = new MediaRecorder(stream, { mimeType: 'video/webm' }); } catch { st.toast('MediaRecorder unavailable'); return; } }
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
    st.toast('Video exported (WebM · ' + fps + 'fps)');
  };

  return (
    <Shell title="Output / export"
      footer={<>
        <button className="tbtn" onClick={exportStatic}>⬇ Still shot (PNG)</button>
        <button className="tbtn primary" onClick={exportVideo}>⬇ Export video</button>
        <button className="tbtn" onClick={() => S().setModal(null)}>Close</button></>}>
      <div className="sect-t" style={{ padding: 0, marginBottom: 6 }}>Canvas size (project setting)</div>
      <div className="seg">
        {RATIOS.map(([lbl, w, h]) => (
          <button key={lbl} className={w === canvas.width && h === canvas.height ? 'sel' : ''} onClick={() => st.setCanvas(w, h)}>{lbl}</button>
        ))}
      </div>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 6px' }}>Video export — active camera</div>
      <div className="row"><label>Frames / s</label>
        <div className="seg">{[24, 30, 60].map(f => <button key={f} className={f === fps ? 'sel' : ''} onClick={() => setFps(f)}>{f}</button>)}</div></div>
      <div className="row"><label>Format</label><span className="val">WebM (VP9)</span></div>
      <div className="hint">Open decision (not settled): active camera only vs cuts between cameras. Active camera first.</div>
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
