# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ci3hu1/gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Ci3hu1/gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — a complete open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Top-down 2D canvas, vanilla JS,
no libraries, no network requests — plain static files under `game/`.

Lucia Reyes came back to Solmar Bay broke. Fixer Mara Voss has work: **12 missions over
3 days**, from a first delivery at the Old Market to the Casino Royale vault run. Explore
the city on foot and by car, steal cars (walk up, press **E**), outrun the Solmar PD
(wanted stars 0–5, chases, roadblocks), fight on foot, and spend mission cash on garage
upgrades at Benny's Garage.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **WASD / arrows** — walk & drive · **Mouse** — aim · **Click** — shoot
- **E** — steal a car / get out · **Space** — punch / handbrake · **H** — horn
- **P** — pause · **S** (paused) — save · **C** (title) — continue saved game
- **1 / 2 / 3** at Benny's Garage — speed / armor / repair

## Systems

City (6 districts, 10 named locations) · traffic cars + pedestrians · car theft · wanted
stars + police chases + roadblocks + foot officers · 12-mission story with timers ·
on-foot combat · money + garage upgrades · HUD + minimap + radio dispatch · save/load ·
WebAudio synth SFX · Busted / Wasted / victory screens.

## Layout

- `game/src/config.js` — tuning, districts, locations, the 12 missions
- `game/src/city.js` — the road grid, blocks, buildings, collision helpers
- `game/src/world.js` — the pure simulation (no browser in it): player, traffic,
  pedestrians, police, bullets, missions, wanted level, money
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — WebAudio synth sound effects
- `game/src/render.js` — canvas drawing: city, entities, HUD, minimap, screens
- `game/src/shots.js` — the four staged screenshot scenes
- `game/src/main.js` — boot, the fixed-step loop, screens, save/load
- `tests/` — Node unit tests of the simulation plus a headless-browser smoke test
