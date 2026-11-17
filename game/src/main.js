// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// six screens: title, play, paused, busted, wasted and victory. Progress saves
// to localStorage (S while paused) and continues from the title (C).
//
// ?seed=N fixes the traffic pattern. ?shot=start|drive|chase|victory (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_HIT, EVENT_MISSION,
  EVENT_SHOT, EVENT_STOLE, EVENT_VICTORY, EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_PAUSE, ACTION_SAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_VICTORY, SCREEN_WASTED,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const ZERO_INPUT = {
  mx: 0, my: 0, shoot: false, aimX: 0, aimY: 0,
  punch: false, steal: false, handbrake: false, horn: false, garageKey: 0,
};

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// Test hook: the smoke test reads the world and the current screen through it.
window.__solmar = { world, getScreen: () => 'title' };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
    return true;
  } catch {
    return false;
  }
}

const ZERO_PRESSES = { punch: false, steal: false, horn: false, garageKey: 0, actions: 0 };

function runShot(name) {
  const scene = stageShot(name, world);
  window.__solmar.getScreen = () => scene.screen;
  // The world steps forward without rendering, so the smoothed camera is
  // still back at the spawn: snap it to the player, or the shot frames the
  // wrong part of the city and the player is off-screen.
  renderer.snapCamera(world.state);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, null, world.objectiveLocation());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  window.__solmar.getScreen = () => screen;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let banner = null;
  let bannerUntil = 0;

  function announce(message) {
    status.textContent = message;
  }

  function showBanner(message) {
    banner = message;
    bannerUntil = performance.now() + 3500;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Mission 1: First Delivery.');
  }

  function continueGame() {
    const save = readSave();
    if (!save) return;
    world.reset();
    if (!world.loadSave(save)) return;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Continuing. Mission ${world.state.missionIndex + 1}.`);
  }

  function endBusted() {
    screen = SCREEN_BUSTED;
    saveBest(Math.max(best, world.state.stats.missionsDone));
    best = readBest();
    announce('Busted. The Solmar PD caught you.');
  }

  function endWasted() {
    screen = SCREEN_WASTED;
    saveBest(Math.max(best, world.state.stats.missionsDone));
    best = readBest();
    announce('Wasted. Lucia is down.');
  }

  function endVictory() {
    screen = SCREEN_VICTORY;
    saveBest(Math.max(best, world.state.stats.missionsDone));
    best = readBest();
    announce('Solmar Bay complete. All 12 missions done.');
  }

  function handleActions() {
    const presses = input.takePresses();
    const actions = presses.actions;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE) continueGame();
      else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_SAVE) {
        showBanner(writeSave() ? 'Game saved.' : 'Save failed: storage unavailable.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        world.respawn();
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    } else if (screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) {
        world.reset();
        screen = SCREEN_TITLE;
        announce('Solmar Bay. Press Enter or click to start.');
      }
    }
    return presses;
  }

  function stepWorld(presses) {
    const poll = input.poll();
    const aim = renderer.screenToWorld(poll.mouseX, poll.mouseY);
    const events = world.step(STEP, {
      mx: poll.mx,
      my: poll.my,
      shoot: poll.shoot,
      aimX: aim.x,
      aimY: aim.y,
      punch: presses.punch,
      steal: presses.steal,
      handbrake: poll.handbrake,
      horn: presses.horn,
      garageKey: presses.garageKey,
    });
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_STOLE) audio.steal();
    if (events & EVENT_MISSION) {
      audio.mission();
      best = Math.max(best, world.state.stats.missionsDone);
      saveBest(best);
      if (world.state.victory) {
        endVictory();
      } else {
        const done = MISSIONS[world.state.missionIndex - 1];
        const next = MISSIONS[world.state.missionIndex];
        showBanner(`Mission complete! +$${done.reward}  Next: ${next ? next.title : '—'}`);
      }
    }
    if (world.state.missionFailed) {
      world.state.missionFailed = false;
      audio.fail();
      showBanner('Time up! The mission restarts.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      endBusted();
    } else if (events & EVENT_WASTED) {
      audio.fail();
      endWasted();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const presses = handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, ZERO_INPUT);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      // One-shot presses count on the first sub-step only: passing them to
      // every sub-step would steal and un-steal a car in the same frame.
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepWorld(first ? presses : ZERO_PRESSES);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (world.state.player.wanted > 0 && screen === SCREEN_PLAY) audio.startSiren();
    else audio.stopSiren();
    const bannerText = banner && now < bannerUntil ? banner : null;
    if (!bannerText) banner = null;
    renderer.draw(world.state, screen, best, bannerText, world.objectiveLocation());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
