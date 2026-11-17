// Solmar Bay playtest — Node unit tests of the pure simulation (world.js has
// no browser in it, so it imports directly). Run: node tests/playtest.mjs
import { createRandom } from '../game/src/random.js';
import {
  createWorld, EVENT_BUSTED, EVENT_MISSION, EVENT_STOLE, EVENT_VICTORY,
  EVENT_WASTED,
} from '../game/src/world.js';
import { MISSIONS } from '../game/src/config.js';

const ZERO = {
  mx: 0, my: 0, shoot: false, aimX: 0, aimY: 0,
  punch: false, steal: false, handbrake: false, horn: false, garageKey: 0,
};

let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
}

function fresh(seed = 7) {
  return createWorld(createRandom(seed));
}

function stepN(world, seconds, input = ZERO) {
  let events = 0;
  const n = Math.floor(seconds / (1 / 60));
  for (let i = 0; i < n; i += 1) events |= world.step(1 / 60, input);
  return events;
}

// 1. Fresh world: the player starts on foot, healthy, broke and clean.
{
  const w = fresh();
  const p = w.state.player;
  check('fresh world: foot, hp 100, $0, wanted 0', p.mode === 'foot' && p.health === 100 && p.money === 0 && p.wanted === 0);
  check('fresh world: 14 traffic cars, 26 pedestrians', w.state.cars.filter((c) => c.kind === 'traffic').length === 14 && w.state.peds.length === 26);
  check('fresh world: mission 1 is First Delivery, 90s', w.currentMission().title === 'First Delivery' && w.state.missionTimeLeft === 90);
}

// 2. Mission 1 advances: Old Market, then Surf Shack completes it.
{
  const w = fresh();
  w.state.player.x = 400;
  w.state.player.y = 400;
  w.step(1 / 60, ZERO);
  check('mission 1 step 1 completes at Old Market', w.state.stepIndex === 1);
  w.state.player.x = 400;
  w.state.player.y = 900;
  const events = w.step(1 / 60, ZERO);
  check('mission 1 completes at Surf Shack (+$120)', (events & EVENT_MISSION) !== 0 && w.state.missionIndex === 1 && w.state.player.money === 120);
}

// 3. Car theft: walk up to a traffic car, press E, drive away wanted.
{
  const w = fresh();
  const car = w.state.cars.find((c) => c.kind === 'traffic');
  car.x = w.state.player.x + 30;
  car.y = w.state.player.y;
  const events = w.step(1 / 60, { ...ZERO, steal: true });
  check('stealing a car switches to car mode', w.state.player.mode === 'car' && w.state.player.car === car);
  check('stealing adds 1 wanted star and an event', (events & EVENT_STOLE) !== 0 && w.state.player.wanted === 1);
  check('stolen car counts in stats', w.state.stats.carsStolen === 1);
}

// 4. Driving: holding up accelerates the car, steering turns it.
{
  const w = fresh();
  const car = w.state.cars.find((c) => c.kind === 'traffic');
  car.x = 1000;
  car.y = 820;
  car.angle = -Math.PI / 2;
  w.state.player.x = 1000;
  w.state.player.y = 850;
  w.step(1 / 60, { ...ZERO, steal: true });
  w.state.player.car.angle = -Math.PI / 2;
  // Straight north up road x=1000 first, so the speed builds without the car
  // turning into a building; then steer to check the heading changes.
  stepN(w, 1.5, { ...ZERO, mx: 0, my: -1 });
  check('car accelerates past 200 u/s', Math.abs(w.state.player.speed) > 200);
  const angle0 = w.state.player.angle;
  stepN(w, 1, { ...ZERO, mx: 1, my: -1 });
  check('steering changes the heading', Math.abs(w.state.player.angle - angle0) > 0.1);
}

// 5. Wanted decays after 12 clean seconds out of police sight.
{
  const w = fresh();
  w.state.player.wanted = 2;
  // The crime happened long before the world clock started, so no fresh
  // units roll in and the wanted level can decay. After 11 seconds exactly
  // one decay has fired (the first at t≈0, the next not due until t≈12).
  w.state.player.lastCrime = -100;
  stepN(w, 11, ZERO);
  check('wanted decays from 2 to 1 when clean', w.state.player.wanted === 1);
}

// 6. Police spawn to match the wanted level.
{
  const w = fresh();
  w.state.player.wanted = 3;
  w.state.player.lastCrime = 0;
  stepN(w, 3.2, ZERO);
  check('cruisers spawn at wanted 3', w.state.cars.filter((c) => c.kind === 'police' && !c.roadblock).length >= 1);
  check('a roadblock goes up at wanted 3', w.state.roadblocks.length >= 1);
}

