# Markov Tile Sequencer (static)

A tiny, no-build, Web Audio step sequencer with **tiles** connected by **Markov transition weights**.

## Features

- Step grid sequencer (Kick / Snare / Hat + configurable note channels)
- Tile-specific loop length (beats per tile)
- Multiple **tiles** (each tile has its own pattern)
- Per-tile **transition weights** (including self-loop)
- Playback starts on the **Start tile** and advances at the end of each tile loop
- Configurable note channels (note + waveform) and optional per-tile drones (multiple drones per tile)
- **Shareable URL** (encodes BPM, tracks, tiles, patterns, drones, and transitions into the URL hash)

## Usage

- Click grid cells to toggle steps.
- Create tiles with **+ New**; rename/delete as needed.
- Set **Beats per tile** to change how long each tile loops.
- In **Note channels**, add/remove channels and change note + waveform.
- In **Drones (per tile)**, add/remove drones and set note + waveform + volume (enable them to hear them during playback).
- In **Transitions**, set weights to choose where to go after each loop.
- Press **Play** (required to unlock Web Audio).
- Use **Copy Share URL** to share your current setup.

No build step: just open `index.html`.
