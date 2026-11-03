# GodCiv always-on server

The same sim rules as the PWA (`src/sim.js`), ticking on a server
whether any phone is open or not. No dependencies; Node 18+.

## Run it

```sh
node server/server.js
```

Env: `PORT` (3000), `HOST` (127.0.0.1 — loopback only; put a TLS
reverse proxy in front for phone access), `WORLD_FILE` (`./world.json`),
`GODCIV_SEED` (42, only when no save exists), `GODCIV_SPEED`
(sim-seconds per real second, 1).

The world saves every 15s and on shutdown. Restarting resumes the
same village from `world.json`.

## API

- `GET /api/health` — day, villagers, elapsed, speed, seed.
- `GET /api/state` — full serialized world; the PWA client feeds it
  straight into `deserialize()`.
- `POST /api/god` — JSON `{action, x, z, focusJob, text}`. Actions:
  bless, drought, flood, fire, plague, quake, hut, villager,
  directive, whisper. Cooldowns and validation are enforced by
  `applyGod` itself; the response carries `{ok, reason, state}`.

The server also serves the PWA files (index, src, vendor, service
worker, manifest) from the repo root, allowlisted paths only.

## systemd

`godciv.service` runs it as user `ubuntu` from
`/home/ubuntu/godciv-server` (a clone of this repo), restarting on
failure. Install with:

```sh
sudo cp server/godciv.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now godciv
```