// 7. Shooting: a bullet flies, a pedestrian hit falls and adds heat.
{
  const w = fresh();
  const p = w.state.player;
  const ped = w.state.peds[0];
  ped.x = p.x + 60;
  ped.y = p.y;
  ped.speed = 0;
  const events = w.step(1 / 60, { ...ZERO, shoot: true, aimX: p.x + 200, aimY: p.y });
  check('shooting spawns a bullet', w.state.bullets.length === 1 && w.state.stats.shotsFired === 1);
  stepN(w, 0.2, ZERO);
  check('the bullet fells the pedestrian and adds a star', ped.fallen && w.state.player.wanted >= 1);
  void events;
}

// 8. Busted: a foot officer touching the player on foot ends the run.
{
  const w = fresh();
  const p = w.state.player;
  w.state.cars.push({
    kind: 'officer', x: p.x + 10, y: p.y, angle: 0, speed: 0,
    color: '#2f3a4a', health: 100, disabled: false, shootCooldown: 0,
  });
  const events = w.step(1 / 60, ZERO);
  check('officer touch busts the player', (events & EVENT_BUSTED) !== 0 && w.state.busted);
}

// 9. Wasted: a police bullet that drops health to zero.
{
  const w = fresh();
  const p = w.state.player;
  p.health = 5;
  p.invulnerable = 0;
  w.state.bullets.push({ x: p.x - 10, y: p.y, vx: 700, vy: 0, damage: 8, from: 'police', life: 1 });
  const events = w.step(1 / 60, ZERO);
  check('lethal bullet wastes the player', (events & EVENT_WASTED) !== 0 && w.state.wasted);
}

// 10. Garage: money buys a speed upgrade at Benny's Garage.
{
  const w = fresh();
  const car = w.state.cars.find((c) => c.kind === 'traffic');
  car.x = w.state.player.x + 30;
  car.y = w.state.player.y;
  w.step(1 / 60, { ...ZERO, steal: true });
  w.state.player.money = 1000;
  w.state.player.x = 1000;
  w.state.player.y = 900;
  w.state.player.car.x = 1000;
  w.state.player.car.y = 900;
  w.step(1 / 60, { ...ZERO, garageKey: 1 });
  check('garage sells speed level 1 for $300', w.state.player.speedLevel === 1 && w.state.player.money === 700);
}

// 11. Mission timer expiry restarts the mission.
{
  const w = fresh();
  w.state.missionTimeLeft = 0.01;
  w.step(1 / 60, ZERO);
  check('expired mission restarts with a fresh timer', w.state.stepIndex === 0 && w.state.missionTimeLeft === MISSIONS[0].timeLimit && w.state.missionFailed);
}

// 12. Victory: the finale's last step completes the game.
{
  const w = fresh();
  w.state.missionIndex = 11;
  w.state.stepIndex = 2;
  w.state.missionTimeLeft = 180;
  w.state.player.x = 410;
  w.state.player.y = 1400;
  const events = w.step(1 / 60, ZERO);
  check('finale completes with a victory event', (events & EVENT_VICTORY) !== 0 && w.state.victory);
}

// 13. Save/load round-trips mission, money and upgrades.
{
  const w = fresh();
  w.state.missionIndex = 4;
  w.state.player.money = 640;
  w.state.player.speedLevel = 2;
  w.state.player.armorLevel = 1;
  const data = w.saveData();
  const w2 = fresh(99);
  const ok = w2.loadSave(data);
  check('save/load restores progress', ok && w2.state.missionIndex === 4 && w2.state.player.money === 640 && w2.state.player.speedLevel === 2 && w2.state.player.armorLevel === 1);
}

// 14. Respawn after busted: clean, healthy, at the garage, mission restarted.
{
  const w = fresh();
  w.state.player.wanted = 3;
  w.state.player.health = 40;
  w.state.player.money = 200;
  w.state.busted = true;
  w.respawn();
  check('respawn clears wanted, heals, keeps $150', w.state.player.wanted === 0 && w.state.player.health === 100 && w.state.player.money === 150 && !w.state.busted);
}

// 15. Survive step: holding two stars for 60 seconds advances mission 9.
// The player keeps moving to fresh road points so the converging units never
// lay a hand on them; the test is about the timer, not the chase.
{
  const w = fresh();
  w.state.missionIndex = 8;
  w.state.stepIndex = 0;
  w.state.missionTimeLeft = 150;
  w.state.player.wanted = 2;
  w.state.player.lastCrime = 0;
  const spots = [[400, 400], [2800, 400], [2800, 1900], [400, 1900], [1600, 900], [2200, 400]];
  let spot = 0;
  for (let i = 0; i < Math.floor(62 / (1 / 60)); i += 1) {
    if (i % 60 === 0) {
      const s = spots[spot % spots.length];
      spot += 1;
      w.state.player.x = s[0];
      w.state.player.y = s[1];
    }
    if (w.state.player.wanted < 2) w.state.player.wanted = 2;
    w.state.player.lastCrime = w.state.time;
    w.step(1 / 60, ZERO);
    if (w.state.stepIndex === 1) break;
  }
  check('surviving 60s at 2 stars advances the mission', w.state.stepIndex === 1);
}

console.log(`\nplaytest: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
