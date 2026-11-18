'use strict';

/* ---------- Icons (viewBox 0 0 64 64, colored via CSS currentColor) ---------- */

// Custom shapes that have no official symbol
const ICONS = {
  pass:
    '<circle class="bg" cx="32" cy="32" r="31"/>' +
    '<path class="fg" d="M23 12 12 26H19.5V52H26.5V26H34Z M41 52 52 38H44.5V12H37.5V38H30Z"/>',
  shield: '<path d="M4 4H60V26C60 44 47 55 32 62C17 55 4 44 4 26Z"/>',
  endturn: '<path d="M4 14 30 32 4 50Z M32 14 58 32 32 50Z"/>',
  dot: '<circle cx="32" cy="32" r="28"/>',
  square: '<rect x="6" y="6" width="52" height="52"/>',
  plus: '<circle cx="32" cy="32" r="27"/><path d="M32 18V46M18 32H46"/>',
  minus: '<circle cx="32" cy="32" r="27"/><path d="M18 32H46"/>',
  revert:
    '<path d="M22 20H40A14 14 0 0 1 40 48H20" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6 20 24 7V33Z" stroke="none"/>',
  reset:
    '<path d="M50 32A18 18 0 1 1 41 16.4" fill="none" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M48.5 21 35.3 22.3 43.3 8.5Z" stroke="none"/>',
  gear:
    [0, 45, 90, 135, 180, 225, 270, 315]
      .map((deg) => `<rect x="27" y="5" width="10" height="14" rx="2" transform="rotate(${deg} 32 32)"/>`)
      .join('') +
    '<path fill-rule="evenodd" d="M32 13a19 19 0 1 0 0 38 19 19 0 1 0 0-38Zm0 11a8 8 0 1 1 0 16 8 8 0 1 1 0-16Z"/>',
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

// hint: [for the player whose turn it is, for the opponent]; {A} = active player's name
const STEPS = [
  { name: 'Begin', mark: 'dot', // untap, upkeep and draw in one step
    hint: ['Untap your cards, then draw a card (no draw on the very first turn)', '{A} untaps and draws a card'] },
  { name: 'Main 1', mark: 'square', main: true,
    hint: ['Play a land and cast spells of any type', '{A} can play a land and cast spells'] },
  { name: 'Combat', mark: 'shield',
    hint: ['Attack with your untapped creatures', "Block {A}'s attackers with your creatures"] },
  { name: 'Main 2', mark: 'square', main: true,
    hint: ['After combat: play a land or cast more spells', '{A} can cast more spells after combat'] },
  { name: 'End', mark: 'dot',
    hint: ['"At end of turn" effects happen, discard down to 7', '{A} is ending their turn'] },
];

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
const PLURAL = { sorcery: 'Sorceries', enchantment: 'Enchantments', artifact: 'Artifacts', creature: 'Creatures' };
const HINT_TOAST_MS = 3500;
const RESOLVE_TOAST_MS = 2500;

// What happens to a spell when it resolves, by card type
const RESOLVES = {
  creature: { noun: 'creature', then: 'Put it onto the battlefield.' },
  artifact: { noun: 'artifact', then: 'Put it onto the battlefield.' },
  enchantment: { noun: 'enchantment', then: 'Put it onto the battlefield.' },
  sorcery: { noun: 'sorcery', then: 'Do what it says, then put it in the graveyard.' },
  instant: { noun: 'instant', then: 'Do what it says, then put it in the graveyard.' },
  ability: { noun: 'ability', then: 'Apply its effect.' },
};
const STARTING_LIFE = 20;
const STACK_VISIBLE = 3;

/* ---------- State ---------- */

const newGame = () => ({
  turn: 1,
  active: 0, // whose turn it is
  step: 0,
  priority: 0, // who may act right now
  passes: 0, // consecutive passes without an action in between
  landPlayed: false,
  stack: [], // [{ owner, id }], last item is the top
  life: [STARTING_LIFE, STARTING_LIFE],
});

const state = newGame();

// Snapshots of the game flow before each action, for "Revert last step".
// Life totals are left out so reverting never touches them.
const HISTORY_LIMIT = 200;
let history = [];

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
  state.priority = state.active;
}

// End Turn: the active player skips ahead to their End step (only with an empty stack)
const canEndTurn = (p) => state.priority === p && p === state.active && state.stack.length === 0;

// Returns the stack item that resolved, if any
function passPriority() {
  state.passes += 1;
  if (state.passes < 2) {
    state.priority = other(state.priority);
    return null;
  }
  // Both players passed in succession
  if (state.stack.length) {
    const resolved = state.stack.pop(); // top of the stack resolves
    state.priority = state.active;
    state.passes = 0;
    return resolved;
  }
  advanceStep();
  return null;
}

