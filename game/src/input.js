// Keyboard and mouse input. Held keys give movement; one-shot presses (steal,
// punch, pause, confirm, save, garage keys) are queued as flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
// Space is punch on foot and the handbrake in a car; Enter or a click confirms
// on menus. S walks down in play and saves while paused; C continues a save
// from the title screen.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SAVE = 4;
export const ACTION_CONTINUE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let punch = false;
  let steal = false;
  let horn = false;
  let garageKey = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      keys.add(event.code);
      if (event.code === 'KeyS') actions |= ACTION_SAVE;
      event.preventDefault();
    } else if (event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
    } else if (event.code === 'Space') {
      keys.add(event.code);
      punch = true;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyE') {
      steal = true;
    } else if (event.code === 'KeyH') {
      horn = true;
    } else if (event.code === 'KeyF') {
      punch = true;
    } else if (event.code === 'KeyC') {
      actions |= ACTION_CONTINUE;
    } else if (event.code === 'Digit1') {
      garageKey = 1;
    } else if (event.code === 'Digit2') {
      garageKey = 2;
    } else if (event.code === 'Digit3') {
      garageKey = 3;
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function move() {
    let mx = 0;
    let my = 0;
    for (const code of keys) {
      if (LEFT.has(code)) mx -= 1;
      if (RIGHT.has(code)) mx += 1;
      if (UP.has(code)) my -= 1;
      if (DOWN.has(code)) my += 1;
    }
    return { mx, my };
  }

  return {
    /** Movement this frame plus the held shoot state (mouse down). */
    poll() {
      const { mx, my } = move();
      return {
        mx, my,
        shoot: mouseDown,
        mouseX, mouseY,
        handbrake: keys.has('Space'),
      };
    },
    /** One-shot presses since the last call. */
    takePresses() {
      const taken = { punch, steal, horn, garageKey, actions };
      punch = false;
      steal = false;
      horn = false;
      garageKey = 0;
      actions = 0;
      return taken;
    },
  };
}
