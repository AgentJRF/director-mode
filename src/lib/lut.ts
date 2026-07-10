import type { Project } from '../types';

const grad = (a: string, b: string) => `linear-gradient(135deg,${a},${b})`;

export const LUT_PRESETS = [
  { name: 'Teal & orange', grade: { exposure: 0.05, contrast: 0.18, temperature: 0.15, tint: -0.05, saturation: 0.2 }, swatch: grad('#0e3b45', '#e08a3c') },
  { name: 'Désaturé froid', grade: { exposure: -0.05, contrast: 0.1, temperature: -0.25, tint: 0.05, saturation: -0.35 }, swatch: grad('#3a4650', '#8a97a3') },
  { name: 'Chaud doré', grade: { exposure: 0.1, contrast: 0.08, temperature: 0.35, tint: 0.08, saturation: 0.1 }, swatch: grad('#4a2f12', '#e0b060') },
  { name: 'Nuit bleutée', grade: { exposure: -0.15, contrast: 0.22, temperature: -0.4, tint: -0.1, saturation: -0.1 }, swatch: grad('#0a1420', '#2a4a6a') },
  { name: 'Neutre clean', grade: { exposure: 0, contrast: 0.05, temperature: 0, tint: 0, saturation: 0 }, swatch: grad('#2a2e32', '#c8ccd0') },
];

export function applyLutToCanvas(project: Project) {
  const c = document.querySelector('#canvas-wrap canvas') as HTMLCanvasElement | null;
  if (!c) return;
  const lut = project.luts.find(l => l.id === project.activeLutId);
  if (!lut) { c.style.filter = 'none'; return; }
  const g = lut.grade;
  const brightness = 1 + g.exposure, contrast = 1 + g.contrast, saturate = 1 + g.saturation;
  const sepia = Math.max(0, g.temperature) * 0.5, hue = g.temperature * -14 + g.tint * 20;
  c.style.filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`;
}
