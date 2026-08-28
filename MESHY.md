# Using Meshy in Racers Go

Meshy is used to generate the game's textured GLB car assets. Generated work stays in `meshy_output/`; approved models are copied into `public/models/` only after they have been inspected.

## Setup

1. Create a Meshy API key at <https://www.meshy.ai/settings/api>.
2. Put it in the repository's uncommitted `.env` file:

   ```dotenv
   MESHY_API_KEY=msy_your_key_here
   ```

3. Use the Codex `meshy-3d-generation` skill. It provides the `meshy_task.py` CLI used for environment checks, balance checks, task creation, polling, downloads, and metadata recording. Do not put the API key in source code or browser-side requests.

Before spending credits, always:

- run the CLI's `check-env` and `balance` commands;
- state the complete workflow and exact estimated cost;
- get explicit approval;
- inspect thumbnails before downloading a large model.

Meshy tasks are asynchronous. Creating a task returns a task ID, which must be polled until `SUCCEEDED`. A task sitting at 99% for a while is normal. Download successful assets promptly because Meshy API assets have limited retention.

## Recommended car workflow

For a reference photo, use this two-step pipeline:

1. **Image to image:** create a clean, unbranded studio reference. Remove scenery, motion blur, logos, sponsor names, numbers, and trademarks. Ask for the whole car, a neutral background, even lighting, and visible gaps between the wheels and body.
2. **Image to 3D:** use Smart Topology with `model_type: "smart-topology"` and `ai_model: "meshy-t2"`. Request a textured PBR GLB, a game-sized polygon budget, and four inspection views.

Important image-to-3D options:

```json
{
  "model_type": "smart-topology",
  "ai_model": "meshy-t2",
  "target_polycount": 15000,
  "should_texture": true,
  "enable_pbr": true,
  "texture_resolution": "2k",
  "multi_view_thumbnails": true,
  "alpha_thumbnail": true,
  "target_formats": ["glb"],
  "auto_size": true,
  "origin_at": "bottom"
}
```

Keep generated files organized as:

```text
meshy_output/
  history.json
  YYYYMMDD_HHmmss_description_taskid/
    metadata.json
    task_<task-id>.json
    thumbnail-*.png
    model.glb
```

The task JSON records the real `consumed_credits`; report that value and check the remaining balance instead of relying only on an estimate.

## Game integration checklist

- Inspect the front, rear, left, and right thumbnails for shape errors.
- Prefer GLB for Three.js because it packages geometry, textures, and PBR materials.
- Check model size and triangle count before replacing the live asset.
- Preserve the previous GLB in the Meshy project directory as a rollback copy.
- Copy the approved model to its car-specific path in `public/models/`.
- Run `bun run build`, then test the car from the chase camera in the game.

Smart Topology can return visually separate parts inside one exported mesh. The car loader identifies four disconnected wheel components when available and places them into axle-centred pivots. This provides real wheel roll and front-wheel steering; the current fused slick-tyre export remains stable with static wheels.

## Current Retro Force car

- Cleanup task: `01a0114a-2ca1-72c0-8ee7-3c3dd29625e9`
- Smart Topology task: `01a0114b-b23f-734f-a037-da5e5c5a975b`
- Result: 13,087 triangles, 7.1 MB GLB
- Generation cost: 24 credits total

The generation records, reference image, model, thumbnails, and previous-car backup are under the corresponding `meshy_output/` generation directories.

## E-Modern car

- Cleanup task: `01a04a21-3e87-73bc-8bea-3fe416832561` (9 credits)
- Smart Topology task: `01a04a23-418f-7769-aa97-4c7fb37045fc` (15 credits)
- Result: inspected front, right, back, and left views; 6.5 MB GLB
- Generation cost: 24 credits total
- Live asset: `public/models/retro-force.glb` (the filename remains stable for existing references).
- Generation records, cleaned reference, model, and thumbnails are under `meshy_output/20260828_215024_retro-force-f1-smart-topology_01a04a23/`.
