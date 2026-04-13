# Web Trajectory Simulator

A browser-based 3D simulator for sphere trajectories from a cylindrical launcher.

## Features
- FPS range: **1 to 30000**
- Cylinder diameter range: **1" to 6"**
- Sphere size range: **0.1" to 1"**
- Sphere spacing: **0" to 0.25"**
- Vertical rows: **1 to 250**
- Inset rows (layer depth): **1 to 250**
- Material density presets for common metals and ceramics
- Retained speed outputs at **1m, 5m, 10m, 15m**
- Animated 3D simulation
- Exports:
  - Config JSON
  - Retained-speed CSV
  - Animated WebM recording

## Run locally
Open `index.html` in a modern browser, or run a static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Notes
This is an idealized, drag-only model intended for comparative simulation and visualization.
