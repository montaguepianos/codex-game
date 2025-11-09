# Space Blaster 2

A lightweight 3D endless runner prototype powered by Three.js. Pilot a neon hovercraft through an asteroid-dense starfield, weave past debris, juggle your shield’s health bar, and scoop up energy orbs for brief boosts while synth placeholder audio and particle bursts deliver moment-to-moment feedback.

## Gameplay

- **Move**: drag/tap anywhere on the screen or use arrow / WASD keys to roam the entire viewport.
- **Goal**: survive as long as possible, keeping hull integrity above zero. Distance + orbs drive your score.
- **Feedback**: yellow orbs temporarily boost speed, teal orbs repair health, and impacts chew through your shield bar. Drop to 0% and the run resets (best score persists locally). Tap/click once to unmute audio on mobile due to browser autoplay policies.
- **Weapons**: press `Space` on desktop or tap the ⚡️ button on mobile to fire a short-lived laser burst that vaporises asteroids straight ahead (mind the cooldown).

## Tech Stack

- [Three.js](https://threejs.org/) for rendering, lighting, and animation.
- Web Audio API for minimal placeholder SFX.
- Vanilla JavaScript + HTML/CSS—no build step required.

## Run It Locally

The project stays framework-free and deploys anywhere that serves static files (including Vercel). The structure is:

```
index.html       # root HTML shell + HUD markup
styles.css       # shared styles and HUD layout
src/main.js      # Three.js scene + gameplay loop (ES module)
```

Open `index.html` directly in any modern browser or serve the folder with a local server of your choice, e.g.:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js (optional)
npx http-server
```

Then browse to `http://localhost:8000`.

## Next Ideas

- Add real audio and particle assets.
- Introduce power-ups, score chaining, and different sector biomes.
- Export as a Vercel-ready static build (current files already deploy as-is).
