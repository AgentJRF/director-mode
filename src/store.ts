import { create } from 'zustand';
import * as THREE from 'three';
import type { Camera, Channel, Ease, KeySource, Project, Target, Tool, Vec3 } from './types';
import { clamp, eulerFromLookAt, evaluate, keysOf, poiPoint, round, uid, hasAnim } from './lib/eval';

export type ModalKind = null | 'interp' | 'ai-image' | 'ai-video' | 'ai-review-image' | 'ai-review-video' | 'export';

// Shared orbit pivot (product center); updated when the asset loads.
export const PIVOT = new THREE.Vector3(0, 0.9, 0);

// Default optics (used at camera creation and by "Reset focus").
export const DEFAULT_APERTURE = 8.0;

// Distinct, cycling palette for camera tracks/gizmos (first one = the legacy purple).
export const CAM_COLORS = ['#8e63b3', '#5b8fbf', '#57a07d', '#cf9a58', '#cc6a61', '#c56a9f', '#57b3b3', '#9fa563'];

function makeCamera(name: string, pos: Vec3 = [4, 2.2, 5], color: string = CAM_COLORS[0]): Camera {
  return {
    id: uid(), name, color,
    transform: { position: pos, rotation: eulerFromLookAt(pos, [0, 0.9, 0]) },
    optics: { focalLength: 35, aperture: DEFAULT_APERTURE, motionBlurShutter: 180, focusPoint: null },
    target: null, keyframes: [],
  };
}

export interface Pose { position: Vec3; rotation: Vec3; focal: number; }

export type ViewMode = 'camera' | 'scene';
interface UI {
  tool: Tool;
  selectedKeyIds: string[];
  poseA: Pose | null;
  poseB: Pose | null;
  modal: ModalKind;
  recording: boolean;
  toast: string;
  viewMode: ViewMode;
  gizmoDragging: boolean;
  gizmoMode: 'translate' | 'rotate';
  gizmoSpace: 'world' | 'local';
  focusPicking: boolean;
  targetSelected: boolean;
  multiview: boolean;
  split: boolean;        // side-by-side Scene | Camera view
  motionBlur: boolean;
  splineViz: 'none' | 'height' | 'speed';
  hidden: Record<string, boolean>;
  // Viewport A→B interpolation: null = off; { a: null } = picking A; { a: id } = A picked, waiting for B.
  interp: { a: string | null } | null;
}

interface StoreState {
  project: Project;
  ui: UI;
  rev: number;
  bump: () => void;
  // selectors as helpers
  active: () => Camera;
  // actions
  setTool: (t: Tool) => void;
  toast: (m: string) => void;
  selectCamera: (id: string) => void;
  addCamera: () => void;
  removeCamera: (id: string) => void;
  setCameraColor: (id: string, color: string) => void;
  startInterp: () => void;
  pickInterp: (id: string) => void;
  cancelInterp: () => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setDuration: (d: number) => void;
  setFps: (f: number) => void;
  setCanvas: (w: number, h: number) => void;
  setOptic: (k: 'focalLength' | 'aperture' | 'motionBlurShutter', v: number) => void;
  toggleKeyAt: (ch: Channel, value: Vec3 | number) => void;
  editPose: (channel: 'position' | 'rotation', i: number, value: number) => void;
  editPoi: (i: number, value: number) => void;
  setFocusPoint: (p: Vec3 | null) => void;
  setFocusPicking: (b: boolean) => void;
  toggleHidden: (id: string) => void;
  resetFocus: () => void;
  setTarget: (t: Target | null) => void;
  selectTarget: (b: boolean) => void;
  selectKey: (id: string | null) => void;
  setSelectedKeys: (ids: string[]) => void;
  toggleSelectKey: (id: string) => void;
  removeKeys: (ids: string[]) => void;
  upsertKey: (ch: Channel, value: Vec3 | number, time: number, source?: KeySource, ease?: Ease) => void;
  removeKey: (id: string) => void;
  clearChannel: (ch: Channel) => void;
  clearAnim: () => void;
  setKeyTime: (id: string, t: number) => void;
  setKeyValueComp: (id: string, i: number, v: number) => void;
  setKeyTangent: (id: string, which: 'in' | 'out', v: Vec3 | null) => void;
  setKeyFocal: (id: string, v: number) => void;
  setKeyEase: (id: string, e: Ease) => void;
  setKeysEase: (ids: string[], e: Ease) => void;
  commitPose: (position: Vec3, rotation: Vec3) => void;
  setModal: (m: ModalKind) => void;
  setPoseAB: (which: 'A' | 'B', p: Pose | null) => void;
  setRecording: (b: boolean) => void;
  setViewMode: (m: ViewMode) => void;
  setMultiview: (b: boolean) => void;
  setSplit: (b: boolean) => void;
  setMotionBlur: (b: boolean) => void;
  setSplineViz: (m: 'none' | 'height' | 'speed') => void;
  setGizmoDragging: (b: boolean) => void;
  setGizmoMode: (m: 'translate' | 'rotate') => void;
  setGizmoSpace: (s: 'world' | 'local') => void;
}

