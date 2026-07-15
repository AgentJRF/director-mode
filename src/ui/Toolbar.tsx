import { S } from '../store';
import { useRev } from './bits';
import type { Tool } from '../types';

const TOOLS: { id: Tool; icon: string; title: string }[] = [
  { id: 'select', icon: '⌖', title: 'Select (V)' },
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
      <button className={'tool gen' + (tool === 'generators' ? ' active' : '')} title="Generators (G)"
        onClick={() => S().setTool(tool === 'generators' ? 'select' : 'generators')}>✦</button>
    </div>
  );
}
