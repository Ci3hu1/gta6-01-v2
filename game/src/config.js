// Solmar Bay — every tuning number, colour, place and mission in one place.
// The world is a fixed 3200x2400 coastal city; the camera shows a 1280x800 window of it.

export const VIEW = { width: 1280, height: 800 };
export const WORLD = { width: 3200, height: 2400 };
export const STEP = 1 / 60;

export const ROAD_WIDTH = 120;
export const ROAD_X = [400, 1000, 1600, 2200, 2800];
export const ROAD_Y = [400, 900, 1400, 1900];

export const DISTRICTS = [
  { name: 'Northgate', x: 0, y: 0, w: 1600, h: 700, tint: '#2e3440' },
  { name: 'Old Town', x: 1600, y: 0, w: 1600, h: 700, tint: '#3a2f2a' },
  { name: 'Marina', x: 0, y: 700, w: 800, h: 1700, tint: '#22384a' },
  { name: 'Downtown', x: 800, y: 700, w: 1200, h: 950, tint: '#33302a' },
  { name: 'The Strip', x: 2000, y: 700, w: 1200, h: 950, tint: '#3d2438' },
  { name: 'Harbor', x: 800, y: 1650, w: 2400, h: 750, tint: '#26303a' },
];

export const LOCATIONS = [
  { name: 'Old Market', x: 400, y: 400, color: '#e8a33d' },
  { name: 'Azura Bank', x: 1600, y: 400, color: '#4fc3f7' },
  { name: 'Vela Motors', x: 2800, y: 400, color: '#e5534b' },
  { name: 'Surf Shack', x: 400, y: 900, color: '#3ec6b2' },
  { name: "Benny's Garage", x: 1000, y: 900, color: '#f2c94c' },
  { name: 'Hotel Brisa', x: 2800, y: 900, color: '#c678dd' },
  { name: 'Marina Pier', x: 400, y: 1400, color: '#3ec6b2' },
  { name: 'Casino Royale', x: 2200, y: 1400, color: '#ff5e7a' },
  { name: 'The Cannery', x: 400, y: 1900, color: '#e8a33d' },
  { name: 'Neon Gym', x: 1600, y: 1900, color: '#7ee081' },
];

export function locationByName(name) {
  return LOCATIONS.find((loc) => loc.name === name);
}

export const PLAYER = {
  footSpeed: 175,
  radius: 13,
  health: 100,
  carAccel: 620,
  carBrake: 900,
  carTopSpeed: 520,
  carReverseSpeed: 170,
  carTurn: 2.5,
  punchRange: 34,
  punchDamage: 25,
  bulletDamage: 34,
  bulletSpeed: 920,
  fireInterval: 0.22,
};

export const TRAFFIC_CARS = 14;
export const PEDESTRIANS = 26;

export const WANTED = {
  decaySeconds: 12,
  stealStars: 1,
  hitPedStars: 1,
  shootStars: 1,
  max: 5,
};

export const POLICE = {
  cruiserSpeed: 440,
  cruiserSpeedPerStar: 8,
  footSpeed: 185,
  shootRange: 340,
  shootInterval: 1.4,
  bulletDamage: 8,
  bulletSpeed: 700,
  arrestHoldSeconds: 1.2,
};

export const GARAGE = {
  speedCost: 300,
  armorCost: 350,
  repairCost: 100,
  maxLevel: 3,
};