export const useStore = create<StoreState>((set, get) => {
  const initial = makeCamera('Camera 01');
  const project: Project = {
    cameras: [initial], activeCameraId: initial.id, fps: 30,
    timeline: { duration: 5, playhead: 0, playing: false },
    canvas: { width: 1920, height: 1080 },
  };
  const bump = () => set(s => ({ rev: s.rev + 1 }));
  const active = () => { const p = get().project; return p.cameras.find(c => c.id === p.activeCameraId)!; };

  return {
    project, rev: 0,
    ui: { tool: 'select', selectedKeyIds: [], poseA: null, poseB: null, modal: null, recording: false, toast: '', viewMode: 'camera', gizmoDragging: false, gizmoMode: 'translate', gizmoSpace: 'local', focusPicking: false, targetSelected: false, multiview: false, split: false, motionBlur: false, splineViz: 'none', hidden: {}, interp: null },
    bump, active,
    setTool: t => { get().ui.tool = t; bump(); },
    toast: m => { get().ui.toast = m; bump(); setTimeout(() => { if (get().ui.toast === m) { get().ui.toast = ''; bump(); } }, 2600); },
    selectCamera: id => { get().project.activeCameraId = id; get().ui.selectedKeyIds = []; get().ui.targetSelected = false; bump(); },
    addCamera: () => { const p = get().project; const c = makeCamera('Camera ' + String(p.cameras.length + 1).padStart(2, '0'), undefined, CAM_COLORS[p.cameras.length % CAM_COLORS.length]); p.cameras.push(c); p.activeCameraId = c.id; bump(); },
    removeCamera: id => {
      const p = get().project;
      if (p.cameras.length <= 1) { get().toast('At least one camera is required'); return; } // keep ≥1 camera
      const idx = p.cameras.findIndex(c => c.id === id); if (idx < 0) return;
      p.cameras.splice(idx, 1);
      if (p.activeCameraId === id) p.activeCameraId = p.cameras[Math.min(idx, p.cameras.length - 1)].id;
      const ui = get().ui; ui.selectedKeyIds = []; ui.targetSelected = false; delete ui.hidden['cam:' + id];
      bump();
    },
    setCameraColor: (id, color) => { const c = get().project.cameras.find(c => c.id === id); if (c) { c.color = color; bump(); } },
    startInterp: () => {
      const p = get().project;
      if (p.cameras.length < 2) { get().toast('Add a second camera first'); return; }
      const ui = get().ui; ui.viewMode = 'scene'; ui.multiview = false; ui.tool = 'select'; ui.selectedKeyIds = []; ui.interp = { a: null };
      get().toast('Interpolate — click camera A'); bump();
    },
    pickInterp: id => {
      const ui = get().ui; if (!ui.interp) return;
      if (ui.interp.a === null) { ui.interp = { a: id }; get().toast('Now click camera B'); bump(); return; }
      const idA = ui.interp.a; if (idA === id) { get().toast('Pick a different camera for B'); return; }
      // Fuse A→B into ONE 2-key camera (brief: no ghost cameras). Reuse A (keep its colour); drop B.
      const p = get().project; const A = p.cameras.find(c => c.id === idA); const B = p.cameras.find(c => c.id === id);
      ui.interp = null;
      if (!A || !B) { bump(); return; }
      const t1 = p.timeline.duration; const pa = evaluate(A, 0); const pb = evaluate(B, 0);
      A.keyframes = []; const tgt = A.target ?? B.target ?? null; A.target = tgt;
      upsertKeyOn(A, 'position', pa.position, 0, 'interpolation', 'linear');
      upsertKeyOn(A, 'position', pb.position, t1, 'interpolation', 'easeInOut');
      if (!tgt) {
        upsertKeyOn(A, 'rotation', pa.rotation, 0, 'interpolation', 'linear');
        upsertKeyOn(A, 'rotation', pb.rotation, t1, 'interpolation', 'easeInOut');
      }
      upsertKeyOn(A, 'focalLength', pa.focalLength, 0, 'interpolation', 'linear');
      upsertKeyOn(A, 'focalLength', pb.focalLength, t1, 'interpolation', 'easeInOut');
      A.name = A.name + ' → ' + B.name;
      p.cameras = p.cameras.filter(c => c.id !== id); p.activeCameraId = A.id;
      get().setPlayhead(0); get().toast('Interpolated A → B — 1 camera, editable spline'); bump();
    },
    cancelInterp: () => { get().ui.interp = null; get().toast('Interpolation cancelled'); bump(); },
    setPlayhead: t => { get().project.timeline.playhead = clamp(t, 0, get().project.timeline.duration); bump(); },
    setPlaying: p => { get().project.timeline.playing = p; bump(); },
    setDuration: d => { const t = get().project.timeline; t.duration = clamp(Math.round(d * 1000) / 1000, 0.1, 120); if (t.playhead > t.duration) t.playhead = t.duration; bump(); },
    setFps: f => { get().project.fps = clamp(Math.round(f), 1, 120); bump(); },
    setCanvas: (w, h) => { get().project.canvas = { width: w, height: h }; bump(); },
    setOptic: (k, v) => { active().optics[k] = v; bump(); }, // optics are static per shot (not keyframable)
    toggleKeyAt: (ch, value) => {
      const cam = active(); const t = get().project.timeline.playhead;
      const ex = keysOf(cam, ch).find(k => Math.abs(k.time - t) < 0.02);
      if (ex) { cam.keyframes = cam.keyframes.filter(k => k.id !== ex.id); get().ui.selectedKeyIds = get().ui.selectedKeyIds.filter(id => id !== ex.id); bump(); return; }
      if (ch === 'poi') { // POI must own the aim → ensure a point target (rotation becomes derived)
        if (cam.target?.type === 'object') return;
        if (!cam.target || cam.target.type !== 'point') { cam.target = { type: 'point', point: value as Vec3 }; cam.keyframes = cam.keyframes.filter(k => k.channel !== 'rotation'); }
      }
      if (ch === 'rotation' && cam.target) return; // rotation owned by target
      upsertKeyOn(cam, ch, value, t, 'manual'); bump();
    },
    editPose: (channel, i, value) => {
      const cam = active(); const t = get().project.timeline.playhead;
      if (channel === 'rotation' && cam.target) return; // rotation owned by target
      const cur = (evaluate(cam, t)[channel] as Vec3).slice() as Vec3; cur[i] = value;
      if (keysOf(cam, channel).length) upsertKeyOn(cam, channel, cur, t, 'manual');
      else cam.transform[channel] = cur;
      bump();
    },
    editPoi: (i, value) => {
      const cam = active(); const t = get().project.timeline.playhead;
      if (cam.target?.type === 'object') return; // aim locked by object target
      const cur = poiPoint(cam, t).slice() as Vec3; cur[i] = value;
      // editing the POI makes it own the aim → ensure a point target (rotation becomes derived)
      if (!cam.target || cam.target.type !== 'point') { cam.target = { type: 'point', point: cur }; cam.keyframes = cam.keyframes.filter(k => k.channel !== 'rotation'); }
      if (keysOf(cam, 'poi').length) upsertKeyOn(cam, 'poi', cur, t, 'manual');
      else cam.target.point = cur;
      bump();
    },
    setFocusPoint: p => { active().optics.focusPoint = p; bump(); },
    setFocusPicking: b => { get().ui.focusPicking = b; bump(); },
    toggleHidden: id => { const h = get().ui.hidden; h[id] = !h[id]; bump(); },
    resetFocus: () => { const o = active().optics; o.focusPoint = null; o.aperture = DEFAULT_APERTURE; get().ui.focusPicking = false; bump(); },
    setTarget: t => {
      const c = active(); c.target = t;
      if (t) c.keyframes = c.keyframes.filter(k => k.channel !== 'rotation'); // rotation now owned by the target
      if (!t || t.type === 'object') c.keyframes = c.keyframes.filter(k => k.channel !== 'poi'); // POI locked/derived here
      get().ui.targetSelected = false; // changing/clearing the target deselects the badge
      bump();
    },
    selectTarget: b => { get().ui.targetSelected = b; bump(); },
    selectKey: id => { get().ui.selectedKeyIds = id ? [id] : []; bump(); },
    setSelectedKeys: ids => { get().ui.selectedKeyIds = ids; bump(); },
    toggleSelectKey: id => { const s = get().ui.selectedKeyIds; get().ui.selectedKeyIds = s.includes(id) ? s.filter(x => x !== id) : [...s, id]; bump(); },
    removeKeys: ids => { const c = active(); const set = new Set(ids); c.keyframes = c.keyframes.filter(k => !set.has(k.id)); get().ui.selectedKeyIds = get().ui.selectedKeyIds.filter(id => !set.has(id)); bump(); },
    upsertKey: (ch, value, time, source = 'manual', ease = 'easeInOut') => { upsertKeyOn(active(), ch, value, time, source, ease); bump(); },
    removeKey: id => { const c = active(); c.keyframes = c.keyframes.filter(k => k.id !== id); get().ui.selectedKeyIds = get().ui.selectedKeyIds.filter(x => x !== id); bump(); },
    clearChannel: ch => { const c = active(); c.keyframes = c.keyframes.filter(k => k.channel !== ch); bump(); },
    clearAnim: () => { active().keyframes = []; bump(); },
    setKeyTime: (id, t) => { const k = active().keyframes.find(k => k.id === id); if (k) k.time = clamp(t, 0, get().project.timeline.duration); bump(); },
    setKeyValueComp: (id, i, v) => { const k = active().keyframes.find(k => k.id === id); if (k && Array.isArray(k.value)) { const nv = [...(k.value as Vec3)] as Vec3; nv[i] = v; k.value = nv; } bump(); }, // replace (not mutate) so React/R3F consumers see a new reference
    setKeyTangent: (id, which, v) => { const k = active().keyframes.find(k => k.id === id); if (k) { const nv = v ? ([...v] as Vec3) : undefined; if (which === 'out') k.tangentOut = nv; else k.tangentIn = nv; } bump(); }, // v=null clears the tangent (back to auto/straight)
    setKeyFocal: (id, v) => { const k = active().keyframes.find(k => k.id === id); if (k) k.value = v; bump(); },
    setKeyEase: (id, e) => { const k = active().keyframes.find(k => k.id === id); if (k) k.ease = e; bump(); },
    setKeysEase: (ids, e) => { const c = active(); c.keyframes.forEach(k => { if (ids.includes(k.id)) k.ease = e; }); bump(); },
    commitPose: (position, rotation) => {
      const c = active(); const t = get().project.timeline.playhead;
      if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', position, t, 'manual');
      else c.transform.position = position;
      if (!c.target) {
        if (keysOf(c, 'rotation').length) upsertKeyOn(c, 'rotation', rotation, t, 'manual');
        else c.transform.rotation = rotation;
      }
      bump();
    },
    setModal: m => { get().ui.modal = m; bump(); },
    setPoseAB: (which, p) => { if (which === 'A') get().ui.poseA = p; else get().ui.poseB = p; bump(); },
    setRecording: b => { get().ui.recording = b; bump(); },
    setViewMode: m => { get().ui.viewMode = m; bump(); },
    setMultiview: b => { const ui = get().ui; ui.multiview = b; if (b) ui.split = false; bump(); },
    setSplit: b => { const ui = get().ui; ui.split = b; if (b) { ui.viewMode = 'scene'; ui.multiview = false; } bump(); },
    setMotionBlur: b => { get().ui.motionBlur = b; bump(); },
    setSplineViz: m => { get().ui.splineViz = m; bump(); },
    setGizmoDragging: b => { get().ui.gizmoDragging = b; bump(); },
    setGizmoMode: m => { get().ui.gizmoMode = m; bump(); },
    setGizmoSpace: s => { get().ui.gizmoSpace = s; bump(); },
  };
});

export function upsertKeyOn(cam: Camera, ch: Channel, value: Vec3 | number, time: number, source: KeySource = 'manual', ease: Ease = 'easeInOut') {
  const ks = keysOf(cam, ch);
  const ex = ks.find(k => Math.abs(k.time - time) < 0.02);
  const v = Array.isArray(value) ? (value.slice() as Vec3) : value;
  if (ex) { ex.value = v; ex.source = source; return ex; }
  const k = { id: uid(), time: round(time, 3), channel: ch, value: v, ease: ks.length ? ease : ('linear' as Ease), source };
  cam.keyframes.push(k); return k;
}

// convenience for non-hook access
export const S = () => useStore.getState();
export { evaluate, hasAnim };
