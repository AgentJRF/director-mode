import { StudioCanvas, LiveCameraRig } from './previewScene';

// Live camera POV for the split view (right pane): renders the studio scene from the active camera's
// current pose/focal, tracking gizmo edits and playback. Read-only, no DoF (separate WebGL context).
export default function CameraPovPreview() {
  return <StudioCanvas><LiveCameraRig /></StudioCanvas>;
}
