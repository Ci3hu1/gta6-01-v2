// The screenshot scenes behind ?shot=start|drive|chase|victory. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a road-following autopilot, so the frame is what real play looks
// like and the same seed always gives the same frame.
import { ROAD_X, ROAD_Y, STEP, locationByName } from './config.js';
import { nearestRoadPoint } from './city.js';
import { EVENT_BUSTED, EVENT_VICTORY, EVENT_WASTED } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 10;
const CHASE_SECONDS = 18;

/** The intersection (a ROAD_X by ROAD_Y crossing) nearest a point. */
function nearestIntersection(x, y) {
  const rx = ROAD_X.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), ROAD_X[0]);
  const ry = ROAD_Y.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), ROAD_Y[0]);
  return { x: rx, y: ry };
}

/**
 * The next intersection ahead along the road the car is traveling on, or the
 * nearest intersection when on foot or off the road (more than 60 units from
 * a road line). Never a point behind the car.
 */
function nextIntersectionAhead(x, y, angle) {
  if (angle === null || angle === undefined) return nearestIntersection(x, y);
  const cx = Math.cos(angle);
  const sy = Math.sin(angle);
  if (Math.abs(cx) >= Math.abs(sy)) {
    const ry = ROAD_Y.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), ROAD_Y[0]);
    if (Math.abs(y - ry) > 60) return nearestIntersection(x, y);
    const xs = ROAD_X.filter((v) => (cx > 0 ? v > x : v < x));
    if (xs.length === 0) return nearestIntersection(x, y);
    return { x: cx > 0 ? Math.min(...xs) : Math.max(...xs), y: ry };
  }
  const rx = ROAD_X.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), ROAD_X[0]);
  if (Math.abs(x - rx) > 60) return nearestIntersection(x, y);
  const ys = ROAD_Y.filter((v) => (sy > 0 ? v > y : v < y));
  if (ys.length === 0) return nearestIntersection(x, y);
  return { x: rx, y: sy > 0 ? Math.min(...ys) : Math.max(...ys) };
}

/** Waypoints along the roads from (x, y) to (tx, ty), one road line at a
 * time, starting at the next intersection ahead. A car cannot U-turn on a
 * 120-wide road — a 180-degree turn needs 160 units of lateral room — so
 * the route never reverses the car's current direction: when the target lies
 * behind, the route first runs to the next intersection ahead and loops
 * around the block instead. Every waypoint is an intersection, so the path
 * never cuts through a block. */
function makeRoute(x, y, angle, tx, ty) {
  const target = nearestIntersection(tx, ty);
  const points = [nextIntersectionAhead(x, y, angle)];
  let cx = points[0].x;
  let cy = points[0].y;
  // The car's current direction, quantized to the grid, or null on foot.
  let dir = null;
  if (angle !== null && angle !== undefined) {
    dir = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle))
      ? { dx: Math.sign(Math.cos(angle)) || 1, dy: 0 }
      : { dx: 0, dy: Math.sign(Math.sin(angle)) || 1 };
  }
  let guard = 0;
  while ((cx !== target.x || cy !== target.y) && guard < 40) {
    guard += 1;
    const wantX = target.x - cx;
    const wantY = target.y - cy;
    let step = null;
    if (wantX !== 0 && (wantY === 0 || Math.abs(wantX) >= Math.abs(wantY))) {
      step = { dx: Math.sign(wantX), dy: 0 };
    } else if (wantY !== 0) {
      step = { dx: 0, dy: Math.sign(wantY) };
    }
    if (!step) break;
    // Never reverse the direction of travel: turn 90 degrees toward the
    // target on the other axis instead, or turn left if that axis is done.
    if (dir && step.dx === -dir.dx && step.dy === -dir.dy) {
      if (wantY !== 0) step = { dx: 0, dy: Math.sign(wantY) };
      else step = { dx: -dir.dy, dy: dir.dx };
    }
    // Step one road line in that direction; if there is no road that way
    // (map edge), try the other 90-degree turn, then give up and go direct.
    const stepped = stepOneLine(step);
    if (!stepped) {
      const alt = { dx: -step.dy, dy: step.dx };
      if (!stepOneLine(alt)) break;
      step = alt;
    }
    points.push({ x: cx, y: cy });
    dir = step;
  }
  function stepOneLine(step) {
    if (step.dx !== 0) {
      const xs = ROAD_X.filter((v) => (step.dx > 0 ? v > cx : v < cx));
      if (xs.length === 0) return false;
      cx = step.dx > 0 ? Math.min(...xs) : Math.max(...xs);
      return true;
    }
    const ys = ROAD_Y.filter((v) => (step.dy > 0 ? v > cy : v < cy));
    if (ys.length === 0) return false;
    cy = step.dy > 0 ? Math.min(...ys) : Math.max(...ys);
    return true;
  }
  points.push({ x: tx, y: ty });
  return points;
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Steer the player toward the current objective along the roads. */
function autopilot(world, route) {
  const state = world.state;
  const p = state.player;
  const mission = world.currentMission();
  const step = mission ? mission.steps[state.stepIndex] : null;
  const objective = world.objectiveLocation();
  // A survive step has no fixed objective: run. The flee target is the road
  // intersection farthest from the nearest police car, recomputed whenever
  // the player gets close or every few seconds, so the chase keeps moving.
  if (!objective || (step && step.kind === 'survive')) {
    if (p.mode === 'car') return fleeDrive(world, route);
    let cop = null;
    let bestD = Infinity;
    for (const c of state.cars) {
      if (c.kind !== 'police' && c.kind !== 'officer') continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) { bestD = d; cop = c; }
    }
    if (cop) {
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      return { mx: Math.cos(a), my: Math.sin(a), shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 };
    }
    return { mx: 0, my: 0, shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 };
  }
  if (p.mode === 'foot') {
    // On foot, head for the nearest car to steal when the objective is far.
    let car = null;
    let bestD = 400;
    for (const c of state.cars) {
      if (c.kind !== 'traffic' || c.disabled) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) { bestD = d; car = c; }
    }
    if (car && Math.hypot(objective.x - p.x, objective.y - p.y) > 350) {
      if (bestD < 46) return { mx: 0, my: 0, shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: true, handbrake: false, horn: false, garageKey: 0 };
      const a = Math.atan2(car.y - p.y, car.x - p.x);
      return { mx: Math.cos(a), my: Math.sin(a), shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 };
    }
  }
  if (!route.points || route.target !== objective.name) {
    route.points = makeRoute(p.x, p.y, p.mode === 'car' ? p.angle : null, objective.x, objective.y);
    route.target = objective.name;
    route.index = 0;
  }
  while (route.index < route.points.length) {
    const wp = route.points[route.index];
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 80) route.index += 1;
    else break;
  }
  const target = route.index < route.points.length ? route.points[route.index] : objective;
  if (p.mode === 'car') return driveToward(world, route, target);
  const desired = Math.atan2(target.y - p.y, target.x - p.x);
  return { mx: Math.cos(desired), my: Math.sin(desired), shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 };
}

