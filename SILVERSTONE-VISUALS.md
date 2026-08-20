# Silverstone visual workflow

Silverstone uses a hybrid workflow: the driveable circuit remains procedural,
surface detail is generated at runtime, and larger trackside structures are
imported as reusable GLB assets. Keep every Silverstone-specific change behind
the `circuit.id === "silverstone"` guard so Pine Run is unaffected.

## Textures

Runtime materials live in `src/scene/SilverstoneMaterials.ts`.

1. Draw deterministic `CanvasTexture` maps for asphalt, shoulder concrete,
   runoff paint, and grass. Use the seeded random helper so every load looks the
   same.
2. Configure maps with `SRGBColorSpace`, `RepeatWrapping`, linear filtering,
   and moderate anisotropy. Track ribbons need `DoubleSide` because their
   winding can reverse around tight bends.
3. Keep texture contrast restrained. Aggregate should break up flat surfaces,
   not read as bright gravel from the chase camera.
4. Apply the materials in `Stage.buildGround()`, `Stage.buildRoad()`, and the
   runoff section of `Stage.buildSilverstoneDetails()`.

Custom ribbon geometry must include UVs. U follows cumulative physical distance
along the track and V crosses the strip:

```ts
distanceAlongTrack += point.distanceTo(previousPoint);
uvs.push(distanceAlongTrack / stripWidth, lateralIndex);
```

Using normalized lap progress stretches one texture tile across hundreds of
metres and creates unwanted longitudinal streaks.

## Meshy assets

The loader and placement definitions live in
`src/scene/SilverstoneAssets.ts`. Final game assets live in `public/models/`.

Current assets:

- `silverstone-grandstand.glb`
- `silverstone-pit-building.glb`

For new structures, generate an isolated, game-ready model with a clean
silhouette, restrained PBR materials, no people, terrain, logos, or unreadable
text. Prefer modular architecture that can be cloned around the circuit. A
useful target is roughly 8–20k triangles for a stand and 12–28k for a larger
building.

Use GLB for the game, enable PBR during refinement, remove baked lighting, and
use 2K textures for distant scenery. Preserve the full Meshy task JSON,
thumbnail, and downloaded model under `meshy_output/`.

When integrating:

1. Cache each `GLTFLoader.loadAsync()` promise so repeated placements download
   the source asset only once.
2. Clone the loaded scene for every placement.
3. Normalize scale from the model's Y height, anchor its bounding-box bottom to
   the sampled track height, and align its long axis with the track tangent.
4. Enable shadows and sensible anisotropy on imported materials.
5. Keep procedural structures as a fallback, then hide them after the authored
   GLB loads successfully.

Placements are defined by a sample index, side, lateral offset, target height,
and optional yaw. This keeps scenery attached to the circuit when control
points are refined.

## Decals and markings

Use thin geometry slightly above the asphalt rather than baking important
markings into the base texture.

- Edge lines and the start line sit about `0.015–0.055` world units above the
  road surface.
- Grid boxes are small `BoxGeometry` meshes oriented from the sampled track
  normal.
- Kerbs and runoff are partial ribbons restricted to corner ranges.
- Rubber, tyre marks, sponsor panels, or painted arrows should use transparent
  decal materials with `depthWrite: false` and a small height offset to avoid
  z-fighting.

Keep markings broad and readable at racing speed. Avoid generated sponsor text;
add deliberate text or logos later as controlled texture planes.

## Geometry refinements

The circuit control points and road construction are in `src/scene/Stage.ts`.

- Preserve a single ordered, closed centerline with no self-intersections.
- Use smooth ribbon geometry for road, shoulders, kerbs, and runoff. Do not
  place overlapping kerb boxes around the entire lap.
- Limit kerbs and wider runoff to braking zones, apexes, and exits.
- Calculate terrain bounds from the circuit samples so the entire track remains
  over the ground plane.
- Keep the start and end control points tangent-compatible; a sharp seam at the
  closed join produces pinched road geometry.
- Place barriers and architecture outside `roadWidth`, leaving enough recovery
  space for gameplay.

Geometry edits must preserve the `701` sampled points expected by checkpoint
and HUD progress logic unless those systems are updated at the same time.

## Verification

After any visual pass:

```sh
bun run build
bun run dev
```

Check both circuits in the browser. For Silverstone, verify:

- asphalt is visible and its texture is not stretched;
- kerbs and decals do not flicker or overlap;
- imported assets sit on the ground and face the circuit;
- the procedural grandstand fallback disappears after GLBs load;
- the minimap centerline does not cross itself;
- there are no console errors while driving.

