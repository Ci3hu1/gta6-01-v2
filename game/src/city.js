// The city of Solmar Bay: its roads, blocks, buildings, districts and named
// places. The layout is generated once from a fixed seed, so the city is the
// same in every game; only the traffic and the people are random per run.
import { DISTRICTS, LOCATIONS, ROAD_WIDTH, ROAD_X, ROAD_Y, WORLD } from './config.js';
import { createRandom } from './random.js';

const CITY_SEED = 20261117;

export function buildCity() {
  const random = createRandom(CITY_SEED);
  const buildings = [];
  // The blocks are the rectangles between neighbouring roads. Each block holds
  // one to three buildings with a margin for the sidewalk.
  const xs = [0, ...ROAD_X, WORLD.width];
  const ys = [0, ...ROAD_Y, WORLD.height];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + (bx === 0 ? 30 : ROAD_WIDTH / 2 + 24);
      const x1 = xs[bx + 1] - (bx === xs.length - 2 ? 30 : ROAD_WIDTH / 2 + 24);
      const y0 = ys[by] + (by === 0 ? 30 : ROAD_WIDTH / 2 + 24);
      const y1 = ys[by + 1] - (by === ys.length - 2 ? 30 : ROAD_WIDTH / 2 + 24);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 60 || h < 60) continue;
      // The western edge is the marina: leave the water open, no buildings.
      if (x0 < 340 && y0 > 1000) continue;
      const count = w > 260 && h > 200 ? 3 : w > 170 || h > 170 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const bw = Math.min(w - 16, 90 + random() * 130);
        const bh = Math.min(h - 16, 70 + random() * 110);
        const px = x0 + 8 + random() * Math.max(1, w - bw - 16);
        const py = y0 + 8 + random() * Math.max(1, h - bh - 16);
        buildings.push({
          x: px, y: py, w: bw, h: bh,
          shade: 0.85 + random() * 0.3,
          roof: random() < 0.25,
        });
      }
    }
  }
  return { buildings, districts: DISTRICTS, locations: LOCATIONS };
}

export function districtAt(city, x, y) {
  for (const d of city.districts) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return city.districts[0];
}

/** True when the point is on a road (asphalt, not a block). */
export function onRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** The nearest point on a road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  let bestX = ROAD_X[0];
  let bestDx = Infinity;
  for (const rx of ROAD_X) {
    if (Math.abs(x - rx) < bestDx) { bestDx = Math.abs(x - rx); bestX = rx; }
  }
  let bestY = ROAD_Y[0];
  let bestDy = Infinity;
  for (const ry of ROAD_Y) {
    if (Math.abs(y - ry) < bestDy) { bestDy = Math.abs(y - ry); bestY = ry; }
  }
  return bestDx <= bestDy ? { x: bestX, y, axis: 'v' } : { x, y: bestY, axis: 'h' };
}

/** True when the circle at (x, y, r) overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Slide a circle out of buildings along one axis; returns the corrected position. */
export function collideBuildings(city, x, y, r) {
  const b = hitsBuilding(city, x, y, r);
  if (!b) return { x, y, hit: false };
  const dxLeft = x + r - b.x;
  const dxRight = b.x + b.w - (x - r);
  const dyTop = y + r - b.y;
  const dyBottom = b.y + b.h - (y - r);
  const min = Math.min(dxLeft, dxRight, dyTop, dyBottom);
  if (min === dxLeft) return { x: b.x - r, y, hit: true };
  if (min === dxRight) return { x: b.x + b.w + r, y, hit: true };
  if (min === dyTop) return { x, y: b.y - r, hit: true };
  return { x, y: b.y + b.h + r, hit: true };
}
