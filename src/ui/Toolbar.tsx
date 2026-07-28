import { S } from '../store';
import { useRev } from './bits';
import type { Tool } from '../types';
import type { ReactNode } from 'react';

// classic selection-pointer arrow
const SelectArrow = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
    <path d="M3 2 L3 13.2 L6.1 10.2 L8.3 14.8 L10.2 13.9 L8 9.4 L12.4 9.1 Z"
      fill="currentColor" stroke="rgba(0,0,0,.5)" strokeWidth="0.6" strokeLinejoin="round" />
  </svg>
);

const TOOLS: { id: Tool; icon: ReactNode; title: string }[] = [
  { id: 'select', icon: <SelectArrow />, title: 'Select (V)' },
  { id: 'camera', icon: '🎥', title: 'Camera / orbit (C)' },
  { id: 'target', icon: '◎', title: 'Target (T)' },
  { id: 'optics', icon: '◉', title: 'Optics (O)' },
];

export default function Toolbar() {
  useRev();
  const tool = S().ui.tool;
  return (
    <div id="toolbar">
      {TOOLS.map(t => (
        <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} title={t.title}
          onClick={() => S().setTool(t.id)}>{t.icon}</button>
      ))}
      <div className="tool-sep" />
      <button className={'tool' + (S().ui.interp ? ' active' : '')} title="Interpolate — click camera A then B (A→B)"
        onClick={() => (S().ui.interp ? S().cancelInterp() : S().startInterp())}>⇄</button>
      <button className={'tool gen' + (tool === 'generators' ? ' active' : '')} title="Generators (G)"
        onClick={() => S().setTool(tool === 'generators' ? 'select' : 'generators')}>✦</button>
    </div>
  );
}
