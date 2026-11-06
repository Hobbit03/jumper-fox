# Jumper Fox

A tiny one-button neon arcade game. Vanilla HTML, CSS and JavaScript — no frameworks, no build step, no runtime dependencies.

## Play

- **Space / click / tap** — jump. Hold longer to jump higher.
- **Press again in the air** — dash forward through the sound barrier.
- Clear neon spikes and high-flying birds for **+5 steps** on every clean pass. Birds sit in the jump arc — run under them or leap clean over them.
- The world speeds up **9% every 100 steps**. One hit ends the run.
- Procedural synthwave music plays in the background and follows the same sound toggle as the SFX.
- Your best score is saved in `localStorage`; the sound toggle is remembered too.

## On a phone

The game is landscape-first, so on a portrait phone it shows a **ROTATE YOUR PHONE** card with a one-tap **PLAY IN PORTRAIT** option. Both modes are fully playable.

- **Landscape** shows the full 16:9 track.
- **Portrait** is a real portrait layout, not the landscape view squeezed down: the world re-flows to a narrower, taller camera with the action anchored near the bottom, a full-height neon sky above it, and larger UI built for one thumb.
- Rotating the phone mid-run re-lays out the world and keeps the run alive.

- Tap anywhere to jump; hold to jump higher; tap again in the air to dash.
- No page scrolling, zooming or pull-to-refresh: the stage locks to the viewport.
- HUD and overlays respect the notch and safe-area insets.
- Touch targets, score text and the sound button grow on coarse-pointer devices, and the controls show `TAP` instead of `SPACE`.
- On short landscape screens the start and game-over panels compact themselves so nothing gets clipped.
- Add it to your home screen for a full-screen, browser-chrome-free run.

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
