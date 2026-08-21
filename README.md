# Racers, Go!

**Racers, Go!** is a browser-based driving game built with TypeScript, Three.js, and Vite. Choose a loose-surface rally stage or a high-speed formula circuit, then chase a clean, faster time.

## Play

The game currently includes two circuits:

- **Pine Run** — a 3.1 km forest rally stage with gravel handling, controllable slides, handbrake rotation, and a visible dust plume.
- **Silverstone** — a 5.9 km formula circuit with high-speed steering, braking, aero load, and live-style telemetry.

Each stage has split gates, progress tracking, a minimap, a countdown, failure recovery, and a finish screen with elapsed time, personal best, and delta comparison. Best times are stored locally in the browser for each circuit.

## Controls

| Action | Pine Run | Silverstone |
| --- | --- | --- |
| Accelerate | `W` / `↑` | `W` / `↑` |
| Steer | `A` / `←`, `D` / `→` | `A` / `←`, `D` / `→` |
| Handbrake / brake | `Space` | `Space` |
| Reset stage | `R` | `R` |
| Pause / resume | `Esc` | `Esc` |

On Pine Run, lift and brake before a corner, then use measured steering or the handbrake to rotate the car. The gravel model allows normal turn-in and more exaggerated slides when the rear tyres are unloaded.

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

The rally and formula cars use separate lightweight dynamics models. `Stage` owns the sampled route, road surface, checkpoints, minimap geometry, and procedural scenery. The UI is regular HTML/CSS layered above the Three.js canvas.

## CI and deployment

Pull requests run the workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which installs the frozen Bun lockfile and runs the production build.

Pushes to `master` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), build the Vite app, upload `dist/` as a Pages artifact, and deploy it through GitHub Pages. The Vite configuration uses a relative base path so the game works from a repository Pages URL.

## License

No license has been selected for this project yet.
