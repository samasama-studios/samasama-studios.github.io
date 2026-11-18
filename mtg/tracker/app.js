'use strict';

/* ---------- Icons (viewBox 0 0 64 64, colored via CSS currentColor) ---------- */

// Custom shapes that have no official symbol
const ICONS = {
  pass:
    '<circle class="bg" cx="32" cy="32" r="31"/>' +
    '<path class="fg" d="M23 12 12 26H19.5V52H26.5V26H34Z M41 52 52 38H44.5V12H37.5V38H30Z"/>',
  combat:
    '<path d="M58 6 56 16 28 44 20 36 48 8Z"/><path d="M12 34 30 52 26 56 8 38Z"/><path d="M20 46 18 44 8 54 10 56Z" stroke-width="5" stroke-linejoin="round"/>',
  dot: '<circle cx="32" cy="32" r="28"/>',
  square: '<rect x="6" y="6" width="52" height="52"/>',
  plus: '<circle cx="32" cy="32" r="27"/><path d="M32 18V46M18 32H46"/>',
  minus: '<circle cx="32" cy="32" r="27"/><path d="M18 32H46"/>',
};

// Official MTG symbols from the Mana font (vendor/mana)
const MANA = {
  sorcery: 'sorcery',
  enchantment: 'enchantment',
  artifact: 'artifact',
  creature: 'creature',
  instant: 'instant',
  ability: 'tap',
  land: 'land',
};