/**
 * Drive the player's car toward a point. Brakes for corners so the turn
 * radius stays near 80 units (the roads are 120 wide): at full speed the
 * radius is over 200 and the car cuts through the block past the corner.
 * If the car has barely moved for 1.5 seconds while trying to drive, it is
 * wedged on a building corner: reverse out for a second.
 */
function driveToward(world, route, target) {
  const state = world.state;
  const p = state.player;
  const now = state.time;
  if (route.reversingUntil && now < route.reversingUntil) {
    return { mx: -(route.reverseSteer || 0), my: 1, shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 };
  }
  if (route.lastCheck === undefined) {
    route.lastCheck = now;
    route.lastX = p.x;
    route.lastY = p.y;
  } else if (now - route.lastCheck >= 1.5) {
    const moved = Math.hypot(p.x - route.lastX, p.y - route.lastY);
    if (moved < 15 && Math.abs(p.speed || 0) < 60) {
      route.reversingUntil = now + 1;
      route.reverseSteer = p.angle > 0 ? 1 : -1;
    }
    route.lastCheck = now;
    route.lastX = p.x;
    route.lastY = p.y;
  }
  const desired = Math.atan2(target.y - p.y, target.x - p.x);
  const diff = angleDiff(p.angle, desired);
  const d = Math.hypot(target.x - p.x, target.y - p.y);
  // Throttle: brake only from high speed into a turn; below ~170, keep
  // accelerating even while turning — coasting at low speed kills steering
  // authority (it scales with speed) and the car strands itself mid-turn,
  // creeping to a stop while the heading error never closes.
  let my = -1;
  const speed = Math.abs(p.speed || 0);
  if (speed > 220 && (Math.abs(diff) > 0.55 || (d < 350 && speed > 200))) my = 1;
  else if (speed > 170 && (Math.abs(diff) > 0.55 || d < 220)) my = 0;
  // Overtake: a traffic car dead ahead gets passed on the far side instead
  // of rear-ended at full speed. The offset is 35 — the road is 120 wide,
  // so the car stays on it — and the aim point is 200 ahead, so the swerve
  // is gentle; a 55 offset at 120 ahead ran the car off the road entirely.
  // Only on a straight (|diff| small) and when the waypoint is farther than
  // the blocker: near a turn the waypoint wins, or the car swerves past the
  // intersection it must turn at while chasing a car it cannot pass.
  let aimX = target.x;
  let aimY = target.y;
  if (Math.abs(diff) < 0.4) {
    for (const other of state.cars) {
      if (other.kind !== 'traffic' || other.disabled) continue;
      const dx = other.x - p.x;
      const dy = other.y - p.y;
      const ahead = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
      const lat = -dx * Math.sin(p.angle) + dy * Math.cos(p.angle);
      if (ahead > 0 && ahead < 260 && ahead < d && Math.abs(lat) < 30) {
        const side = lat >= 0 ? -35 : 35;
        aimX = p.x + Math.cos(p.angle) * 200 - Math.sin(p.angle) * side;
        aimY = p.y + Math.sin(p.angle) * 200 + Math.cos(p.angle) * side;
        break;
      }
    }
  }
  const aimDiff = angleDiff(p.angle, Math.atan2(aimY - p.y, aimX - p.x));
  // A tight deadband here: with the old 0.18 the car never corrected a
  // small drift off the road centerline and drove straight into a building.
  const aimMx = aimDiff > 0.08 ? 1 : aimDiff < -0.08 ? -1 : 0;
  return { mx: aimMx, my, shoot: false, aimX: p.x, aimY: p.y, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 };
}

