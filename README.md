# GodCiv — PWA

A tiny voxel civilization where every villager decides for themselves. You are the god. You never control a villager directly. You nudge, bless, whisper, or bring catastrophe, and watch what they actually do.

Inspired by the civilization game in *Stargate Atlantis*, "The Game" (Sheppard vs. McKay). This is the web/PWA port of the Luanti mod in `godciv-v1.zip`: same sim rules, rebuilt for a phone browser.

## Play

Open the hosted page, or serve this folder locally:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

- **Drag** to look around, **pinch / scroll** to zoom, **⟲ ⟳** to rotate.
- **Tap a villager** to inspect traits, skills, hunger, energy, health, fear.
- **Tap the ground** for cell info.
- **God bar (bottom):** Bless, Drought, Flood, Fire (tap ground), Plague, Quake (tap ground), Order hut, New soul, Whisper.
- **🏛️ panel:** village overview, leader directive, council advice, god log.
- **Speed / pause** are in the top bar. Progress autosaves to this device every 15 seconds and when the tab hides.

### Install as an app

On iPhone: Safari → Share → Add to Home Screen. On Android: Chrome menu → Install app / Add to Home Screen. After the first load it works offline (service worker caches the app shell, including the vendored Three.js build).

## How the sim works

The sim owns the truth (`src/sim.js`, no DOM, no Three.js — testable with node).

- **Utility brain:** every villager re-evaluates every few seconds. Urgent needs (eat, rest, flee) override jobs. Otherwise each job is scored from stockpile deficits, skills, traits, drought, build queue, and any directive — with stickiness so villagers don't churn jobs.
- **Jobs:** farmer, miner, fisher, hunter, builder, hauler. Farmers plant/harvest farm plots, miners work stone/ore nodes, fishers work the lake shore, hunters chase deer, builders work the hut queue, haulers shuttle and fill up.
- **Traits:** devout, skeptic, brave, cautious, industrious, lazy, kind, greedy (two per villager). Skills 0–2 per job.
- **Disobedience:** a directive is a nudge through the leader. Skeptics, low faith, and fear raise the chance a villager ignores it and keeps working.
- **Population:** if edible food is in surplus at dawn and there is room, a new villager joins. Huts raise the cap by 4. Deaths cost faith.
- **Autonomous expansion:** nobody waits for a god order to build. When the village is within 2 of its cap and the stockpile holds 12 wood and 6 stone, builders start a hut on their own. When edible food stays below 20, farmers clear new farm ground (up to 30 plots). The god's Order Hut button only adds an extra hut, faster.
- **Pathfinding:** breadth-first search on the 48×48 grid, around water, trees, and buildings. (The Luanti v1 used steer-to-target; this port has real paths.)
- **Day length:** 360 sim-seconds, same as the Luanti mod. Deer top up to 4.

## Ollama council (opt-in, off by default)

The council only *advises*. It never writes sim state. It suggests a goal and a focus job; the directive still goes through the normal disobedience rules.

1. Run Ollama on a machine your phone can reach. On a phone, `localhost` will not work — use a LAN address, e.g. `http://192.168.1.10:11434/api/chat`.
2. Open ⚙️ Settings in the game, enable the council, set the URL and model (default `qwen3:0.6b`, the same tiny model used in the Luanti mod), and Test.
3. Browser calls from another device need CORS on the Ollama host: run Ollama with `OLLAMA_ORIGINS=*` (or your Pages origin) and restart it.
4. If Ollama is unreachable or returns invalid JSON, the game falls back to the utility-brain council. The game runs fully without Ollama.

## Hosting on GitHub Pages

This repo is a static site — no build step.

1. GitHub repo → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**.
3. **Branch: `main`, folder: `/ (root)`**, Save.
4. The game is live at `https://<your-username>.github.io/godciv/` in a minute or two. Use the `.nojekyll` file already in the repo (it keeps Pages from ignoring files).

## Files

- `index.html` — shell, HUD, god bar, panels, start overlay.
- `src/sim.js` — the sim. Pure logic, no rendering.
- `src/render.js` — Three.js scene, camera, touch controls, picking.
- `src/main.js` — UI glue, god actions, council loop, save/load.
- `src/ollama.js` — Ollama council fetch, validation, fallback.
- `vendor/three.module.js` — Three.js r160, vendored so the PWA works offline.
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA install + offline shell.

## Limits, honestly

- First version graphics are simple boxes, not the Luanti voxel look block-for-block. Villagers are colored blocks with job colors.
- No multiplayer, no rival village/god yet. No families or sleeping in houses yet — those are the next steps, in that order, after this version is played.
- Saves live in the browser's localStorage on one device. No cloud sync.
- Ollama council needs a reachable Ollama server; it does not run on the phone itself.

## License

MIT. See `LICENSE`. Three.js is MIT, vendored under `vendor/`.
