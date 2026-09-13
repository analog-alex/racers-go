# Tesla Model Y

A stylized, hand-built Blender model for Racers Go. Its proportions and details are simplified for the game's visual style; the 210 km/h limit is game tuning, not a manufacturer specification.

- `tesla-model-y.blend`: editable vehicle, before studio lights and floor are added.
- `tesla-model-y.png`: studio preview.
- `../../public/models/tesla-model-y.glb`: game asset (approximately 623 KiB, 15,684 triangles).
- `../../scripts/build-model-y.py`: reproducible model, GLB export, and preview generation.

On this Mac, rebuild with Blender outside the sandbox:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-model-y.py
```

The model faces local -X and is exported Y-up. Named steering and wheel empties carry glTF extras (`generatedFrontWheel`, `generatedWheel`, `rollAxis`, `radius`) used by the game's authored wheel mode. Keep the roll pivot at the axle centre when editing the tyres. Materials use Principled BSDF with no external textures.

Run driving tests with `bun test tests/vehicle-performance.test.ts`. With Vite running, open `/tests/wheel-animation.html` for all three models' asset and wheel checks.
