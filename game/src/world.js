// Solmar Bay — the game's rules and state, with no drawing and no browser in
// it, so the same file runs in Node for tests. The player on foot or in a
// stolen car, traffic, pedestrians, police who respond to the wanted level,
// combat, missions, money and garage upgrades. step() advances one fixed step
// and returns what happened as bit flags.
import {
  GARAGE, LOCATIONS, MISSIONS, PEDESTRIANS, PLAYER, POLICE, ROAD_WIDTH,
  ROAD_X, ROAD_Y, TRAFFIC_CARS, WANTED, WORLD, locationByName,
} from './config.js';
import { buildCity, collideBuildings, hitsBuilding, nearestRoadPoint, onRoad } from './city.js';
import { pick, range } from './random.js';

export const EVENT_MISSION = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WASTED = 4;
export const EVENT_VICTORY = 8;
export const EVENT_SHOT = 16;
export const EVENT_HIT = 32;
export const EVENT_STOLE = 64;
export const EVENT_CRASH = 128;

const CAR_LENGTH = 46;
const CAR_WIDTH = 22;
const TRAFFIC_COLORS = ['#7fb3d5', '#c96f4a', '#8fa98f', '#b5a642', '#9b8ec4', '#d5d5d5'];
const PED_COLORS = ['#d8c9a3', '#e8a33d', '#7ee081', '#c678dd', '#f2f2f2'];

const RADIO_CALM = [
  'SOLMAR FM: smooth traffic on the Strip tonight.',
  'MARA VOSS: keep your head down and your tank full.',
  'SOLMAR PD dispatch: all units, quiet night so far.',
  'BENNY: bring her in one piece and I pay full price.',
];
const RADIO_HOT = [
  'SOLMAR PD dispatch: suspect fleeing, all units respond.',
  'SOLMAR PD dispatch: roadblocks going up on the Strip.',
  'MARA VOSS: lose them. Do not lead them to me.',
  'SOLMAR PD dispatch: air support unavailable, ground units only.',
];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(angle, target, maxTurn) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return angle + Math.max(-maxTurn, Math.min(maxTurn, diff));
}

