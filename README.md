# Director mode — prototype

Prototype web interactif d'un espace d'animation et de composition de caméra pour un
logiciel 3D (concept **Adobe Substance 3D Stager**). On place et anime des caméras autour
d'un produit, via plusieurs façons de créer (manuel, presets, interpolation A→B, IA mockée),
toutes convergeant vers **une seule timeline de clés éditables**.

Cahier des charges (brief) :
`Studio - Studio_2026/Video/Director Mode - Camera mode Prototype/Documents/director-mode-prototype.md`

## Stack
- **React + Vite + TypeScript**
- **three.js** + **@react-three/fiber** + **@react-three/drei** + **@react-three/postprocessing**
- **zustand** (état central unique)
- Asset produit : glTF Stager (sac « barrel bag ») chargé depuis `public/asset/`

## Démarrer (sur n'importe quelle machine)
Prérequis : **Node.js 20+** (installé ici via `winget install OpenJS.NodeJS.LTS`).

```bash
npm install
powershell -ExecutionPolicy Bypass -File scripts/fetch-asset.ps1   # récupère l'asset depuis OneDrive
npm run dev        # http://127.0.0.1:5173
```

> L'asset produit (© Adobe Inc.) est **hors du dépôt** ; `fetch-asset.ps1` le copie depuis
> OneDrive vers `public/asset/`. Sans OneDrive sur la machine, place l'asset à la main
> (`studio_packshot.gltf` + `.bin` + `studio_packshot_images/`).

Build de production : `npm run build` puis `npm run preview`.

> Windows : si `node` n'est pas dans le PATH du terminal, ouvre un nouveau terminal après
> l'install de Node, ou ajoute `C:\Program Files\nodejs` au PATH.

## Structure
```
src/
  types.ts                 modèle de données (Keyframe, Camera, LUT, Project…)
  store.ts                 store zustand — SOURCE DE VÉRITÉ unique (+ actions)
  lib/eval.ts              évaluation des clés à l'instant t, easing, look-at, spherical
  lib/presets.ts           presets trajectoire/courbe, interpolation A→B, resample IA
  lib/lut.ts               LUT presets + application du grade au viewport
  three/
    Scene.tsx              Canvas r3f, lumières, sol, DoF (mode Caméra), 2 caméras
    Product.tsx            useGLTF du packshot + normalisation/placement
    CameraController.tsx   pilote la caméra "render" depuis l'état ; orbit-compose (mode Caméra)
    SceneGizmos.tsx        vue Scène : frustum + spline 3D + poignées + gizmo PivotControls
    SplineOverlay.tsx      vue Caméra : spline en overlay SVG projeté
    shared.ts              pont r3f ↔ overlay DOM
  ui/                      Topbar, Toolbar, Inspector, Timeline, Generators, ViewPills, HUD, Modals, Toast
public/asset/              studio_packshot.gltf + .bin (45 Mo) + textures PBR
```

## Principes non négociables (respectés)
1. **Une seule timeline, la clé comme unité.** Tout générateur écrit des `Keyframe`.
2. Presets/IA produisent des **clés éditables** (jamais de boîte noire).
3. Raisonnement **par canal** : `position`, `rotation`, `focalLength`.
4. Un `target` actif possède le canal `rotation` (édition manuelle verrouillée).
5. Peu de clés lisibles.
6. Une vraie `PerspectiveCamera` **pilotée par l'état** (focale→fov, capteur 36 mm).

## Deux vues du viewport (façon Cinema 4D)
- **◉ Caméra** : à travers la caméra animée (rendu final + DoF/bokeh).
- **⬚ Scène** : caméra d'édition libre ; on voit le **frustum** de la caméra + la **spline
  d'animation en 3D** + poignées de clés. Gizmo **combiné** (translation + rotation) sur la
  caméra (drei `PivotControls`). Toggle repère **World / Objet** (raccourci `R`, défaut Objet).

## Raccourcis
`Espace` lecture/pause · `V/C/T/O` outils · `G` générateurs · `R` repère gizmo (World/Objet) ·
`Suppr` supprimer la clé sélectionnée.

## État & pistes (voir git log pour le détail)
Fait : socle scène + caméra, timeline/clés, spline éditable, presets, interpolation A→B,
target/look-at, IA mock (image/vidéo) + revue, LUT, export (WebM/PNG), double vue + gizmo.
Pistes : cuts multi-caméras à l'export, exposer les 3 caméras du glTF comme poses de départ,
raccourci Caméra/Scène, icônes Spectrum officielles.

## Note de portabilité
Le projet est volontairement **hors OneDrive** (pour ne pas synchroniser `node_modules`).
Utiliser **Git** pour passer d'une machine à l'autre : cloner, puis `npm install` +
`scripts/fetch-asset.ps1`. L'asset (© Adobe Inc.) est **hors du dépôt** (voir `.gitignore`) et
récupéré depuis OneDrive — le repo ne contient pas d'IP Adobe et peut donc vivre sur un compte
Git perso **privé**.
