import { StudioCanvas, LiveCameraRig } from './previewScene';

// Live camera POV for the split view (right pane): renders the studio scene from the active camera's
// current pose/focal, tracking gizmo edits and playback. No DoF — a 2nd postprocessing EffectComposer
// in this extra WebGL context renders black; the bokeh is visible in the full "Camera" view.
export default function CameraPovPreview() {
  return <StudioCanvas><LiveCameraRig /></StudioCanvas>;
}