function doAction(p, id) {
  const action = ACTION_BY_ID[id];
  if (!action || !canUse(p, action)) return;

  remember(describeAction(p, action));

  let resolved = null;
  if (id === 'pass') {
    resolved = passPriority();
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

  views.forEach(hideToast);
  if (resolved) views.forEach((v) => showResolved(v, resolved));
  navigator.vibrate?.(12);
  render();
}

function endTurn(p) {
  if (!canEndTurn(p)) return;
  remember(`Player ${p + 1} ended their turn`);
  // Jump to the End step as if the active player passed: the opponent still gets a last
  // chance to respond, and if they pass too the turn ends.
  state.step = STEPS.length - 1;
  state.passes = 1;
  state.priority = other(p);
  views.forEach(hideToast);
  navigator.vibrate?.(12);
  render();
}

// Snapshot the game flow so "Revert last step" can undo the next change
function remember(label) {
  const { life, ...flow } = state;
  history.push({ flow: structuredClone(flow), label });
  if (history.length > HISTORY_LIMIT) history.shift();
}

// Plain-language reason why a dimmed action can't be used right now
function whyNot(p, action) {
  const sorceryLike = action.speed !== 'land';
  const what = sorceryLike ? PLURAL[action.id] : 'Lands';
  const verb = sorceryLike ? 'cast' : 'played';
  if (p !== state.active) {
    return sorceryLike
      ? `${what} can only be cast on your own turn. Cards with Flash work like instants: use Cast Instant.`
      : 'Lands can only be played on your own turn.';
  }
  if (!STEPS[state.step].main) return `${what} can only be ${verb} in your main phases (Main 1 or Main 2).`;
  if (state.stack.length) {
    return `${what} can't be ${verb} while something is on the stack. Respond with an instant or ability, or pass.`;
  }
  if (action.speed === 'land' && state.landPlayed) return 'You already played a land this turn. Only one per turn!';
  return '';
}

// What this player should know right now
function hintFor(p) {
  if (state.priority === p && state.stack.length) {
    return 'Respond with an instant or ability, or pass to let the top spell resolve';
  }
  if (state.priority === p && p !== state.active && state.step === STEPS.length - 1) {
    return 'Last chance to cast instants this turn, or pass to start your turn';
  }
  const [mine, theirs] = STEPS[state.step].hint;
  return p === state.active ? mine : theirs.replace('{A}', `Player ${state.active + 1}`);
}

function describeAction(p, action) {
  const who = `Player ${p + 1}`;
  if (action.id === 'pass') return `${who} passed priority`;
  if (action.id === 'land') return `${who} played a land`;
  return `${who} · ${action.onStack}`;
}

function revertLastStep() {
  const last = history.pop();
  if (!last) return;
  Object.assign(state, last.flow);
  views.forEach(hideToast);
  render();
}

function resetGame() {
  Object.assign(state, newGame());
  history = [];
  views.forEach(hideToast);
  enterStep();
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
        <div class="timeline" style="--n: ${STEPS.length}">
          <div class="track"><div class="track-fill"></div></div>
          <ol class="steps">
          ${STEPS.map((s) => `
            <li class="step">
              <span class="step-mark">${icon(s.mark)}</span>
              <span class="step-label">${s.name}</span>
            </li>`).join('')}
          </ol>
        </div>
        <button class="end-turn" data-endturn>
          ${icon('endturn')}
          <span>End Turn</span>
        </button>
      </div>
      <div class="content">
        <p class="step-hint"></p>
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
      <div class="hint-toast" role="status" hidden></div>
      <div class="resolve-toast" role="status" hidden>
        <span class="resolve-icon"></span>
        <span class="resolve-text">
          <span class="resolve-title"></span>
          <span class="resolve-then"></span>
        </span>
      </div>
    </div>`;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-endturn]')) {
      if (canEndTurn(p)) endTurn(p);
      else if (state.stack.length) showReason(view, 'Let everything on the stack resolve before ending your turn.');
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.getAttribute('aria-disabled') === 'true') showWhy(view, ACTION_BY_ID[btn.dataset.action]);
    else doAction(p, btn.dataset.action);
  });

  el.querySelectorAll('.life-btn').forEach((btn) => bindHoldRepeat(btn, () => changeLife(p, Number(btn.dataset.delta))));

  const view = {
    el,
    total: el.querySelector('.life-total'),
    timeline: el.querySelector('.timeline'),
    endTurn: el.querySelector('.end-turn'),
    steps: [...el.querySelectorAll('.step')],
    actions: [...el.querySelectorAll('.action')],
    stack: el.querySelector('.stack'),
    waitingText: el.querySelector('.waiting-text'),
    waitingSub: el.querySelector('.waiting-sub'),
    hint: el.querySelector('.step-hint'),
    toast: el.querySelector('.hint-toast'),
    toastTimer: null,
    resolve: el.querySelector('.resolve-toast'),
    resolveTimer: null,
  };

  view.toast.addEventListener('click', (e) => {
    e.stopPropagation();
    hideToast(view);
  });

  return view;
}

function showWhy(view, action) {
  showReason(view, whyNot(Number(view.el.dataset.p), action));
}

function showReason(view, reason) {
  if (!reason) return;
  hideToast(view);
  view.toast.textContent = reason;
  view.toast.hidden = false;
  clearTimeout(view.toastTimer);
  view.toastTimer = setTimeout(() => hideToast(view), HINT_TOAST_MS);
}

function hideToast(view) {
  clearTimeout(view.toastTimer);
  clearTimeout(view.resolveTimer);
  view.toast.hidden = true;
  view.resolve.hidden = true;
}

// "Your creature resolves" / "Player 2's instant resolves", in the caster's color
function showResolved(view, item) {
  const p = Number(view.el.dataset.p);
  const { noun, then } = RESOLVES[item.id];
  const whose = item.owner === p ? 'Your' : `Player ${item.owner + 1}'s`;
  view.resolve.style.setProperty('--c', `var(${item.owner === 0 ? '--blue' : '--red'})`);
  view.resolve.querySelector('.resolve-icon').innerHTML = icon(item.id);
  view.resolve.querySelector('.resolve-title').textContent = `${whose} ${noun} resolves`;
  view.resolve.querySelector('.resolve-then').textContent = then;
  view.resolve.hidden = false;
  view.resolveTimer = setTimeout(() => (view.resolve.hidden = true), RESOLVE_TOAST_MS);
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
  const progress = state.step / (STEPS.length - 1);

  views.forEach((v, p) => {
    v.el.classList.toggle('has-priority', state.priority === p);
    v.total.textContent = state.life[p];

    v.timeline.style.setProperty('--progress', progress);
    v.steps.forEach((li, i) => {
      li.classList.toggle('current', i === state.step);
      li.classList.toggle('done', i < state.step);
    });
    v.el.classList.toggle('my-turn', state.active === p);
    v.endTurn.setAttribute('aria-disabled', !canEndTurn(p));

    v.actions.forEach((btn) => {
      btn.setAttribute('aria-disabled', !canUse(p, ACTION_BY_ID[btn.dataset.action]));
    });

    v.hint.textContent = hintFor(p);

    if (state.priority !== p) {
      v.waitingText.textContent = `Waiting for Player ${state.priority + 1}`;
      v.waitingSub.textContent = `Turn ${state.turn} · Player ${state.active + 1} · ${STEPS[state.step].name}`;
      renderStack(v.stack);
    }
  });

  renderMenu();
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

/* ---------- Game menu ---------- */

const menu = document.getElementById('menu');
const revertBtn = document.getElementById('revert-btn');
const revertSub = document.getElementById('revert-sub');
const resetBtn = document.getElementById('reset-btn');
const resetLabel = document.getElementById('reset-label');
const RESET_CONFIRM_MS = 3000;
let resetArmed = null;

document.getElementById('gear-btn').innerHTML = icon('gear');
menu.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
document.getElementById('gear-btn').addEventListener('click', () => {
  disarmReset();
  menu.showModal();
  menu.focus(); // focus the panel, not the first button, so no focus ring shows on open
});
document.getElementById('menu-close').addEventListener('click', () => menu.close());

// Tapping the backdrop (outside the panel) closes the menu
menu.addEventListener('click', (e) => {
  if (e.target === menu) menu.close();
});
menu.addEventListener('close', disarmReset);

revertBtn.addEventListener('click', () => {
  revertLastStep();
  navigator.vibrate?.(12);
});

// Reset needs a second tap within a few seconds, so a stray tap can't wipe the match
resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetBtn.classList.add('armed');
    resetLabel.textContent = 'Tap again to reset';
    resetArmed = setTimeout(disarmReset, RESET_CONFIRM_MS);
    return;
  }
  disarmReset();
  resetGame();
  navigator.vibrate?.([20, 60, 20]);
  menu.close();
});

function disarmReset() {
  clearTimeout(resetArmed);
  resetArmed = null;
  resetBtn.classList.remove('armed');
  resetLabel.textContent = 'Reset game';
}

function renderMenu() {
  const last = history[history.length - 1];
  revertBtn.disabled = !last;
  revertSub.textContent = last ? `Undo: ${last.label}` : 'Nothing to revert yet';
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
