import { create } from 'zustand';
import * as THREE from 'three';
import type { Camera, Channel, Ease, KeySource, LUT, Project, Target, Tool, Vec3 } from './types';
import { clamp, eulerFromLookAt, evaluate, keysOf, poiPoint, round, uid, hasAnim } from './lib/eval';

export type ModalKind = null | 'interp' | 'ai-image' | 'ai-video' | 'ai-review-image' | 'ai-review-video' | 'color' | 'export';

// Shared orbit pivot (product center); updated when the asset loads.
export const PIVOT = new THREE.Vector3(0, 0.9, 0);

// Default optics (used at camera creation and by "Reset focus").
export const DEFAULT_APERTURE = 8.0;

function makeCamera(name: string, pos: Vec3 = [4, 2.2, 5]): Camera {
  return {
    id: uid(), name,
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
  hidden: Record<string, boolean>;
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
  removeKeys: (ids: string[]) => void;
  upsertKey: (ch: Channel, value: Vec3 | number, time: number, source?: KeySource, ease?: Ease) => void;
  removeKey: (id: string) => void;
  clearChannel: (ch: Channel) => void;
  clearAnim: () => void;
  setKeyTime: (id: string, t: number) => void;
  setKeyValueComp: (id: string, i: number, v: number) => void;
  setKeyFocal: (id: string, v: number) => void;
  setKeyEase: (id: string, e: Ease) => void;
  commitPose: (position: Vec3, rotation: Vec3) => void;
  addLut: (l: Omit<LUT, 'id'>) => void;
  setActiveLut: (id: string | null) => void;
  setModal: (m: ModalKind) => void;
  setPoseAB: (which: 'A' | 'B', p: Pose | null) => void;
  setRecording: (b: boolean) => void;
  setViewMode: (m: ViewMode) => void;
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
    luts: [], activeLutId: null,
  };
  const bump = () => set(s => ({ rev: s.rev + 1 }));
  const active = () => { const p = get().project; return p.cameras.find(c => c.id === p.activeCameraId)!; };

  return {
    project, rev: 0,
    ui: { tool: 'select', selectedKeyIds: [], poseA: null, poseB: null, modal: null, recording: false, toast: '', viewMode: 'camera', gizmoDragging: false, gizmoMode: 'translate', gizmoSpace: 'local', focusPicking: false, targetSelected: false, hidden: {} },
    bump, active,
    setTool: t => { get().ui.tool = t; bump(); },
    toast: m => { get().ui.toast = m; bump(); setTimeout(() => { if (get().ui.toast === m) { get().ui.toast = ''; bump(); } }, 2600); },
    selectCamera: id => { get().project.activeCameraId = id; get().ui.selectedKeyIds = []; get().ui.targetSelected = false; bump(); },
    addCamera: () => { const p = get().project; const c = makeCamera('Camera ' + String(p.cameras.length + 1).padStart(2, '0')); p.cameras.push(c); p.activeCameraId = c.id; bump(); },
    setPlayhead: t => { get().project.timeline.playhead = clamp(t, 0, get().project.timeline.duration); bump(); },
    setPlaying: p => { get().project.timeline.playing = p; bump(); },
    setDuration: d => { const t = get().project.timeline; t.duration = clamp(Math.round(d * 1000) / 1000, 0.1, 120); if (t.playhead > t.duration) t.playhead = t.duration; bump(); },
    setFps: f => { get().project.fps = clamp(Math.round(f), 1, 120); bump(); },
    setCanvas: (w, h) => { get().project.canvas = { width: w, height: h }; bump(); },
    setOptic: (k, v) => {
      const cam = active(); const t = get().project.timeline.playhead;
      const ch: Channel = k === 'focalLength' ? 'focalLength' : k === 'aperture' ? 'aperture' : 'motionBlur';
      if (keysOf(cam, ch).length) upsertKeyOn(cam, ch, v, t, 'manual'); // animated → key at playhead
      else cam.optics[k] = v;
      bump();
    },
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
    removeKeys: ids => { const c = active(); const set = new Set(ids); c.keyframes = c.keyframes.filter(k => !set.has(k.id)); get().ui.selectedKeyIds = get().ui.selectedKeyIds.filter(id => !set.has(id)); bump(); },
    upsertKey: (ch, value, time, source = 'manual', ease = 'easeInOut') => { upsertKeyOn(active(), ch, value, time, source, ease); bump(); },
    removeKey: id => { const c = active(); c.keyframes = c.keyframes.filter(k => k.id !== id); get().ui.selectedKeyIds = get().ui.selectedKeyIds.filter(x => x !== id); bump(); },
    clearChannel: ch => { const c = active(); c.keyframes = c.keyframes.filter(k => k.channel !== ch); bump(); },
    clearAnim: () => { active().keyframes = []; bump(); },
    setKeyTime: (id, t) => { const k = active().keyframes.find(k => k.id === id); if (k) k.time = clamp(t, 0, get().project.timeline.duration); bump(); },
    setKeyValueComp: (id, i, v) => { const k = active().keyframes.find(k => k.id === id); if (k && Array.isArray(k.value)) { const nv = [...(k.value as Vec3)] as Vec3; nv[i] = v; k.value = nv; } bump(); }, // replace (not mutate) so React/R3F consumers see a new reference
    setKeyFocal: (id, v) => { const k = active().keyframes.find(k => k.id === id); if (k) k.value = v; bump(); },
    setKeyEase: (id, e) => { const k = active().keyframes.find(k => k.id === id); if (k) k.ease = e; bump(); },
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
    addLut: l => { get().project.luts.push({ ...l, id: uid() }); bump(); },
    setActiveLut: id => { get().project.activeLutId = id; bump(); },
    setModal: m => { get().ui.modal = m; bump(); },
    setPoseAB: (which, p) => { if (which === 'A') get().ui.poseA = p; else get().ui.poseB = p; bump(); },
    setRecording: b => { get().ui.recording = b; bump(); },
    setViewMode: m => { get().ui.viewMode = m; bump(); },
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
