# Pine Run visual workflow

Pine Run uses the same hybrid approach as Silverstone: the playable rally stage,
surface texture, and forest stay procedural while reusable trackside structures
load as optional GLB assets. Keep all Pine-specific work behind
`circuit.id === "pine-run"`; the open forest stage must never affect
Silverstone.

## Textures

Runtime materials live in `src/scene/PineRunMaterials.ts`.

1. Draw deterministic `CanvasTexture` maps for compacted gravel, dirt
   shoulder, forest floor, and transparent mud patches. Use the seeded random
   helper so a reload does not alter the stage.
2. Configure maps with `SRGBColorSpace`, `RepeatWrapping`, linear filtering,
   moderate anisotropy, and `DoubleSide` for track ribbons.
3. Keep gravel contrast restrained. Individual stones should break up the
   surface, rather than become high-frequency visual noise at rally speed.
4. Apply materials in `Stage.buildGround()`, `Stage.buildRoad()`, and the
   local mud pass in `Stage.buildPineRunDetails()`.

All custom road ribbons need UVs. U must use cumulative physical distance and
V must cross the strip:

```ts
distanceAlongTrack += point.distanceTo(previousPoint);
uvs.push(distanceAlongTrack / stripWidth, lateralIndex);
```

Never use normalized stage progress for U: it stretches small gravel detail
along the entire 3.1 km route.

## Meshy assets

The loader and placements live in `src/scene/PineRunAssets.ts`. Final game
assets live in `public/models/`.

Current assets:

- `pine-run-timing-hut.glb`
- `pine-run-log-barrier.glb`

Generate isolated, game-ready, reusable models with clean silhouettes and
restrained PBR materials. Exclude people, terrain, trees, vehicles, logos,
sponsor marks, and readable generated text. Use GLB with PBR enabled, 2K
textures, no baked lighting, and preserve the task JSON, thumbnail, and model
under `meshy_output/`.

The loader caches source `GLTFLoader.loadAsync()` promises, clones models per
placement, normalizes from Y height, anchors their bounding-box bottoms to the
selected track sample, aligns them to the tangent, and enables shadows and
texture anisotropy. It keeps procedural huts and log barriers as fallbacks and
removes each fallback only after its authored model succeeds.

Placements use sample index, side, lateral offset, desired height, and yaw.
Keep scenery outside the recovery space; a hut is 38 units out and the barrier
is 25 units out from the centreline.

## Rally details

Use thin geometry just above the gravel for important stage marks.

- The start line and mud patches sit about `0.025–0.105` world units above the
  road surface.
- Use local mud and tyre-detail patches only in braking and exit zones.
- Keep any arrows, route boards, or decals broad and legible; use transparent
  materials with `depthWrite: false` to avoid z-fighting.
- Do not add Formula-style kerbs, grid boxes, sponsor panels, or generated
  signage to this rally stage.

## Geometry and scenery

- Preserve Pine Run as an **open** rally stage; do not close its start/end
  curve to imitate Silverstone.
- Preserve the 701 sampled points expected by checkpoint and HUD progress.
- Keep the seeded procedural forest (`8184`) and mountains as the broad,
  low-cost scenery layer; the GLBs are focal props, not a replacement forest.
- Keep road shoulders smooth, use localized surface detail, and leave a safe
  recovery margin before barriers and buildings.
- Compute terrain bounds from the stage samples so the complete route remains
  over the ground plane.

## Verification

After a Pine Run visual pass:

```sh
bun run build
bun run dev
```

Check both circuits in the browser. For Pine Run, verify that gravel detail is
not stretched, mud patches do not flicker, GLBs are grounded and tangent
aligned, procedural fallbacks disappear only after the corresponding GLB
loads, the minimap remains a single open route, and no console errors occur
while driving. Then confirm Silverstone is visually unchanged.