export function createWorld(random) {
  const city = buildCity();
  const state = {
    city,
    time: 0,
    player: {
      x: 1000, y: 820, angle: -Math.PI / 2, mode: 'foot', speed: 0,
      health: PLAYER.health, money: 0, wanted: 0, lastCrime: -999,
      speedLevel: 0, armorLevel: 0, fireCooldown: 0, invulnerable: 0,
      car: null, arrestHold: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    roadblocks: [],
    missionIndex: 0,
    stepIndex: 0,
    missionTimeLeft: MISSIONS[0].timeLimit,
    missionFailed: false,
    waitTimer: 0,
    surviveTimer: 0,
    stolenFlag: false,
    victory: false,
    busted: false,
    wasted: false,
    radioText: RADIO_CALM[0],
    radioTimer: 0,
    spawnTimer: 0,
    pedTimer: 0,
    stats: { shotsFired: 0, carsStolen: 0, missionsDone: 0, moneyEarned: 0 },
  };

  function spawnTrafficCar() {
    const vertical = random() < 0.5;
    const road = vertical
      ? { x: pick(random, [400, 1000, 1600, 2200, 2800]), y: range(random, 60, WORLD.height - 60), axis: 'v' }
      : { x: range(random, 60, WORLD.width - 60), y: pick(random, [400, 900, 1400, 1900]), axis: 'h' };
    const dir = random() < 0.5 ? 1 : -1;
    return {
      kind: 'traffic', x: road.x, y: road.y,
      angle: road.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: range(random, 90, 150), dir, axis: road.axis,
      color: pick(random, TRAFFIC_COLORS), health: 100, disabled: false, wrecked: false,
    };
  }

  function spawnPed() {
    const p = nearestRoadPoint(range(random, 80, WORLD.width - 80), range(random, 80, WORLD.height - 80));
    const off = (random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + 18);
    const x = p.axis === 'v' ? p.x + off : p.x;
    const y = p.axis === 'v' ? p.y : p.y + off;
    return {
      x, y, angle: random() * Math.PI * 2, speed: range(random, 28, 55),
      axis: p.axis, color: pick(random, PED_COLORS), flee: 0, fallen: false,
    };
  }

  function reset() {
    state.time = 0;
    const p = state.player;
    p.x = 1000; p.y = 820; p.angle = -Math.PI / 2; p.mode = 'foot'; p.speed = 0;
    p.health = PLAYER.health; p.money = 0; p.wanted = 0; p.lastCrime = -999;
    p.speedLevel = 0; p.armorLevel = 0; p.fireCooldown = 0; p.invulnerable = 0;
    p.car = null; p.arrestHold = 0;
    state.cars = [];
    for (let i = 0; i < TRAFFIC_CARS; i += 1) state.cars.push(spawnTrafficCar());
    state.peds = [];
    for (let i = 0; i < PEDESTRIANS; i += 1) state.peds.push(spawnPed());
    state.bullets = [];
    state.roadblocks = [];
    state.missionIndex = 0;
    state.stepIndex = 0;
    state.missionTimeLeft = MISSIONS[0].timeLimit;
    state.missionFailed = false;
    state.waitTimer = 0;
    state.surviveTimer = 0;
    state.stolenFlag = false;
    state.victory = false;
    state.busted = false;
    state.wasted = false;
    state.radioText = RADIO_CALM[0];
    state.radioTimer = 0;
    state.spawnTimer = 0;
    state.pedTimer = 0;
    state.stats = { shotsFired: 0, carsStolen: 0, missionsDone: 0, moneyEarned: 0 };
  }

  function currentMission() {
    return MISSIONS[state.missionIndex] ?? null;
  }

  function currentStep() {
    const m = currentMission();
    return m ? m.steps[state.stepIndex] ?? null : null;
  }

  function objectiveLocation() {
    const step = currentStep();
    if (!step || !step.loc) return null;
    return locationByName(step.loc);
  }

  function addWanted(stars) {
    const p = state.player;
    p.wanted = Math.min(WANTED.max, p.wanted + stars);
    p.lastCrime = state.time;
  }

  function damagePlayer(amount, events) {
    const p = state.player;
    if (p.invulnerable > 0) return events;
    const reduced = amount * (1 - 0.15 * p.armorLevel);
    p.health -= reduced;
    p.invulnerable = 0.5;
    if (p.health <= 0) {
      p.health = 0;
      state.wasted = true;
      return events | EVENT_WASTED;
    }
    return events | EVENT_HIT;
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    let events = 0;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;

    if (p.mode === 'foot') {
      const mx = input.mx || 0;
      const my = input.my || 0;
      const len = Math.hypot(mx, my) || 1;
      const nx = (mx / len) * PLAYER.footSpeed * dt;
      const ny = (my / len) * PLAYER.footSpeed * dt;
      if (mx !== 0 || my !== 0) {
        p.angle = Math.atan2(my, mx);
        const moved = collideBuildings(city, p.x + nx, p.y + ny, PLAYER.radius);
        p.x = Math.max(16, Math.min(WORLD.width - 16, moved.x));
        p.y = Math.max(16, Math.min(WORLD.height - 16, moved.y));
      }
      if (input.steal) {
        let best = null;
        let bestD = 52;
        for (const car of state.cars) {
          if (car.kind !== 'traffic' || car.disabled) continue;
          const d = dist(p.x, p.y, car.x, car.y);
          if (d < bestD) { bestD = d; best = car; }
        }
        if (best) {
          best.kind = 'player';
          best.stolen = true;
          p.car = best;
          p.mode = 'car';
          p.speed = 0;
          state.stolenFlag = true;
          state.stats.carsStolen += 1;
          addWanted(WANTED.stealStars);
          events |= EVENT_STOLE;
        }
      }
      if (input.punch) {
        const px = p.x + Math.cos(p.angle) * PLAYER.punchRange;
        const py = p.y + Math.sin(p.angle) * PLAYER.punchRange;
        for (const ped of state.peds) {
          if (!ped.fallen && dist(px, py, ped.x, ped.y) < 26) {
            ped.fallen = true;
            addWanted(WANTED.hitPedStars);
            events |= EVENT_HIT;
          }
        }
        for (const car of state.cars) {
          if (car.kind === 'police' && dist(px, py, car.x, car.y) < 40) {
            car.health -= PLAYER.punchDamage;
            if (car.health <= 0) car.disabled = true;
          }
        }
      }
      if (input.shoot && p.fireCooldown <= 0) {
        p.fireCooldown = PLAYER.fireInterval;
        const a = angleTo(p.x, p.y, input.aimX ?? p.x + 100, input.aimY ?? p.y);
        state.bullets.push({
          x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
          vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
          damage: PLAYER.bulletDamage, from: 'player', life: 1.1,
        });
        state.stats.shotsFired += 1;
        let copNear = false;
        for (const car of state.cars) {
          if (car.kind === 'police' && dist(p.x, p.y, car.x, car.y) < 500) copNear = true;
        }
        if (copNear) addWanted(WANTED.shootStars);
        events |= EVENT_SHOT;
      }
    } else if (p.car) {
      const car = p.car;
      const top = PLAYER.carTopSpeed * (1 + 0.12 * p.speedLevel);
      if (input.my < 0) car.speed += PLAYER.carAccel * dt;
      else if (input.my > 0) car.speed -= PLAYER.carBrake * dt;
      else car.speed -= car.speed * 0.9 * dt;
      if (input.handbrake) car.speed -= car.speed * 2.4 * dt;
      car.speed = Math.max(-PLAYER.carReverseSpeed, Math.min(top, car.speed));
      const steer = (input.mx || 0) * PLAYER.carTurn * (input.handbrake ? 1.6 : 1);
      car.angle += steer * dt * Math.max(-1, Math.min(1, car.speed / 200)) * (car.speed < 0 ? -1 : 1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const hit = hitsBuilding(city, nx, ny, 20);
      if (hit) {
        if (Math.abs(car.speed) > 260) {
          events = damagePlayer(Math.abs(car.speed) * 0.08, events);
          events |= EVENT_CRASH;
        }
        car.speed *= -0.25;
      } else {
        car.x = Math.max(24, Math.min(WORLD.width - 24, nx));
        car.y = Math.max(24, Math.min(WORLD.height - 24, ny));
      }
      // Shunting a traffic car: shove it aside, slow down, crash hard if fast.
      for (const other of state.cars) {
        if (other.kind !== 'traffic' || other.disabled) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 38 && d > 0.01) {
          const push = (38 - d) / 2;
          const ux = (other.x - car.x) / d;
          const uy = (other.y - car.y) / d;
          other.x += ux * push;
          other.y += uy * push;
          if (Math.abs(car.speed) > 350) {
            events = damagePlayer(Math.abs(car.speed) * 0.03, events);
            events |= EVENT_CRASH;
          }
          car.speed *= 0.7;
        }
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
      if (input.horn) state.radioText = 'HORN! Out of the way!';
      if (input.steal) {
        p.mode = 'foot';
        p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
        p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
        p.car = null;
        p.speed = 0;
      }
      if (input.garageKey) {
        const garage = locationByName("Benny's Garage");
        if (dist(p.x, p.y, garage.x, garage.y) < 130) {
          if (input.garageKey === 1 && p.speedLevel < GARAGE.maxLevel && p.money >= GARAGE.speedCost) {
            p.money -= GARAGE.speedCost; p.speedLevel += 1;
          } else if (input.garageKey === 2 && p.armorLevel < GARAGE.maxLevel && p.money >= GARAGE.armorCost) {
            p.money -= GARAGE.armorCost; p.armorLevel += 1;
          } else if (input.garageKey === 3 && p.money >= GARAGE.repairCost) {
            p.money -= GARAGE.repairCost; p.health = PLAYER.health; car.health = 100;
          }
        }
      }
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.disabled) continue;
      // Slow down for a car right ahead on the same road.
      let ahead = false;
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
        const side = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
        if (forward > 0 && forward < 70 && side < 26) ahead = true;
      }
      const target = ahead ? car.speed * 0.4 : range(random, 90, 150);
      car.speed += (target - car.speed) * Math.min(1, dt * 2);
      let nx = car.x + Math.cos(car.angle) * car.speed * dt;
      let ny = car.y + Math.sin(car.angle) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const nearX = ROAD_X.find((rx) => Math.abs(car.x - rx) < 26);
      const nearY = ROAD_Y.find((ry) => Math.abs(car.y - ry) < 26);
      if (car.axis === 'v' && nearY !== undefined && random() < 0.02) {
        car.axis = 'h';
        car.angle = random() < 0.5 ? 0 : Math.PI;
        car.y = nearY;
      } else if (car.axis === 'h' && nearX !== undefined && random() < 0.02) {
        car.axis = 'v';
        car.angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.x = nearX;
      }
      if (nx < 40 || nx > WORLD.width - 40 || ny < 40 || ny > WORLD.height - 40) {
        car.angle += Math.PI;
        car.speed = 90;
        nx = Math.max(40, Math.min(WORLD.width - 40, car.x));
        ny = Math.max(40, Math.min(WORLD.height - 40, car.y));
      }
      car.x = nx;
      car.y = ny;
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.fallen) continue;
      const dPlayer = dist(ped.x, ped.y, p.x, p.y);
      if (dPlayer < 130 && ((p.mode === 'car' && Math.abs(p.speed) > 120) || state.bullets.length > 0)) {
        ped.flee = 1.5;
      }
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = angleTo(p.x, p.y, ped.x, ped.y);
        ped.x += Math.cos(a) * 120 * dt;
        ped.y += Math.sin(a) * 120 * dt;
      } else {
        if (random() < 0.005) ped.angle += (random() - 0.5) * 2.4;
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.x = Math.max(20, Math.min(WORLD.width - 20, ped.x));
      ped.y = Math.max(20, Math.min(WORLD.height - 20, ped.y));
      if (hitsBuilding(city, ped.x, ped.y, 8)) {
        ped.angle += Math.PI / 2;
        ped.x = Math.max(20, Math.min(WORLD.width - 20, ped.x));
        ped.y = Math.max(20, Math.min(WORLD.height - 20, ped.y));
      }
      // A speeding car that runs a pedestrian down.
      if (p.mode === 'car' && p.car && Math.abs(p.speed) > 140 && dist(ped.x, ped.y, p.x, p.y) < 26) {
        ped.fallen = true;
        addWanted(WANTED.hitPedStars);
      }
    }
    state.pedTimer -= dt;
    if (state.pedTimer <= 0) {
      state.pedTimer = 2;
      const fallen = state.peds.filter((q) => q.fallen).length;
      if (state.peds.length - fallen < PEDESTRIANS) {
        const idx = state.peds.findIndex((q) => q.fallen);
        if (idx >= 0) state.peds[idx] = spawnPed();
      }
    }
  }

  function policeTargets() {
    const p = state.player;
    const cruisers = p.wanted === 0 ? 0 : Math.min(p.wanted, 5);
    const officers = p.wanted >= 2 ? Math.min(p.wanted - 1, 3) : 0;
    return { cruisers, officers };
  }

  function spawnPolice() {
    const p = state.player;
    // New units only roll in while the heat is fresh (a recent crime) or a
    // unit is already close: once the player outruns the pursuit, no fresh
    // cruisers appear, so the wanted level can actually decay.
    const recentCrime = state.time - p.lastCrime < 8;
    let policeNear = false;
    for (const car of state.cars) {
      if ((car.kind === 'police' || car.kind === 'officer') && dist(p.x, p.y, car.x, car.y) < 600) policeNear = true;
    }
    if (!recentCrime && !policeNear) return;
    const want = policeTargets();
    const haveCruisers = state.cars.filter((c) => c.kind === 'police' && !c.roadblock).length;
    const haveOfficers = state.cars.filter((c) => c.kind === 'officer').length;
    if (haveCruisers < want.cruisers) {
      const spot = nearestRoadPoint(
        p.x + range(random, -700, 700), p.y + range(random, -700, 700),
      );
      state.cars.push({
        kind: 'police', x: spot.x, y: spot.y, angle: angleTo(spot.x, spot.y, p.x, p.y),
        speed: 0, color: '#e8e8e8', health: 100, disabled: false, roadblock: false,
      });
    }
    if (haveOfficers < want.officers) {
      state.cars.push({
        kind: 'officer', x: p.x + range(random, -420, 420), y: p.y + range(random, -420, 420),
        angle: 0, speed: 0, color: '#2f3a4a', health: 100, disabled: false, shootCooldown: 0,
      });
    }
    // Roadblocks at wanted 3+: two cruisers parked across the road ahead.
    // A block that is no longer ahead of the player — behind them, or more
    // than 700 away — is torn down so a fresh one can go up ahead: a
    // roadblock only threatens the road ahead, and a fleeing player turns
    // often enough that a block placed a minute ago is already behind them.
    for (let i = state.roadblocks.length - 1; i >= 0; i -= 1) {
      const block = state.roadblocks[i];
      const dx = block.x - p.x;
      const dy = block.y - p.y;
      const ahead = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
      if (ahead < 100 || Math.hypot(dx, dy) > 700) {
        for (const c of block.cars) c.disabled = true;
        state.roadblocks.splice(i, 1);
      }
    }
    state.cars = state.cars.filter((c) => !(c.roadblock && c.disabled));
    if (p.wanted >= 3 && state.roadblocks.length < 2) {
      const ahead = { x: p.x + Math.cos(p.angle) * 340, y: p.y + Math.sin(p.angle) * 340 };
      const spot = nearestRoadPoint(ahead.x, ahead.y);
      const block = {
        x: spot.x, y: spot.y, axis: spot.axis,
        cars: [
          { kind: 'police', x: spot.axis === 'v' ? spot.x - 34 : spot.x, y: spot.axis === 'v' ? spot.y : spot.y - 34, angle: spot.axis === 'v' ? Math.PI / 2 : 0, speed: 0, color: '#e8e8e8', health: 100, disabled: false, roadblock: true },
          { kind: 'police', x: spot.axis === 'v' ? spot.x + 34 : spot.x, y: spot.axis === 'v' ? spot.y : spot.y + 34, angle: spot.axis === 'v' ? Math.PI / 2 : 0, speed: 0, color: '#e8e8e8', health: 100, disabled: false, roadblock: true },
        ],
      };
      state.roadblocks.push(block);
      for (const c of block.cars) state.cars.push(c);
    }
  }

  function stepPolice(dt) {
    const p = state.player;
    let events = 0;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 1.5;
      spawnPolice();
    }
    // Wanted decays when the player stays clean and out of sight.
    if (p.wanted > 0 && state.time - p.lastCrime > WANTED.decaySeconds) {
      let seen = false;
      for (const car of state.cars) {
        if ((car.kind === 'police' || car.kind === 'officer') && dist(p.x, p.y, car.x, car.y) < 450) seen = true;
      }
      if (!seen) {
        p.wanted -= 1;
        p.lastCrime = state.time;
      }
    }
    for (const car of state.cars) {
      if (car.disabled) continue;
      // A unit that has been more than 1000 units away for 3 seconds loses
      // the trail and leaves: without this the wanted level could never decay.
      if ((car.kind === 'police' && !car.roadblock) || car.kind === 'officer') {
        car.lostTimer = dist(p.x, p.y, car.x, car.y) > 1000 ? (car.lostTimer || 0) + dt : 0;
      }
      if (car.kind === 'police' && !car.roadblock) {
        const target = angleTo(car.x, car.y, p.x, p.y);
        car.angle = turnToward(car.angle, target, 2.2 * dt);
        const top = POLICE.cruiserSpeed + POLICE.cruiserSpeedPerStar * p.wanted;
        car.speed = Math.min(top, car.speed + 420 * dt);
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        if (!hitsBuilding(city, nx, ny, 20)) {
          car.x = nx;
          car.y = ny;
        } else {
          car.speed *= 0.5;
        }
        const d = dist(car.x, car.y, p.x, p.y);
        if (p.mode === 'foot' && d < 30) {
          p.arrestHold += dt;
          if (p.arrestHold > 0.4) {
            state.busted = true;
            return events | EVENT_BUSTED;
          }
        } else if (p.mode === 'car' && p.car && d < 34 && Math.abs(p.speed) < 25) {
          p.arrestHold += dt;
          if (p.arrestHold > POLICE.arrestHoldSeconds) {
            state.busted = true;
            return events | EVENT_BUSTED;
          }
        } else {
          p.arrestHold = 0;
        }
        // Ramming a player car at speed hurts — but only once per cruiser
        // per 0.8s, or a cruiser sitting on the player's bumper would drain
        // the whole health bar in a single second of contact.
        car.ramCooldown = (car.ramCooldown ?? 0) - dt;
        if (p.mode === 'car' && p.car && d < 40 && car.speed > 300 && car.ramCooldown <= 0) {
          car.ramCooldown = 1.5;
          events = damagePlayer(car.speed * 0.012, events);
          car.speed *= 0.6;
        }
      } else if (car.kind === 'officer') {
        const d = dist(car.x, car.y, p.x, p.y);
        car.angle = turnToward(car.angle, angleTo(car.x, car.y, p.x, p.y), 3 * dt);
        if (d > 26) {
          car.x += Math.cos(car.angle) * POLICE.footSpeed * dt;
          car.y += Math.sin(car.angle) * POLICE.footSpeed * dt;
        }
        if (d < 26 && p.mode === 'foot') {
          state.busted = true;
          return events | EVENT_BUSTED;
        }
        car.shootCooldown = (car.shootCooldown ?? 0) - dt;
        if (p.wanted >= 3 && d < POLICE.shootRange && d > 60 && car.shootCooldown <= 0) {
          car.shootCooldown = POLICE.shootInterval;
          const a = angleTo(car.x, car.y, p.x, p.y) + (random() - 0.5) * 0.24;
          state.bullets.push({
            x: car.x + Math.cos(a) * 18, y: car.y + Math.sin(a) * 18,
            vx: Math.cos(a) * POLICE.bulletSpeed, vy: Math.sin(a) * POLICE.bulletSpeed,
            damage: POLICE.bulletDamage, from: 'police', life: 1.2,
          });
        }
      }
    }
    // Drop units that lost the trail, and clear roadblocks once the heat is
    // below three stars.
    state.cars = state.cars.filter((car) => {
      if (((car.kind === 'police' && !car.roadblock) || car.kind === 'officer') && (car.lostTimer || 0) > 3) return false;
      if (car.roadblock && p.wanted < 3) return false;
      return true;
    });
    if (p.wanted < 3) state.roadblocks = [];
    return events;
  }

  function stepBullets(dt) {
    const p = state.player;
    let events = 0;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || hitsBuilding(city, b.x, b.y, 2)) {
        b.life = 0;
        continue;
      }
      if (b.from === 'player') {
        for (const ped of state.peds) {
          if (!ped.fallen && dist(b.x, b.y, ped.x, ped.y) < 14) {
            ped.fallen = true;
            b.life = 0;
            addWanted(WANTED.hitPedStars);
            events |= EVENT_HIT;
          }
        }
        for (const car of state.cars) {
          if ((car.kind === 'police' || car.kind === 'officer') && dist(b.x, b.y, car.x, car.y) < 24) {
            car.health -= b.damage;
            b.life = 0;
            if (car.health <= 0) car.disabled = true;
            events |= EVENT_HIT;
          }
        }
      } else if (dist(b.x, b.y, p.x, p.y) < (p.mode === 'car' ? 24 : 14)) {
        b.life = 0;
        events = damagePlayer(b.damage, events);
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function stepMission(dt) {
    const m = currentMission();
    if (!m || state.victory) return 0;
    state.missionTimeLeft -= dt;
    if (state.missionTimeLeft <= 0) {
      state.missionTimeLeft = 0;
      return finishMission(false);
    }
    const step = currentStep();
    if (!step) return finishMission(true);
    const p = state.player;
    if (step.kind === 'goto') {
      const loc = locationByName(step.loc);
      if (loc && dist(p.x, p.y, loc.x, loc.y) < 80 && (!step.requireCar || p.mode === 'car')) {
        state.stepIndex += 1;
        if (!currentStep()) return finishMission(true);
      }
    } else if (step.kind === 'steal') {
      if (state.stolenFlag) {
        state.stepIndex += 1;
        if (!currentStep()) return finishMission(true);
      }
    } else if (step.kind === 'wait') {
      const loc = locationByName(step.loc);
      if (p.wanted < 2) addWanted(2 - p.wanted);
      if (loc && dist(p.x, p.y, loc.x, loc.y) < 95) {
        state.waitTimer += dt;
        if (state.waitTimer >= step.seconds) {
          state.waitTimer = 0;
          state.stepIndex += 1;
          if (!currentStep()) return finishMission(true);
        }
      } else {
        state.waitTimer = Math.max(0, state.waitTimer - dt);
      }
    } else if (step.kind === 'survive') {
      if (p.wanted >= step.minWanted) {
        state.surviveTimer += dt;
        if (state.surviveTimer >= step.seconds) {
          state.surviveTimer = 0;
          state.stepIndex += 1;
          if (!currentStep()) return finishMission(true);
        }
      } else {
        state.surviveTimer = Math.max(0, state.surviveTimer - dt * 2);
      }
    }
    return 0;
  }

  function finishMission(success) {
    const m = currentMission();
    if (!m) return 0;
    if (success) {
      state.player.money += m.reward;
      state.stats.moneyEarned += m.reward;
      state.stats.missionsDone += 1;
      state.missionIndex += 1;
      state.stepIndex = 0;
      state.waitTimer = 0;
      state.surviveTimer = 0;
      state.stolenFlag = false;
      if (state.missionIndex >= MISSIONS.length) {
        state.victory = true;
        return EVENT_MISSION | EVENT_VICTORY;
      }
      state.missionTimeLeft = MISSIONS[state.missionIndex].timeLimit;
      return EVENT_MISSION;
    }
    // Failed: restart the same mission with a fresh timer.
    state.stepIndex = 0;
    state.waitTimer = 0;
    state.surviveTimer = 0;
    state.stolenFlag = false;
    state.missionTimeLeft = m.timeLimit;
    state.missionFailed = true;
    return 0;
  }

  function stepRadio(dt) {
    state.radioTimer -= dt;
    if (state.radioTimer <= 0) {
      state.radioTimer = 6;
      const p = state.player;
      state.radioText = p.wanted > 0
        ? pick(random, RADIO_HOT)
        : pick(random, RADIO_CALM);
    }
  }

  function step(dt, input) {
    if (state.victory || state.busted || state.wasted) return 0;
    state.time += dt;
    let events = 0;
    events |= stepPlayer(dt, input);
    if (state.wasted) return events;
    stepTraffic(dt);
    stepPeds(dt);
    events |= stepPolice(dt);
    if (state.busted) return events;
    events |= stepBullets(dt);
    if (state.wasted) return events;
    events |= stepMission(dt);
    stepRadio(dt);
    return events;
  }

  function respawn() {
    const p = state.player;
    p.money = Math.max(0, p.money - 50);
    p.health = PLAYER.health;
    p.wanted = 0;
    p.lastCrime = state.time;
    p.arrestHold = 0;
    p.invulnerable = 2;
    const garage = locationByName("Benny's Garage");
    p.x = garage.x;
    p.y = garage.y + 70;
    p.angle = -Math.PI / 2;
    p.mode = 'foot';
    p.car = null;
    p.speed = 0;
    for (const car of state.cars) {
      if (car.kind === 'police' || car.kind === 'officer') car.disabled = true;
    }
    state.roadblocks = [];
    state.busted = false;
    state.wasted = false;
    state.stepIndex = 0;
    state.waitTimer = 0;
    state.surviveTimer = 0;
    state.stolenFlag = false;
    const m = currentMission();
    if (m) state.missionTimeLeft = m.timeLimit;
  }

  function saveData() {
    return {
      missionIndex: state.missionIndex,
      money: state.player.money,
      speedLevel: state.player.speedLevel,
      armorLevel: state.player.armorLevel,
    };
  }

  function loadSave(data) {
    if (!data || typeof data !== 'object') return false;
    state.missionIndex = Math.max(0, Math.min(MISSIONS.length - 1, data.missionIndex | 0));
    state.player.money = Math.max(0, data.money | 0);
    state.player.speedLevel = Math.max(0, Math.min(GARAGE.maxLevel, data.speedLevel | 0));
    state.player.armorLevel = Math.max(0, Math.min(GARAGE.maxLevel, data.armorLevel | 0));
    state.stepIndex = 0;
    state.waitTimer = 0;
    state.surviveTimer = 0;
    const m = currentMission();
    if (m) state.missionTimeLeft = m.timeLimit;
    return true;
  }

  reset();
  return {
    state, reset, step, respawn, saveData, loadSave,
    currentMission, currentStep, objectiveLocation,
  };
}
