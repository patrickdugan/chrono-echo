# CHRONO ECHO // Paradox Arena

A zero-dependency HTML5 Canvas + Procedural WebAudio **time-loop twin-stick roguelite**.

## Core Mechanics
- **Manifest Time Echo (`Right-Click` or `Q`)**: Summons a holographic recording of your past 5 seconds of movement, dashes, and weapon fire. Echoes draw enemy directional shields toward them so you can flank for **Backstab Crits** (`2.4x+` damage).
- **Crossfire Overload**: Hitting the same target with both your live ship and an active Time Echo within `0.95s` triggers an electric Crossfire burst (`1.65x+` damage, combo boost, and optional chain lightning).
- **Chrono Rewind (`E`)**: Snaps you back `2.6s` along your golden timeline ribbon, **restoring Hull HP lost in that window**, leaving a 6-bolt Paradox Remnant, and freezing nearby hostiles.
- **Phase Dash (`Space` / `Shift`) & Quantum Resonance**: Invulnerable directional dash. Grazing enemy fire triggers **Bullet-Time Surge**, and dashing *through* your own active Time Echo unleashes a bullet-clearing **Quantum Resonance Nova** while extending the Echo's duration.
- **3 Tactical Weapons (`1` / `2` / `3` / `Mouse Wheel`)**:
  1. **Pulse Rail**: High-velocity precision lance (pierces on Crit).
  2. **Scatter Prism**: 6-shard spread burst that shatters destructible enemy orbs.
  3. **Graviton Orb**: Deploys a spacetime-warping gravity vortex that clusters enemies for Echo crossfire before imploding.
- **Modes**: 10-Wave **Campaign** culminating against **The Omega Chronarch** (3-phase celestial clockwork boss), **Endless Overdrive**, and deterministic **Daily Paradox Seed**.

## Running Locally
Open `index.html` (or `dist/chrono-echo-standalone.html`) directly in any modern browser, or serve over HTTP:

```powershell
python -m http.server 8765
```

Rebuild the standalone single-file bundle:

```powershell
python scripts/bundle.py
```
