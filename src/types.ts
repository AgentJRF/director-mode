// Director mode — data model (from the brief)
export type Vec3 = [number, number, number];
export type Channel = 'position' | 'rotation' | 'focalLength' | 'poi' | 'aperture' | 'motionBlur';
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInOutStrong';
export type KeySource = 'manual' | 'preset' | 'interpolation' | 'aiVideo';

export interface Keyframe {
  id: string;
  time: number;                 // seconds
  channel: Channel;
  value: Vec3 | number;         // Vec3 for position/rotation, number for focalLength
  ease: Ease;                   // curve ENTERING this key
  source: KeySource;
  // Bézier tangents for the position channel — offsets (world units) relative to `value`.
  // Undefined = auto (1/3 of the chord to the neighbour) → straight segment.
  tangentIn?: Vec3;             // control handle for the segment ARRIVING at this key
  tangentOut?: Vec3;            // control handle for the segment LEAVING this key
}

export interface Target {
  type: 'object' | 'point';
  objectId?: string;
  point?: Vec3;
}

export interface Camera {
  id: string;
  name: string;
  transform: { position: Vec3; rotation: Vec3 };
  optics: { focalLength: number; aperture: number; motionBlurShutter: number; focusPoint?: Vec3 | null };
  target: Target | null;
  keyframes: Keyframe[];
}

export interface LUT {
  id: string;
  name: string;
  grade: { exposure: number; contrast: number; temperature: number; tint: number; saturation: number };
  swatch?: string;
}

export type Tool = 'select' | 'camera' | 'target' | 'optics' | 'generators';

export interface Project {
  cameras: Camera[];
  activeCameraId: string;
  fps: number;
  timeline: { duration: number; playhead: number; playing: boolean };
  canvas: { width: number; height: number };
  luts: LUT[];
  activeLutId: string | null;
}