/** Flee: drive for the intersection farthest from the nearest police car. */
function fleeDrive(world, route) {
  const state = world.state;
  const p = state.player;
  const now = state.time;
  let cop = null;
  let bestD = Infinity;
  for (const c of state.cars) {
    if (c.kind !== 'police' && c.kind !== 'officer') continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { bestD = d; cop = c; }
  }
  if (!route.fleeTarget || now - (route.fleeAt || 0) > 3
    || Math.hypot(route.fleeTarget.x - p.x, route.fleeTarget.y - p.y) < 150) {
    let best = null;
    let bestScore = -Infinity;
    for (const rx of ROAD_X) {
      for (const ry of ROAD_Y) {
        const fromCop = cop ? Math.hypot(rx - cop.x, ry - cop.y) : 0;
        const fromMe = Math.hypot(rx - p.x, ry - p.y);
        const score = fromCop + fromMe * 0.5;
        if (score > bestScore) { bestScore = score; best = { x: rx, y: ry }; }
      }
    }
    route.fleeTarget = best;
    route.fleeAt = now;
    route.points = null;
  }
  if (!route.points || route.target !== 'flee') {
    route.points = makeRoute(p.x, p.y, p.angle, route.fleeTarget.x, route.fleeTarget.y);
    route.target = 'flee';
    route.index = 0;
  }
  while (route.index < route.points.length) {
    const wp = route.points[route.index];
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 80) route.index += 1;
    else break;
  }
  const target = route.index < route.points.length ? route.points[route.index] : route.fleeTarget;
  return driveToward(world, route, target);
}

function stepFor(world, seconds, route) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, autopilot(world, route));
    if (events & (EVENT_BUSTED | EVENT_WASTED | EVENT_VICTORY)) break;
  }
}

/** Put the player behind the wheel of the nearest traffic car. */
function putPlayerInCar(world) {
  let car = null;
  let bestD = Infinity;
  for (const c of world.state.cars) {
    if (c.kind !== 'traffic') continue;
    const d = Math.hypot(c.x - world.state.player.x, c.y - world.state.player.y);
    if (d < bestD) { bestD = d; car = c; }
  }
  if (!car) return;
  car.kind = 'player';
  car.stolen = true;
  const p = world.state.player;
  p.car = car;
  p.mode = 'car';
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  world.state.stolenFlag = true;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best run to show.
 */
export function stageShot(name, world) {
  const route = { points: null, target: null, index: 0 };
  world.reset();
  if (name === 'drive') {
    world.state.missionIndex = 1;
    world.state.stepIndex = 0;
    world.state.missionTimeLeft = 75;
    // Start already behind the wheel of a freshly stolen car with one star
    // on the board, so the frame shows driving, a mission and heat; ten
    // seconds is short enough that the star has not decayed yet.
    putPlayerInCar(world);
    world.state.player.wanted = 1;
    world.state.player.lastCrime = world.state.time;
    stepFor(world, DRIVE_SECONDS, route);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    world.state.missionIndex = 8;
    world.state.stepIndex = 0;
    world.state.missionTimeLeft = 150;
    // Put the player in a car with heat already on.
    putPlayerInCar(world);
    world.state.player.wanted = 4;
    world.state.player.lastCrime = world.state.time;
    stepFor(world, CHASE_SECONDS, route);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'victory') {
    // Play the finale's last step for real: stand at the Casino Royale, then
    // run the last objective, so the victory screen comes from the mission
    // engine itself rather than a forced flag.
    world.state.missionIndex = 11;
    world.state.stepIndex = 2;
    world.state.missionTimeLeft = 180;
    const pier = locationByName('Marina Pier');
    world.state.player.x = pier.x + 40;
    world.state.player.y = pier.y;
    for (let i = 0; i < Math.floor(4 / STEP); i += 1) {
      const events = world.step(STEP, { mx: -1, my: 0, shoot: false, aimX: 0, aimY: 0, punch: false, steal: false, handbrake: false, horn: false, garageKey: 0 });
      if (events & EVENT_VICTORY) break;
    }
    return { screen: SCREEN_VICTORY, best: 12 };
  }
  // start: a living city behind the title.
  stepFor(world, START_SECONDS, route);
  return { screen: SCREEN_TITLE, best: 0 };
}

// Exported for the per-second trace in tests (and for any future test that
// wants to steer the simulation the way the screenshots do).
export { autopilot };
