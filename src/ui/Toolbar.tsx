import { S } from '../store';
import { useRev } from './bits';
import type { Tool } from '../types';
import type { ReactNode } from 'react';

// Thin line icons in the Adobe Spectrum / Dimension toolbar style (currentColor, ~1.3 stroke).
const SelectArrow = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
    <path d="M3 2 L3 13.2 L6.1 10.2 L8.3 14.8 L10.2 13.9 L8 9.4 L12.4 9.1 Z"
      fill="currentColor" stroke="rgba(0,0,0,.5)" strokeWidth="0.6" strokeLinejoin="round" />
  </svg>
);
// video camera (Camera / orbit)
const CameraIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
    <rect x="1.5" y="4.7" width="9" height="6.6" rx="1.4" />
    <path d="M10.5 7 L14.5 4.8 L14.5 11.2 L10.5 9 Z" />
  </svg>
);
// reticle (Target / aim)
const TargetIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3">
    <circle cx="8" cy="8" r="5" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    <path d="M8 0.8 L8 3 M8 13 L8 15.2 M0.8 8 L3 8 M13 8 L15.2 8" strokeLinecap="round" />
  </svg>
);
// start keyframe → arrow to the end (Interpolate A→B)
const InterpIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="2.9" cy="8" r="1.9" fill="currentColor" stroke="none" />
    <line x1="5.2" y1="8" x2="12.4" y2="8" />
    <path d="M9.4 5 L13.2 8 L9.4 11" />
  </svg>
);

// Primary nav/edit tools (above the separator); target moves below it (see render).
const TOP_TOOLS: { id: Tool; icon: ReactNode; title: string }[] = [
  { id: 'select', icon: <SelectArrow />, title: 'Select (V)' },
  { id: 'camera', icon: <CameraIcon />, title: 'Camera / orbit (C)' },
];

export default function Toolbar() {
  useRev();
  const tool = S().ui.tool;
  return (
    <div id="toolbar">
      {TOP_TOOLS.map(t => (
        <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} title={t.title}
          onClick={() => S().setTool(t.id)}>{t.icon}</button>
      ))}
      <div className="tool-sep" />
      <button className={'tool' + (tool === 'target' ? ' active' : '')} title="Target (T)"
        onClick={() => S().setTool('target')}><TargetIcon /></button>
      <button className={'tool' + (S().ui.interp ? ' active' : '')} title="Interpolate — click camera A then B (A→B)"
        onClick={() => (S().ui.interp ? S().cancelInterp() : S().startInterp())}><InterpIcon /></button>
    </div>
  );
}
