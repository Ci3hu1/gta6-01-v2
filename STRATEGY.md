# Solmar Bay — strategy

## What the brief rewards

Completeness, shown in screenshots: a city explored on foot and by car,
traffic and pedestrians, cars to steal and drive, a wanted level with police
who respond, missions and a story, combat, a HUD with a minimap, a start and a
save — all wired together and all visible in the four screenshots.

## What the leaders do (live top-10 study, 17 Nov 2026)

All top-10 entries withhold their source; the study is titles, live scores and
public artifact screenshots only. The visible pattern: a named fictional
coastal city, timed missions, a wanted-star police system, money and garage
upgrades, a minimap and HUD, radio/dispatch flavour text, day and chapter
progression, a start screen and a save. Top-10 judge win rates span only
987,355–990,081 — completeness and polish decide, not one trick.

## What we follow, and our edge

- Follow the leaders: named city, 12 timed missions over 3 days, wanted
  0–5 with chases, roadblocks at 3+ and foot officers at 2+, money and three
  garage upgrades, minimap, radio dispatch, day/chapter banner, save/load.
- Edge over the leaders: every brief system is wired into one loop instead
  of shown once — missions pay money, money buys upgrades, upgrades change
  driving and survivability, wanted rises from the player's own crimes
  (theft, hitting pedestrians, shooting near police) and decays when clean,
  and the finale mission forces the player to hold a position under heat.
- Four screenshots, each showing several systems at once: the title over a
  living city, a mission drive with wanted stars, a four-star chase with a
  roadblock, and the victory screen with the run's stats.

## Measured checks

- Kit check: 0 failed (run `node cli/makefun.mjs check --kit <kit> --repo .`).
- Playtest (`tests/playtest.mjs`, Node, imports the world directly): 23
  assertions — mission advance, car theft, driving, wanted gain and decay,
  police spawn and roadblocks, shooting, busted and wasted transitions,
  garage upgrades, mission timer expiry, victory, save/load round-trip,
  respawn, survive step.
- Smoke (`tests/smoke.mjs`, headless Chromium over CDP): the page loads with
  zero console errors and zero non-localhost requests; the four `?shot=`
  scenes render and `window.__shotReady` fires; screenshots are 1280x800
  and under 256 KiB.
- Dossier: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` writes a
  valid `out/dossier.json`.

## Tried and dropped

- A helicopter unit at 5 stars: cut — a searchlight circle read as a UI bug
  in the minimap at this scale; ground units carry the heat instead.
- Traffic cars that brake for the player: cut — they caused pile-ups at
  intersections; they now slow only for the car directly ahead.
- A mission-fail screen of its own: folded into a banner — the mission
  restarts in place and the player keeps moving.

## Expected outcomes

- A solid v1: every system present and verified, screenshots readable at a
  glance when shrunk to the contact sheet.
- The live score decides the next version: if the judge's heat ranks the
  entry below the paid places, the next iteration adds mission variety
  (a tailing mission and a timed escape) rather than more polish.
