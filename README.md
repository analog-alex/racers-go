# Racers, Go!

**Racers, Go!** is a browser-based driving game built with TypeScript, Three.js, and Vite. Choose your F1 machine, pick a high-speed formula circuit, then chase a clean, faster lap.

## Play

The garage currently includes two selectable cars:

- **Retro Force** — a modern single-seater tuned for precision.
- **E-Modern** — a black-and-yellow retro-modern Grand Prix car.

The game currently includes two circuits:

- **Silverstone** — a 5.9 km formula circuit with high-speed steering, braking, aero load, and live-style telemetry.
- **Suzuka GP** — a 5.8 km technical formula circuit with Esses, Spoon, 130R, and a flowing figure-eight rhythm.

Each stage has split gates, progress tracking, a minimap, a countdown, failure recovery, and a finish screen with elapsed time, personal best, and delta comparison. Best times are stored locally in the browser for each circuit.

## Controls

| Action | Both circuits |
| --- | --- |
| Accelerate | `W` / `↑` |
| Steer | `A` / `←`, `D` / `→` |
| Brake | `Space` |
| Reset stage | `R` |
| Pause / resume | `Esc` |

## Local development

This project uses Bun and requires a current Node-compatible development environment.

```sh
bun install --frozen-lockfile
bun run dev
```

Open the local Vite URL printed in the terminal. The production build can be checked with:

```sh
bun run build
bun run preview
```

## Project structure

```text
src/
├── core/       # game loop, input, circuit definitions, vehicle dynamics
├── scene/      # Three.js stages, cars, materials, and scenery
└── ui/         # HUD and timing/result interfaces
public/models/  # optional authored vehicle and scenery GLB assets
```

Both cars share the same lightweight Formula dynamics model initially. `Stage` owns each sampled route, road surface, checkpoints, minimap geometry, and procedural scenery. The UI is regular HTML/CSS layered above the Three.js canvas, with live GLB-backed car previews in the garage.

## CI and deployment

Pull requests run the workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which installs the frozen Bun lockfile and runs the production build.

Pushes to `master` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), build the Vite app, upload `dist/` as a Pages artifact, and deploy it through GitHub Pages. The Vite configuration uses a relative base path so the game works from a repository Pages URL.

## License

No license has been selected for this project yet.
