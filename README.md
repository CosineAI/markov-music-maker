# Markov Tile Sequencer (static)

A tiny, no-build, Web Audio step sequencer with **tiles** connected by **Markov transition weights**.

## Features

- 16-step grid sequencer (Kick / Snare / Hat + a few notes)
- Multiple **tiles** (each tile has its own pattern)
- Per-tile **transition weights** (including self-loop)
- Playback starts on the **Start tile** and advances at the end of each 16-step loop
- **Shareable URL** (encodes BPM, tiles, patterns, and transitions into the URL hash)

## Usage

- Click grid cells to toggle steps.
- Create tiles with **+ New**; rename/delete as needed.
- In **Transitions**, set weights to choose where to go after each loop.
- Press **Play** (required to unlock Web Audio).
- Use **Copy Share URL** to share your current setup.

No build step: just open `index.html`.
