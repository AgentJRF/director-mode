import * as THREE from 'three';
// Bridge between the r3f canvas and the DOM overlay (spline handles project from here).
export const R3: { cam: THREE.PerspectiveCamera | null; wrap: HTMLElement | null } = { cam: null, wrap: null };
