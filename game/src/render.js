// Drawing only: the world's state and the current screen in, pixels out. A
// 1280x800 camera window follows the player through the 3200x2400 city; the
// HUD, minimap, mission banner and radio ticker are drawn in screen space.
import { FONT, MISSIONS, PALETTE, ROAD_WIDTH, ROAD_X, ROAD_Y, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_VICTORY = 'victory';

const MINIMAP = { x: 1068, y: 56, w: 200, h: 150 };
const TOPBAR = 46;

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`.trim());
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function label(value, x, y, size, color) {
    context.font = `700 ${size}px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#0d1117';
    context.fillText(value, x + 1, y + 1);
    context.fillStyle = color;
    context.fillText(value, x, y);
  }

  function updateCamera(state) {
    const p = state.player;
    const tx = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2));
    const ty = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2));
    cam.x += (tx - cam.x) * 0.12;
    cam.y += (ty - cam.y) * 0.12;
    if (Math.abs(tx - cam.x) < 0.5) cam.x = tx;
    if (Math.abs(ty - cam.y) < 0.5) cam.y = ty;
  }

  function snapCamera(state) {
    const p = state.player;
    cam.x = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2));
    cam.y = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2));
  }

  function drawCity(state) {
    const city = state.city;
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // The marina water on the west edge.
    context.fillStyle = PALETTE.water;
    context.fillRect(0, 1000, 340, WORLD.height - 1000);
    context.fillStyle = '#3d4454';
    context.fillRect(320, 1000, 20, WORLD.height - 1000);
    for (const d of city.districts) {
      context.globalAlpha = 0.28;
      context.fillStyle = d.tint;
      context.fillRect(d.x, d.y, d.w, d.h);
      context.globalAlpha = 1;
    }
    // Roads.
    for (const rx of ROAD_X) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(rx - ROAD_WIDTH / 2 - 10, 0, ROAD_WIDTH + 20, WORLD.height);
      context.fillStyle = PALETTE.road;
      context.fillRect(rx - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD.height);
    }
    for (const ry of ROAD_Y) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, ry - ROAD_WIDTH / 2 - 10, WORLD.width, ROAD_WIDTH + 20);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, ry - ROAD_WIDTH / 2, WORLD.width, ROAD_WIDTH);
    }
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const rx of ROAD_X) {
      for (let y = 40; y < WORLD.height; y += 90) context.fillRect(rx - 2, y, 4, 44);
    }
    for (const ry of ROAD_Y) {
      for (let x = 40; x < WORLD.width; x += 90) context.fillRect(x, ry - 2, 44, 4);
    }
    // Buildings.
    for (const b of city.buildings) {
      context.fillStyle = shade(PALETTE.building, b.shade);
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = shade(PALETTE.buildingTop, b.shade);
      context.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      if (b.roof) {
        context.fillStyle = shade('#7a8698', b.shade);
        context.fillRect(b.x + b.w / 2 - 12, b.y + b.h / 2 - 12, 24, 24);
      }
    }
    // Named places.
    for (const loc of city.locations) {
      context.fillStyle = loc.color;
      context.beginPath();
      context.arc(loc.x, loc.y, 10, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#0d1117';
      context.lineWidth = 2;
      context.stroke();
      label(loc.name, loc.x, loc.y - 16, 15, '#ffffff');
    }
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = car.kind === 'police' ? '#e8e8e8' : car.color;
    context.fillRect(-23, -11, 46, 22);
    context.fillStyle = '#1a2230';
    context.fillRect(-6, -9, 16, 18);
    if (car.kind === 'police') {
      context.fillStyle = '#222a38';
      context.fillRect(-23, -11, 10, 22);
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLight : PALETTE.policeLight2;
      context.fillRect(-4, -11, 8, 6);
      context.fillStyle = flash ? PALETTE.policeLight2 : PALETTE.policeLight;
      context.fillRect(-4, 5, 8, 6);
    }
    if (isPlayer) {
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 3;
      context.strokeRect(-25, -13, 50, 26);
    }
    if (car.disabled) {
      context.strokeStyle = '#3a3a3a';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-14, -8);
      context.lineTo(14, 8);
      context.moveTo(14, -8);
      context.lineTo(-14, 8);
      context.stroke();
    }
    context.restore();
  }

  function drawEntities(state) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.fallen) {
        context.strokeStyle = '#8b93a3';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(ped.x - 8, ped.y - 8);
        context.lineTo(ped.x + 8, ped.y + 8);
        context.moveTo(ped.x + 8, ped.y - 8);
        context.lineTo(ped.x - 8, ped.y + 8);
        context.stroke();
        continue;
      }
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(ped.x, ped.y, 7, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#0d1117';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(ped.x, ped.y);
      context.lineTo(ped.x + Math.cos(ped.angle) * 10, ped.y + Math.sin(ped.angle) * 10);
      context.stroke();
    }
    for (const car of state.cars) {
      if (car.kind === 'officer') {
        context.fillStyle = '#2f3a4a';
        context.beginPath();
        context.arc(car.x, car.y, 9, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#7fb3d5';
        context.lineWidth = 2;
        context.stroke();
        continue;
      }
      drawCarShape(car, car === p.car);
    }
    for (const b of state.bullets) {
      context.strokeStyle = b.from === 'player' ? PALETTE.bullet : PALETTE.copBullet;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    if (p.mode === 'foot') {
      if (p.invulnerable === 0 || Math.floor(p.invulnerable * 10) % 2 === 1) {
        context.fillStyle = PALETTE.player;
        context.beginPath();
        context.arc(p.x, p.y, 13, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#0d1117';
        context.lineWidth = 2;
        context.stroke();
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
        context.stroke();
      }
      context.strokeStyle = PALETTE.player;
      context.globalAlpha = 0.5;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(p.x, p.y, 19, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawObjective(state, objective) {
    if (!objective) return;
    const pulse = 14 + Math.sin(state.time * 4) * 4;
    context.strokeStyle = PALETTE.objective;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(objective.x, objective.y, pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.objective;
    context.beginPath();
    context.arc(objective.x, objective.y, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawHud(state, objective) {
    const p = state.player;
    context.fillStyle = 'rgba(13,17,23,0.88)';
    context.fillRect(0, 0, VIEW.width, TOPBAR);
    text(`$${p.money}`, 16, 31, 24, PALETTE.gold, 'left', '700');
    // Health bar.
    context.fillStyle = '#3a1512';
    context.fillRect(150, 14, 150, 18);
    context.fillStyle = p.health > 30 ? PALETTE.green : PALETTE.red;
    context.fillRect(150, 14, 150 * Math.max(0, p.health / 100), 18);
    text('HP', 306, 31, 16, PALETTE.text, 'left', '700');
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      text('\u2605', 340 + i * 26, 31, 24, i < p.wanted ? PALETTE.red : '#3a4152', 'left');
    }
    // Mission banner.
    const done = state.missionIndex >= MISSIONS.length;
    const m = done ? null : MISSIONS[state.missionIndex];
    const mins = Math.max(0, Math.ceil(state.missionTimeLeft));
    const timer = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
    if (done) {
      text('ALL MISSIONS COMPLETE', VIEW.width / 2, 20, 15, PALETTE.gold, 'center', '700');
      text('Solmar Bay is yours.', VIEW.width / 2, 40, 17, PALETTE.text, 'center', '700');
    } else {
      text(`DAY ${m.day}  ·  MISSION ${state.missionIndex + 1}/12`, VIEW.width / 2, 20, 15, PALETTE.muted, 'center', '700');
      const distText = objective ? `  ·  ${objective.name} ${Math.round(Math.hypot(objective.x - p.x, objective.y - p.y))}m` : '';
      text(`${m.title}  —  ${timer}${distText}`, VIEW.width / 2, 40, 17, PALETTE.text, 'center', '700');
    }
    // Minimap.
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(13,17,23,0.88)';
    context.fillRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.fillStyle = '#1d2b22';
    context.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.strokeStyle = '#3a4152';
    context.lineWidth = 1;
    for (const rx of ROAD_X) {
      context.beginPath();
      context.moveTo(MINIMAP.x + rx * sx, MINIMAP.y);
      context.lineTo(MINIMAP.x + rx * sx, MINIMAP.y + MINIMAP.h);
      context.stroke();
    }
    for (const ry of ROAD_Y) {
      context.beginPath();
      context.moveTo(MINIMAP.x, MINIMAP.y + ry * sy);
      context.lineTo(MINIMAP.x + MINIMAP.w, MINIMAP.y + ry * sy);
      context.stroke();
    }
    for (const loc of state.city.locations) {
      context.fillStyle = loc.color;
      context.fillRect(MINIMAP.x + loc.x * sx - 1, MINIMAP.y + loc.y * sy - 1, 3, 3);
    }
    if (objective) {
      context.fillStyle = PALETTE.objective;
      context.beginPath();
      context.arc(MINIMAP.x + objective.x * sx, MINIMAP.y + objective.y * sy, 4, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.kind === 'police' || car.kind === 'officer') {
        context.fillStyle = PALETTE.red;
        context.fillRect(MINIMAP.x + car.x * sx - 1, MINIMAP.y + car.y * sy - 1, 3, 3);
      }
    }
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(MINIMAP.x + p.x * sx, MINIMAP.y + p.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.text;
    context.strokeRect(MINIMAP.x + cam.x * sx, MINIMAP.y + cam.y * sy, VIEW.width * sx, VIEW.height * sy);
    // Radio ticker.
    context.fillStyle = 'rgba(13,17,23,0.75)';
    context.fillRect(0, VIEW.height - 30, VIEW.width, 30);
    text(state.radioText, VIEW.width / 2, VIEW.height - 10, 15, PALETTE.muted, 'center');
    // Hints and speed.
    if (p.mode === 'car') {
      text(`${Math.round(Math.abs(p.speed) * 0.36)} km/h`, VIEW.width - 16, VIEW.height - 44, 20, PALETTE.text, 'right', '700');
      text('E exit car · Space handbrake · H horn', 16, VIEW.height - 44, 14, PALETTE.muted, 'left');
    } else {
      text('WASD move · Click shoot · Space punch · E steal car · P pause', 16, VIEW.height - 44, 14, PALETTE.muted, 'left');
    }
    // Garage prompt.
    const garage = state.city.locations.find((l) => l.name === "Benny's Garage");
    if (garage && Math.hypot(p.x - garage.x, p.y - garage.y) < 150) {
      context.fillStyle = 'rgba(23,29,41,0.95)';
      context.fillRect(VIEW.width / 2 - 300, VIEW.height - 108, 600, 56);
      text("BENNY'S GARAGE", VIEW.width / 2, VIEW.height - 84, 16, PALETTE.gold, 'center', '700');
      text(`[1] Speed $${300}  ·  [2] Armor $${350}  ·  [3] Repair $${100}   —   Speed Lv${p.speedLevel}  Armor Lv${p.armorLevel}`, VIEW.width / 2, VIEW.height - 62, 14, PALETTE.text, 'center');
    }
    // Objective edge arrow.
    if (objective) {
      const ox = objective.x - (cam.x + VIEW.width / 2);
      const oy = objective.y - (cam.y + VIEW.height / 2);
      if (Math.abs(ox) > VIEW.width / 2 || Math.abs(oy) > VIEW.height / 2) {
        const a = Math.atan2(oy, ox);
        const ax = VIEW.width / 2 + Math.cos(a) * (VIEW.width / 2 - 40);
        const ay = VIEW.height / 2 + Math.sin(a) * (VIEW.height / 2 - 60);
        context.save();
        context.translate(ax, ay);
        context.rotate(a);
        context.fillStyle = PALETTE.objective;
        context.beginPath();
        context.moveTo(14, 0);
        context.lineTo(-10, -10);
        context.lineTo(-10, 10);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 30;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(13,17,23,0.82)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.text, 'center', '700');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 108 + i * 30, 18, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 26, 18, PALETTE.gold, 'center', '700');
  }

  function draw(state, screen, best, banner, objective) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_TITLE) snapCamera(state);
    else updateCamera(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - cam.x * view.scale, view.y - cam.y * view.scale);
    drawCity(state);
    drawObjective(state, objective);
    drawEntities(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen !== SCREEN_TITLE) drawHud(state, objective);
    if (banner) {
      context.fillStyle = 'rgba(23,29,41,0.95)';
      context.fillRect(VIEW.width / 2 - 260, 60, 520, 40);
      text(banner, VIEW.width / 2, 86, 18, PALETTE.gold, 'center', '700');
    }
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLMAR BAY', [
        'Lucia Reyes came back to Solmar Bay broke. Fixer Mara Voss has work:',
        '12 missions over 3 days — from a first delivery at the Old Market',
        'to the Casino Royale vault run. Steal cars, outrun the Solmar PD,',
        'and spend the cash at Benny\u2019s Garage.',
        `Best run: ${best} mission${best === 1 ? '' : 's'} completed.`,
        'WASD move & drive · Mouse aim · Click shoot · Space punch / handbrake',
        'E steal car · H horn · P pause · S save (paused) · C continue',
      ], 'Press Enter or click to start  ·  C to continue a saved game');
    } else if (screen === SCREEN_PAUSED) {
      const pm = state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
      drawPanel('PAUSED', [
        'The city waits. Your save keeps your missions, money and upgrades.',
        pm ? `Mission ${state.missionIndex + 1}/12: ${pm.title}` : 'All missions complete.',
      ], 'Press P to resume  ·  S to save');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [
        'The Solmar PD caught you. The mission restarts.',
        'You lose $50 for the bail.',
      ], 'Press Enter to try again');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [
        'Lucia is down. The mission restarts.',
        'You lose $50 for the hospital.',
      ], 'Press Enter to try again');
    } else if (screen === SCREEN_VICTORY) {
      drawPanel('SOLMAR BAY — COMPLETE', [
        'All 12 missions done. The vault is empty, the city is yours.',
        `Money earned: $${state.stats.moneyEarned}   ·   Cars stolen: ${state.stats.carsStolen}   ·   Shots fired: ${state.stats.shotsFired}`,
      ], 'Press Enter to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    snapCamera,
    /** Convert a mouse position in canvas CSS pixels to world coordinates. */
    screenToWorld(mx, my) {
      return { x: cam.x + (mx - view.x) / view.scale, y: cam.y + (my - view.y) / view.scale };
    },
  };
}