// Missions: 12 over 3 days. A step is one objective; the mission ends when every
// step is done. kinds: goto (reach a place), steal (be driving a stolen car),
// wait (hold a place), survive (stay alive with at least minWanted stars).
export const MISSIONS = [
  { day: 1, title: 'First Delivery', brief: 'Mara Voss has work. Pick up the parcel at the Old Market and drop it at the Surf Shack.', reward: 120, timeLimit: 90, steps: [{ kind: 'goto', loc: 'Old Market' }, { kind: 'goto', loc: 'Surf Shack' }] },
  { day: 1, title: 'Hot Wheels', brief: 'Vela Motors pays for fresh stock. Steal any car off the street and bring it to Vela Motors.', reward: 150, timeLimit: 75, steps: [{ kind: 'steal' }, { kind: 'goto', loc: 'Vela Motors', requireCar: true }] },
  { day: 1, title: 'Bank Job Lookout', brief: 'Scout Azura Bank, then get back to Benny\u2019s Garage without getting busted.', reward: 200, timeLimit: 120, steps: [{ kind: 'goto', loc: 'Azura Bank' }, { kind: 'goto', loc: "Benny's Garage" }] },
  { day: 1, title: 'Night at the Cannery', brief: 'A crate for the Cannery. Drive it down to the Harbor and don\u2019t ask what\u2019s inside.', reward: 180, timeLimit: 90, steps: [{ kind: 'goto', loc: 'The Cannery' }] },
  { day: 2, title: 'The Fixer Calls', brief: 'Mara wants a word, in person. Meet her at Hotel Brisa on the Strip.', reward: 150, timeLimit: 90, steps: [{ kind: 'goto', loc: 'Hotel Brisa' }] },
  { day: 2, title: 'Grand Theft, Hold the Mayo', brief: 'Benny needs a runner. Steal a car and bring it to Benny\u2019s Garage.', reward: 220, timeLimit: 100, steps: [{ kind: 'steal' }, { kind: 'goto', loc: "Benny's Garage", requireCar: true }] },
  { day: 2, title: 'Neon Nights', brief: 'Two stops after dark: the Neon Gym, then the Casino Royale.', reward: 240, timeLimit: 120, steps: [{ kind: 'goto', loc: 'Neon Gym' }, { kind: 'goto', loc: 'Casino Royale' }] },
  { day: 2, title: 'Harbor Lights', brief: 'Pick up the parcel at Marina Pier and run it back to the Old Market.', reward: 260, timeLimit: 110, steps: [{ kind: 'goto', loc: 'Marina Pier' }, { kind: 'goto', loc: 'Old Market' }] },
  { day: 3, title: 'Heat Rising', brief: 'The whole city is watching. Get to two stars, survive a full minute, then reach Azura Bank.', reward: 300, timeLimit: 150, steps: [{ kind: 'survive', seconds: 60, minWanted: 2 }, { kind: 'goto', loc: 'Azura Bank' }] },
  { day: 3, title: 'The Getaway', brief: 'Wheels up. Take any car to Vela Motors, then vanish to Hotel Brisa.', reward: 320, timeLimit: 120, steps: [{ kind: 'goto', loc: 'Vela Motors', requireCar: true }, { kind: 'goto', loc: 'Hotel Brisa' }] },
  { day: 3, title: 'All In', brief: 'The vault codes go to the Casino Royale. No stops, no cops, no excuses.', reward: 400, timeLimit: 100, steps: [{ kind: 'goto', loc: 'Casino Royale' }] },
  { day: 3, title: 'Casino Royale Vault Run', brief: 'The finale. Crack the vault at the Casino Royale, hold the floor for twenty seconds, then run for Marina Pier.', reward: 1000, timeLimit: 180, steps: [{ kind: 'goto', loc: 'Casino Royale' }, { kind: 'wait', seconds: 20, loc: 'Casino Royale' }, { kind: 'goto', loc: 'Marina Pier' }] },
];

export const PALETTE = {
  backdrop: '#0d1117',
  grass: '#1d2b22',
  road: '#2b2f38',
  roadEdge: '#3a4152',
  lane: '#c9a227',
  sidewalk: '#3d4454',
  building: '#4a5468',
  buildingTop: '#5d6a84',
  water: '#16324a',
  player: '#ffd23e',
  playerCar: '#ffd23e',
  trafficCar: '#7fb3d5',
  policeCar: '#e8e8e8',
  policeLight: '#ff3b30',
  policeLight2: '#2f7bff',
  ped: '#d8c9a3',
  bullet: '#ffe9a8',
  copBullet: '#ff9d5c',
  panel: '#171d29',
  text: '#eef1f5',
  muted: '#9aa5b5',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#7ee081',
  objective: '#ff5e7a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';
