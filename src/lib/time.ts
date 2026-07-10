// Timecode helpers (After Effects style H;MM;SS;FF) + frame snapping.
export function toTimecode(t: number, fps: number): string {
  const total = Math.max(0, Math.round(t * fps));
  const f = total % fps;
  const s = Math.floor(total / fps) % 60;
  const m = Math.floor(total / (fps * 60)) % 60;
  const h = Math.floor(total / (fps * 3600));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h};${p(m)};${p(s)};${p(f)}`;
}
export const snapToFrame = (t: number, fps: number) => Math.round(t * fps) / fps;
export const toFrames = (t: number, fps: number) => Math.round(t * fps);

// Pick a "nice" tick step (in frames) whose on-screen spacing is at least minPx.
export function niceFrameStep(pxPerFrame: number, fps: number, minPx: number): number {
  const secs = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1200];
  const cands = [1, 2, 5, 10, ...secs.map(s => s * fps)];
  for (const c of cands) if (c * pxPerFrame >= minPx) return c;
  return cands[cands.length - 1];
}
