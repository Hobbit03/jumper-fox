# Jumper Fox

A tiny one-button neon arcade game. Vanilla HTML, CSS and JavaScript — no frameworks, no build step, no runtime dependencies.

## Play

- **Space / click / tap** — jump. Hold longer to jump higher.
- **Press again in the air** — dash forward through the sound barrier.
- Clear neon spikes and high-flying birds for **+5 steps** on every clean pass. Birds sit in the jump arc — run under them or leap clean over them.
- The world speeds up **9% every 100 steps**. One hit ends the run.
- Procedural synthwave music plays in the background and follows the same sound toggle as the SFX.
- Your best score is saved in `localStorage`; the sound toggle is remembered too.

## Run locally with pnpm

```bash
pnpm install   # optional: the game has no dependencies
pnpm dev
```

Then open <http://localhost:5173>.

If pnpm is not installed yet:

```bash
corepack enable
# or: npm install -g pnpm
```

You can also just open `index.html` directly in a browser — the game works from `file://` since there are no modules or fetches. The tiny Node server exists only so the URL matches a normal dev workflow.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Canvas, HUD, start screen and game-over panel |
| `style.css` | Neon UI, overlays, scanlines and responsive layout |
| `game.js` | Game loop, physics, spawning, particles, synth audio |
| `server.js` | Zero-dependency static dev server (port 5173) |
