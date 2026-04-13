# Sphere Trajectory Simulator

A browser-based 3D simulator for layered spherical projectiles launched from a cylinder.

## Features

- Adjustable FPS from **1 to 30000**.
- Cylinder diameter from **1" to 6"**.
- Sphere diameter from **0.1" to 1"**.
- Sphere spacing from **0" to 0.25"**.
- Vertical rows from **1 to 250**.
- Inset (layer) rows from **1 to 250**.
- Material density presets (common metals and ceramics).
- Retained-speed estimates at **1m, 5m, 10m, and 15m**.
- 3D animated trajectory visualization.
- Export options:
  - Video recording (WebM)
  - PNG snapshot
  - JSON + CSV outputs

## Run

Because this app uses JavaScript modules, run it via a local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes

- Sphere count per row is auto-computed using circumference and spacing.
- Retained-speed values use a simplified drag model intended for comparison and visualization.