const icon = (name) =>
  MANA[name]
    ? `<i class="ms ms-${MANA[name]} glyph" aria-hidden="true"></i>`
    : `<svg viewBox="0 0 64 64" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- Game definitions ---------- */

const STEPS = [
  { name: 'Untap', mark: 'dot', auto: true }, // no player gets priority
  { name: 'Upkeep', mark: 'dot' },
  { name: 'Draw', mark: 'dot' },
  { name: 'Main 1', mark: 'square', main: true },
  { name: 'Combat', mark: 'combat' },
  { name: 'Main 2', mark: 'square', main: true },
  { name: 'End', mark: 'dot' },
];

const UNTAP_DELAY = 700; // ms the Untap step stays highlighted

// speed: 'sorcery' = own main phase, empty stack; 'instant' = any time with priority
const ACTIONS = [
  { id: 'sorcery', label: 'Cast Sorcery', onStack: 'Casted Sorcery', speed: 'sorcery' },
  { id: 'enchantment', label: 'Cast Enchant', onStack: 'Casted Enchantment', speed: 'sorcery' },
  { id: 'artifact', label: 'Cast Artifact', onStack: 'Casted Artifact', speed: 'sorcery' },
  { id: 'creature', label: 'Cast Creature', onStack: 'Casted Creature', speed: 'sorcery' },
  { id: 'instant', label: 'Cast Instant', onStack: 'Casted Instant', speed: 'instant' },
  { id: 'ability', label: 'Activate Ability', onStack: 'Activated Ability', speed: 'instant' },
  { id: 'land', label: 'Play Land', speed: 'land' },
  { id: 'pass', label: 'Pass Priority', speed: 'instant' },
];

const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
const STARTING_LIFE = 20;
const STACK_VISIBLE = 3;

/* ---------- State ---------- */

const state = {
  turn: 1,
  active: 0, // whose turn it is
  step: 0,
  priority: null, // who may act right now (null during Untap)
  passes: 0, // consecutive passes without an action in between
  landPlayed: false,
  stack: [], // [{ owner, id }], last item is the top
  life: [STARTING_LIFE, STARTING_LIFE],
};

const other = (p) => 1 - p;

function canUse(p, action) {
  if (state.priority !== p) return false;
  if (action.speed === 'instant') return true;
  const sorcerySpeed = p === state.active && STEPS[state.step].main && state.stack.length === 0;
  if (action.speed === 'land') return sorcerySpeed && !state.landPlayed;
  return sorcerySpeed;
}

function advanceStep() {
  state.step += 1;
  if (state.step >= STEPS.length) {
    state.step = 0;
    state.active = other(state.active);
    state.turn += 1;
    state.landPlayed = false;
  }
  enterStep();
}

function enterStep() {
  state.passes = 0;
  if (STEPS[state.step].auto) {
    state.priority = null;
    setTimeout(() => {
      advanceStep();
      render();
    }, UNTAP_DELAY);
  } else {
    state.priority = state.active;
  }
}

function passPriority() {
  state.passes += 1;
  if (state.passes < 2) {
    state.priority = other(state.priority);
    return;
  }
  // Both players passed in succession
  if (state.stack.length) {
    state.stack.pop(); // top of the stack resolves
    state.priority = state.active;
    state.passes = 0;
  } else {
    advanceStep();
  }
}

function doAction(p, id) {
  const action = ACTION_BY_ID[id];
  if (!action || !canUse(p, action)) return;

  if (id === 'pass') {
    passPriority();
  } else if (id === 'land') {
    // Lands don't use the stack; the player keeps priority
    state.landPlayed = true;
    state.passes = 0;
  } else {
    // Casting goes on the stack and hands priority to the opponent
    state.stack.push({ owner: p, id });
    state.passes = 1;
    state.priority = other(p);
  }

  navigator.vibrate?.(12);
  render();
}

function changeLife(p, delta) {
  state.life[p] += delta;
  render();
}

/* ---------- Building the UI ---------- */

const table = document.getElementById('table');
const views = [0, 1].map(buildPlayer);

function buildPlayer(p) {
  const el = table.querySelector(`.player[data-p="${p}"]`);

  el.innerHTML = `
    <div class="life">
      <span class="prio-badge" title="Has priority">${icon('pass')}</span>
      <button class="life-btn" data-delta="-1" aria-label="Lose 1 life">${icon('minus')}</button>
      <output class="life-total" aria-live="polite"></output>
      <button class="life-btn" data-delta="1" aria-label="Gain 1 life">${icon('plus')}</button>
      <span class="life-spacer"></span>
    </div>
    <div class="board">
      <div class="tracker">
        <ol class="steps">
        ${STEPS.map((s) => `
          <li class="step">
            <span class="step-mark">${icon(s.mark)}</span>
            <span class="step-label">${s.name}</span>
          </li>`).join('')}
        </ol>
        <div class="track"><div class="track-fill"></div><div class="track-knob"></div></div>
      </div>
      <div class="content">
        <div class="actions">
          ${ACTIONS.map((a) => `
            <button class="action${a.id === 'pass' ? ' pass' : ''}" data-action="${a.id}">
              ${icon(a.id)}
              <span class="action-label">${a.label}</span>
            </button>`).join('')}
        </div>
        <div class="waiting">
          <ul class="stack"></ul>
          <div class="waiting-msg">
            <p class="waiting-text"></p>
            <p class="waiting-sub"></p>
          </div>
        </div>
      </div>
    </div>`;

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) doAction(p, btn.dataset.action);
  });

  el.querySelectorAll('.life-btn').forEach((btn) => bindHoldRepeat(btn, () => changeLife(p, Number(btn.dataset.delta))));

  return {
    el,
    total: el.querySelector('.life-total'),
    tracker: el.querySelector('.tracker'),
    steps: [...el.querySelectorAll('.step')],
    actions: [...el.querySelectorAll('.action')],
    stack: el.querySelector('.stack'),
    waitingText: el.querySelector('.waiting-text'),
    waitingSub: el.querySelector('.waiting-sub'),
  };
}

// Tap = ±1, press and hold = keeps counting
function bindHoldRepeat(btn, fn) {
  let delay = null;
  let repeat = null;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(repeat);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    delay = setTimeout(() => (repeat = setInterval(fn, 90)), 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => btn.addEventListener(t, stop));
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) fn(); // keyboard activation
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------- Rendering ---------- */

function render() {
  table.dataset.active = state.active;
  const progress = (state.step + 0.5) / STEPS.length;

  views.forEach((v, p) => {
    v.el.classList.toggle('has-priority', state.priority === p);
    v.total.textContent = state.life[p];

    v.tracker.style.setProperty('--progress', progress);
    v.steps.forEach((li, i) => li.classList.toggle('current', i === state.step));

    v.actions.forEach((btn) => {
      btn.disabled = !canUse(p, ACTION_BY_ID[btn.dataset.action]);
    });

    if (state.priority !== p) {
      v.waitingText.textContent =
        state.priority === null ? `Player ${state.active + 1} untaps` : `Waiting for Player ${state.priority + 1}`;
      v.waitingSub.textContent = `Turn ${state.turn} · Player ${state.active + 1} · ${STEPS[state.step].name}`;
      renderStack(v.stack);
    }
  });
}

function renderStack(list) {
  const key = JSON.stringify(state.stack);
  if (list.dataset.key === key) return; // avoid replaying the pop animation
  list.dataset.key = key;
  const top = [...state.stack].reverse();
  const hidden = top.length - STACK_VISIBLE;
  list.innerHTML =
    top
      .slice(0, STACK_VISIBLE)
      .map(
        (item) => `
        <li class="stack-item" style="--c: var(${item.owner === 0 ? '--blue' : '--red'})">
          ${icon(item.id)}
          <span>${ACTION_BY_ID[item.id].onStack}</span>
        </li>`
      )
      .join('') + (hidden > 0 ? `<li class="stack-more">+${hidden} more</li>` : '');
}

/* ---------- Keep the screen awake during a match ---------- */

async function keepAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    /* not supported or denied */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

/* ---------- Fullscreen ---------- */

const isInstalled = () =>
  ['fullscreen', 'standalone'].some((m) => matchMedia(`(display-mode: ${m})`).matches) ||
  navigator.standalone === true; // iOS home-screen app

// In a regular browser tab, the first tap goes fullscreen (browsers require a user gesture)
async function goFullscreen() {
  const root = document.documentElement;
  if (!isInstalled() && !document.fullscreenElement && root.requestFullscreen) {
    try {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* not allowed here (e.g. iPhone Safari) */
    }
  }
  try {
    await screen.orientation?.lock?.('portrait');
  } catch {
    /* only works in fullscreen on some devices */
  }
}

// pointerup (not pointerdown) counts as a user gesture for touch input
document.addEventListener(
  'pointerup',
  () => {
    keepAwake();
    goFullscreen();
  },
  { once: true }
);

/* ---------- Offline support ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

enterStep();
render();
