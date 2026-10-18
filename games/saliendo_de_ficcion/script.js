// Page wiring: connects taps to the scene. Like a puzzle, each step only advances when its own
// object is tapped (the tap areas follow each object's shape; press D to see them).
// Current flow (the object to tap in brackets):
//   on load → no plants yet; the sun and particles are already there
//   1 s later → the left side plant comes in (no tap needed)
//   1st tap [left plant] → the right side plant comes in
//   2nd tap [a side plant] → the side plants light up and the ukulele starts
//   3rd tap [character] → the character gets its aura and the bass comes in; it slowly rises
//             to the centre, then starts levitating
//   4th tap [sun] → the corner plants come in
//   5th step [sun, then a corner plant; four times] → each corner plant is lit with the sun's ray
//             (see Sun ray below); once all four are, at the next loop start the ukulele hands over
//             to its ending phrase (ukulele_intro_end), which plays once while the bass slowly fades out
//   6th tap [character] → the spiral (aura.webp) appears above the head; the ukulele + birds loop
//             starts once the ukulele's ending phrase has finished (right away if it already has)
//   7th tap [floor] → the mushrooms slide up from below
//   8th tap [mushrooms] → the mushrooms light up
//   taps after that → nothing yet (see STEPS below)
// ← steps back (each step animates in reverse); → / Space / Enter step forward without needing the
// right object (handy while building, and for keyboard players); M mutes; D shows/hides the tap
// areas (also on from the start with ?debug in the URL); H hints at what to tap next.
//
// On hold (commented out below):
//   the old bass + sun + aura toggling on/off with each tap

const engine = new LoopEngine();

const TRACKS = {
  ukulele: { url: 'assets/sounds/ukulele.wav', active: true },
  // Plays in sync with the ukulele from the start, but silent until its step turns it up.
  // level: 0.7 ≈ 3 dB quieter than recorded, so it sits under the ukulele.
  bass: { url: 'assets/sounds/bass.wav', active: false, level: 0.7 },
  // The ukulele's ending phrase: played once (not looped), in place of the ukulele.
  ukulele_intro_end: { url: 'assets/sounds/ukulele_intro_end.wav', loop: false },
  // Starts from its first note right when the spiral appears, then keeps looping.
  ukulele_birds: { url: 'assets/sounds/ukulele_birds.wav', loop: false },
};

// Fetch + decode everything up front so the music starts instantly when it's time.
const ready = Promise.all(
  Object.entries(TRACKS).map(([name, { url, ...options }]) => engine.load(name, url, options))
);
ready.catch((err) => {
  // Most likely cause: the page was opened as a file:// URL, where fetch() is blocked.
  console.error('Audio failed to load. Serve the folder over http (e.g. VS Code Live Server).', err);
});

// --- On hold: bass + sun + aura -------------------------------------------
// // Illustration layers shown only while their track is on.
// const TRACK_VISUALS = {
//   bass: document.querySelectorAll('.layer-sun, .layer-aura'),
// };
//
// // Turn a track on/off along with its visuals. A body class (e.g. .ukulele-off)
// // lets the CSS react too — .ukulele-off brings the character to rest.
// function setTrack(track, active) {
//   engine.setActive(track, active);
//   TRACK_VISUALS[track]?.forEach((el) => el.classList.toggle('is-visible', active));
//   document.body.classList.toggle(`${track}-off`, !active);
// }
// ---------------------------------------------------------------------------

// Animates layers in together once their images have decoded, so they never pop in half-drawn.
// Layers not loaded up front (data-src) are fetched here.
// The double requestAnimationFrame makes sure the off-stage start position has been painted
// first — otherwise a cached image could skip straight to the end of the transition.
// A layer can be an <img> or a group of them. A group's lit images (.layer-light) are layers of
// their own, revealed on a later tap, so they're left alone here.
function reveal(els) {
  els = [...els];
  els.forEach((el) => { el.dataset.wanted = ''; });
  const imgs = els.flatMap((el) => (el.tagName === 'IMG' ? [el] : [...el.querySelectorAll(':scope > img:not(.layer-light)')]));
  imgs.forEach((img) => { if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src; });
  Promise.all(imgs.map((img) => img.decode()))
    .catch(() => {}) // a decode failure shouldn't keep the rest hidden
    .then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      // Skip any layer that was hidden again (arrow back) while its image was still loading.
      els.forEach((el) => { if ('wanted' in el.dataset) el.classList.add('is-visible'); });
    })));
}

// The reverse of reveal(): the layer animates back out (its CSS transition just runs backwards).
function hide(els) {
  els.forEach((el) => {
    delete el.dataset.wanted;
    el.classList.remove('is-visible');
  });
}

// The music: every loop starts together (the bass silent until its step turns it up).
// Going back stops it.
let musicWanted = false;

function startMusic() {
  musicWanted = true;
  ready.then(() => { if (musicWanted) engine.start(); }, () => {}); // waits for the audio if it's still loading
}

function stopMusic() {
  musicWanted = false;
  engine.stop();
}

// The ukulele finishes its current pass; right on the loop boundary it switches off and its
// ending phrase plays once in its place, so the hand-over is on the beat. The bass fades out
// over the phrase, reaching silence a little before it ends. Going back cancels the ending (or
// cuts it short) and the ukulele and bass come straight back in sync.
const BASS_ENDS_EARLY = 2; // seconds of the phrase left when the bass reaches silence
let introEndWanted = false;

function endUkulele() {
  introEndWanted = true;
  ready.then(() => {
    if (!introEndWanted || !engine.playing) return;
    const at = engine.nextLoopStart();
    engine.setActiveAt('ukulele', false, at);
    engine.playClip('ukulele_intro_end', at);
    engine.fadeAt('bass', false, at, engine.duration('ukulele_intro_end') - BASS_ENDS_EARLY);
  }, () => {});
}

function resumeUkulele() {
  introEndWanted = false;
  engine.stopClip('ukulele_intro_end');
  engine.setActive('ukulele', true);
  engine.setActive('bass', true);
}

// The ukulele + birds loop never plays over the ukulele: it waits for tap 5's plan to run out (the
// ukulele finishing its pass, then its ending phrase) and starts from its first note right as the
// ending finishes, then keeps looping. If the ending is already over it starts on the tap. The
// ukulele and bass are already switched off by then (see endUkulele), so they're left alone.
// Going back cancels the birds, whether they're still waiting or already playing.
let birdsWanted = false;

function startBirds() {
  birdsWanted = true;
  ready.then(() => {
    if (!birdsWanted || !engine.playing) return;
    const endingAt = engine.clipStart('ukulele_intro_end'); // null once the ending is over
    const at = endingAt === null ? undefined : endingAt + engine.duration('ukulele_intro_end');
    engine.playClip('ukulele_birds', at, { loop: true });
  }, () => {});
}

function stopBirds() {
  birdsWanted = false;
  engine.stopClip('ukulele_birds');
}

// The character gets its aura (and the bass comes in) as it starts rising out of the grass, and
// starts levitating once it arrives. Going back reverses it: the bass drops out, the aura fades and
// the character sinks back down.
const aura = document.querySelectorAll('.layer-particular-aura');
const riser = document.querySelector('.riser');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

riser.addEventListener('transitionend', (e) => {
  if (e.target !== riser) return; // ignore transitions bubbling up from inside the character
  if (!riser.classList.contains('is-risen')) return;
  document.body.classList.add('is-playing'); // starts the levitation
  scheduleWobble(IDLE_DELAY); // the sun's hint (see Idle hint) counts from here
});

// The particles spin while the character levitates (see style.css). When it sinks they turn back
// to their original position, the short way round, over the same time the character takes to
// sink, so the next rise starts them from there again.
const particles = document.querySelector('.layer-particles');
let particlesReturn;

function returnParticles() {
  const { a, b } = new DOMMatrix(getComputedStyle(particles).transform);
  const angle = Math.atan2(b, a); // where the spin has got to, -½ to ½ turn
  particlesReturn = particles.animate(
    [{ transform: `rotate(${angle}rad)` }, { transform: 'rotate(0)' }],
    { duration: 3000, easing: 'ease-in-out' }
  );
}

function rise() {
  particlesReturn?.cancel(); // in case it's still turning back
  reveal(aura);
  engine.setActive('bass', true);
  zoomSunOnNextLoop(); // first hint at the sun, on the loop the bass joins
  riser.classList.add('is-risen');
  if (reducedMotion.matches) document.body.classList.add('is-playing'); // no transition, so no transitionend
}

function sink() {
  if (document.body.classList.contains('is-playing')) returnParticles(); // read before the spin stops
  document.body.classList.remove('is-playing');
  hide(aura);
  engine.setActive('bass', false);
  riser.classList.remove('is-risen');
}

// Shorthand for a step that just reveals (forward) / hides (back) some layers.
const layers = (selector) => ({
  forward: () => reveal(document.querySelectorAll(selector)),
  back: () => hide(document.querySelectorAll(selector)),
});

// The scene opens with no plants; the left side plant comes in a moment later (the right one on
// the first tap).
const FIRST_PLANT_DELAY = 1000; // ms after the page loads
setTimeout(() => reveal(document.querySelectorAll('.plant-l')), FIRST_PLANT_DELAY);

// --- Sun ray -----------------------------------------------------------------
// Step 5: the corner plants are lit one at a time with a ray from the sun (the aura strand, which
// hangs from the sun). Pressing the sun picks the ray up; it then turns on the sun and grows or
// shrinks so its bright tip follows the pointer. Letting go over an unlit corner plant (drag and
// drop), or tapping one next (tap, then tap), lights that plant and the ray is released, ready to
// be picked up again. Tapping the sun while holding the ray puts it back. Once all four corner
// plants are lit, the step completes.
//
// So it can grow without its dots stretching, the ray is stacked from slices of aura.webp: the top
// (where it hangs from the sun), one twist of the helix repeated as many times as the reach needs,
// and the tail down to the bright tip dot. The cuts fall in the gaps between dots where the two
// strands cross, so the repeats join up; with one twist it's the strand exactly as drawn. In
// between whole twists, two strands sized to the same reach (one with a twist more) cross-fade, so
// a twist is blended in rather than popping in; each is squeezed or stretched a little to fit.
// All measurements in sprite pixels (the 2160 px canvas).
const RAY_LEFT = 990; // the slices' left edge…
const RAY_WIDTH = 160; // …and width: the strand's full swing
const RAY_TOP = [1066, 153]; // where the ray hangs from the sun: the point it turns on
const RAY_TWIST = [343, 563]; // one twist of the helix, between two crossings
const RAY_TIP = [1082, 933]; // the bright dot at its end
const RAY_END = 946; // just below the tip dot
const RAY_BLEND = [0.2, 0.8]; // where in the reach between two twist counts the cross-fade runs
const HEAD = RAY_TWIST[0] - RAY_TOP[1];
const TWIST = RAY_TWIST[1] - RAY_TWIST[0];
const TAIL = RAY_TIP[1] - RAY_TWIST[1]; // to the tip's centre
const TIP_DX = RAY_TIP[0] - RAY_TOP[0]; // the tip sits a little right of the pivot
const ray = document.querySelector('.layer-ray');
let rayHeld = false;

// A strand: head, twists (made as needed and kept for reuse) and tail, stacked in a column.
function makeStrand() {
  const el = ray.appendChild(document.createElement('div'));
  el.className = 'ray-strand';
  const head = el.appendChild(document.createElement('div'));
  const tail = el.appendChild(document.createElement('div'));
  return { el, head, tail, twists: [] };
}

const strands = [makeStrand(), makeStrand()]; // fewer twists, one twist more

// Show `top`–`bottom` of aura.webp in a slice, stretched down by `s` (k: screen px per sprite px).
function raySlice(el, top, bottom, k, s) {
  el.style.height = `${(bottom - top) * k * s}px`;
  el.style.backgroundSize = `${2160 * k}px ${2160 * k * s}px`;
  el.style.backgroundPosition = `${-RAY_LEFT * k}px ${-top * k * s}px`;
}

// Build a strand with `count` twists whose tip lands `down` sprite px below the pivot.
function buildStrand(strand, count, down, k) {
  const s = Math.max(down / (HEAD + count * TWIST + TAIL), 0.15);
  while (strand.twists.length < count) {
    strand.twists.push(strand.el.insertBefore(document.createElement('div'), strand.tail));
  }
  strand.twists.forEach((el, i) => { el.hidden = i >= count; });
  raySlice(strand.head, RAY_TOP[1], RAY_TWIST[0], k, s);
  strand.twists.slice(0, count).forEach((el) => raySlice(el, RAY_TWIST[0], RAY_TWIST[1], k, s));
  raySlice(strand.tail, RAY_TWIST[1], RAY_END, k, s);
}

// 0 below `from`, 1 above `to`, an S-curve in between.
function smoothstep(from, to, x) {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

// Build the ray so its tip lands `reach` sprite px from the pivot. Returns how far straight down
// from the pivot the tip then is, before the ray is turned.
function sizeRay(reach) {
  const k = ray.parentElement.getBoundingClientRect().width / 2160; // the stage
  const down = Math.sqrt(Math.max(reach ** 2 - TIP_DX ** 2, 1)); // tip's distance straight down
  const twists = (down - HEAD - TAIL) / TWIST; // how many would fit exactly (not a whole number)
  const fewer = Math.max(0, Math.floor(twists));
  const blend = smoothstep(RAY_BLEND[0], RAY_BLEND[1], twists - fewer);

  buildStrand(strands[0], fewer, down, k);
  buildStrand(strands[1], fewer + 1, down, k);
  strands[0].el.style.opacity = 1 - blend;
  strands[1].el.style.opacity = blend;

  Object.assign(ray.style, {
    left: `${RAY_LEFT * k}px`,
    top: `${RAY_TOP[1] * k}px`,
    width: `${RAY_WIDTH * k}px`,
    transformOrigin: `${(RAY_TOP[0] - RAY_LEFT) * k}px 0`,
  });
  return down;
}

const RAY_REACH = Math.hypot(TIP_DX, HEAD + TWIST + TAIL); // as drawn
sizeRay(RAY_REACH); // build it up front, so aura.webp is loaded before it's first picked up

// The ray starts where the sun was pressed: a short stub under the finger, growing as it's
// aimed. (Hanging at its drawn length, its tip would sit right over the character's head, looking
// like the spiral it only gets later; and a touch doesn't move again until the next one.)
function holdRay(clientX, clientY) {
  rayHeld = true;
  aimRay(clientX, clientY);
  ray.classList.add('is-visible');
  updateTargets();
}

function releaseRay() {
  if (!rayHeld) return;
  rayHeld = false;
  ray.classList.remove('is-visible');
  updateTargets();
}

// Point the ray's tip at the pointer. The stage is square and drawn at the sprites' 2160 px
// canvas, scaled.
function aimRay(clientX, clientY) {
  const r = ray.parentElement.getBoundingClientRect(); // the stage (the ray's own box turns with it)
  const x = (clientX - r.left) * 2160 / r.width - RAY_TOP[0];
  const y = (clientY - r.top) * 2160 / r.height - RAY_TOP[1];
  const down = sizeRay(Math.hypot(x, y));
  ray.style.transform = `rotate(${Math.atan2(y, x) - Math.atan2(down, TIP_DX)}rad)`;
}

function lightCorner(plant) {
  plant.classList.add('is-lit');
  reveal([plant.querySelector('.layer-light')]);
  releaseRay();
  if (!document.querySelector('.plants-corner:not(.is-lit)')) forward(); // all four lit
}

function unlightCorners() {
  document.querySelectorAll('.plants-corner').forEach((plant) => plant.classList.remove('is-lit'));
  hide(document.querySelectorAll('.plants-corner .layer-light'));
}

document.addEventListener('pointerdown', (e) => {
  if (!STEPS[step]?.ray) return;
  const onSun = e.target.closest?.('.collider-sun');
  if (!rayHeld) { if (onSun) holdRay(e.clientX, e.clientY); }
  else if (onSun) releaseRay();
  else aimRay(e.clientX, e.clientY);
});

document.addEventListener('pointermove', (e) => {
  if (rayHeld) aimRay(e.clientX, e.clientY);
});

// A touch keeps reporting the element it started on, so look up what's under the release point.
document.addEventListener('pointerup', (e) => {
  if (!rayHeld) return;
  const plant = document.elementFromPoint(e.clientX, e.clientY)?.closest('.plants-corner:not(.is-lit)');
  if (plant) lightCorner(plant);
});
// -----------------------------------------------------------------------------

// The scene's steps, in order. Each one goes forward when its object is tapped (`tap`: matched
// against the tapped collider and its parents), or on → / Space / Enter; ← goes back. A step whose
// `tap` is a function handles its own taps; the function just says what to highlight right now.
const STEPS = [
  {                                                     // 1: right side plant comes in
    tap: '.plant-l',
    forward: () => {
      layers('.plant-r').forward();
      scheduleWobble(SLIDE_IN + IDLE_DELAY); // the wobble waits for it to finish sliding in, too
    },
    back: layers('.plant-r').back,
  },
  {                                                     // 2: side plants light up, ukulele starts
    tap: '.plants-sides',
    forward: () => { layers('.plants-sides .layer-light').forward(); startMusic(); glowOnLoops(); },
    back: () => { layers('.plants-sides .layer-light').back(); stopMusic(); },
  },
  {                                                     // 3: aura + bass, character rises, levitates
    tap: '.levitator',
    forward: rise,
    back: () => { sink(); glowOnLoops(); }, // back to waiting for the character: its glow resumes
  },
  {                                                     // 4: corner plants come in
    tap: '.collider-sun',
    forward: layers('.plants-corner').forward,
    back: () => { layers('.plants-corner').back(); unlightCorners(); }, // any lit with the ray so far
  },
  {                                                     // 5: corner plants lit with the sun's ray, ukulele ending phrase
    ray: true,
    tap: () => (rayHeld ? '.plants-corner:not(.is-lit)' : '.collider-sun'),
    forward: () => { // all lit (the → key lights any the ray hasn't)
      document.querySelectorAll('.plants-corner').forEach((plant) => plant.classList.add('is-lit'));
      layers('.plants-corner .layer-light').forward();
      endUkulele();
    },
    back: () => { unlightCorners(); resumeUkulele(); },
  },
  {                                                     // 6: the spiral appears above the head, ukulele + birds
    tap: '.levitator',
    forward: () => { layers('.layer-aura').forward(); startBirds(); },
    back: () => { layers('.layer-aura').back(); stopBirds(); },
  },
  { tap: '.collider-floor', ...layers('.layer-shrooms') },             // 7: mushrooms slide up from below
  { tap: '.layer-shrooms', ...layers('.layer-shrooms .layer-light') }, // 8: mushrooms light up
];

let step = 0; // how many steps are currently done

function forward() {
  // Audio can only be unlocked inside a user gesture, so do it on every one (cheap once running).
  engine.unlock();
  if (step >= STEPS.length) return;
  releaseRay();
  STEPS[step].forward();
  step++;
  updateLevel();
  updateTargets();

  // On hold:
  // setTrack('bass', !engine.isActive('bass'));
}

// Marks the colliders of the object that moves the scene on, for the hand cursor (and ?debug).
const colliders = document.querySelectorAll('.collider');

// What the current step wants tapped right now (a selector), if anything.
function currentTap() {
  const tap = STEPS[step]?.tap;
  return typeof tap === 'function' ? tap() : tap;
}

function updateTargets() {
  const tap = currentTap();
  colliders.forEach((c) => c.classList.toggle('is-target', Boolean(tap && c.closest(tap))));
}

// A hint: the current target glows briefly in its own shape (see .is-hinted in style.css).
// Pressing H again mid-glow starts it over.
function hint() {
  colliders.forEach((c) => {
    c.classList.remove('is-hinted');
    if (!c.classList.contains('is-target')) return;
    void c.getBoundingClientRect(); // restart the animation
    c.classList.add('is-hinted');
  });
}

colliders.forEach((c) => c.addEventListener('animationend', () => c.classList.remove('is-hinted')));

if (new URLSearchParams(location.search).has('debug')) document.body.classList.add('debug');
updateTargets();

function back() {
  if (step === 0) return;
  releaseRay();
  step--;
  STEPS[step].back();
  updateLevel();
  updateTargets();
}

// --- Progress bars -----------------------------------------------------------
// Level: how many of the scene's steps are done. Loop: where the music is in its loop (the
// ukulele + birds loop once it's playing, since it runs on its own timing; otherwise the synced
// loops, whose loop starts are when tap 5's ending lands). Both scale a fill with scaleX.
// The loop bar, with the sound controls, stays hidden until the music is actually playing, and
// hides again if it stops.
const levelBar = document.querySelector('.bar-level');
const levelFill = levelBar.querySelector('span');
const loopFill = document.querySelector('.bar-loop span');
const soundDock = document.querySelector('.dock'); // the loop bar and the sound controls
levelBar.setAttribute('aria-valuemax', STEPS.length);

function updateLevel() {
  levelFill.style.transform = `scaleX(${step / STEPS.length})`;
  levelBar.setAttribute('aria-valuenow', step);
}

function updateLoop() {
  const progress = engine.clipProgress('ukulele_birds') ?? engine.loopProgress();
  loopFill.style.transform = `scaleX(${progress})`;
  soundDock.classList.toggle('is-visible', engine.playing);
  requestAnimationFrame(updateLoop);
}

updateLevel();
requestAnimationFrame(updateLoop);
// -----------------------------------------------------------------------------

// --- Sound controls (volume slider + mute) ---------------------------------
const controls = document.querySelector('.controls');
const muteButton = controls.querySelector('.mute');
const volumeSlider = controls.querySelector('.volume');
const VOLUME_KEY = 'saliendo-volume';
let muted = false;

// Remember the chosen volume between visits (if storage is blocked, start at the default in index.html).
try {
  const saved = localStorage.getItem(VOLUME_KEY);
  if (saved !== null) volumeSlider.value = saved;
} catch {}

function applyVolume() {
  // Squared so the slider feels even to the ear (loudness isn't linear in gain).
  const v = Number(volumeSlider.value);
  engine.setVolume(muted ? 0 : v * v);
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
  muteButton.title = `${muteButton.getAttribute('aria-label')} (M)`;
}

function onVolumeChange() {
  muted = false; // moving the slider brings the sound back
  applyVolume();
  try { localStorage.setItem(VOLUME_KEY, volumeSlider.value); } catch {}
}

volumeSlider.addEventListener('input', onVolumeChange);

// Double-click the slider to reset it to the default volume (the value set in index.html).
volumeSlider.addEventListener('dblclick', () => {
  volumeSlider.value = volumeSlider.defaultValue;
  onVolumeChange();
});

muteButton.addEventListener('click', () => {
  muted = !muted;
  if (!muted && Number(volumeSlider.value) === 0) volumeSlider.value = 0.5; // unmuting to silence would feel broken
  applyVolume();
});

// Taps on the controls must not advance the scene.
controls.addEventListener('click', (e) => e.stopPropagation());

// Move the dock beside the square when it fits there (wide screens), so it doesn't cover the
// scene; otherwise it stays centred at the bottom, over the scene.
const stage = document.querySelector('.stage');
const dock = document.querySelector('.dock');

function placeDock() {
  const gutter = window.innerWidth - stage.getBoundingClientRect().right;
  document.body.classList.toggle('dock-side', gutter >= dock.offsetWidth + 32); // 16px each side
}

window.addEventListener('resize', placeDock);
placeDock();

applyVolume();
// ---------------------------------------------------------------------------

// --- Idle hint ---------------------------------------------------------------
// If nobody interacts for a few seconds, what to tap next moves to invite a tap, then again
// every few seconds:
//   - until the side plants light up, the side plants that are in (the left one, then both) wobble
//   - once they're lit, the character glows for a moment with its aura (particular_aura.png) on
//     every ukulele loop start, starting with the second, until it's tapped (that one follows the
//     music rather than idle time: see glowOnLoops)
//   - once the character is levitating, the sun gives a little zoom bounce, until it's tapped;
//     it also gives one on the first loop start after the bass comes in (see zoomSunOnNextLoop)
// Stepping back to those moments brings the hint back. Any interaction restarts the wait; a
// wobble already under way finishes on its own instead of snapping back.
const IDLE_DELAY = 3000; // ms without interaction before the first wobble
const WOBBLE_EVERY = 4000; // ms between wobbles while still idle
const SIDES_LIT = 2; // steps done once the side plants are lit (see STEPS)
const SUN_NEXT = 3; // steps done when the sun is next (the character has risen)
let idleTimer;

// A damped sway: each plant tips in toward the centre (pivoting on the middle of its edge, see
// style.css) while bobbing up, swings back past rest and settles. The plants are cut off at the
// screen's side edges, so tilting would show the cut: each one is pushed back out past its edge
// in step with the tilt to keep the cut off-screen. The plants reach about 30% of the stage's
// height above/below the pivot, so a tilt of 1° moves their cut edge in by about 0.3 × sin(1°)
// ≈ 0.5% of the stage's width; PUSH_PER_DEG adds some margin to that.
// Animates the separate `translate` and `rotate` properties, so it doesn't disturb the slide-in
// transform. Percentages are relative to the layer's (square) size, so it scales with the screen.
// The right plant mirrors the left one, and follows a moment after it so they don't move in unison.
const PUSH_PER_DEG = 0.6; // % of the stage's width pushed out per degree of tilt
const WOBBLE_FRAMES = [ // [tilt in degrees, vertical bob in %]
  [0, 0], [3, -0.8], [-2, 0.5], [1, -0.2], [0, 0],
];

function wobblePlants() {
  document.querySelectorAll('.plants-sides.is-visible').forEach((plant, i) => {
    const dir = plant.classList.contains('plant-r') ? -1 : 1;
    plant.animate(
      WOBBLE_FRAMES.map(([deg, y]) => ({
        rotate: `${deg * dir}deg`,
        translate: `${-dir * Math.abs(deg) * PUSH_PER_DEG}% ${y}%`,
      })),
      { duration: 700, delay: i * 300, easing: 'ease-in-out' }
    );
  });
}

// The sun swells a little, dips below its size and settles, around its centre (see .sun).
// Animates the separate `scale` property, so it doesn't disturb the sun's turning (`rotate`).
const sun = document.querySelector('.sun');

// Eased per keyframe (not over the whole zoom), so the biggest is exactly a quarter in: see ZOOM_PEAK.
function zoomSun() {
  sun.animate([1, 1.05, 0.98, 1.015, 1].map((scale) => ({ scale: String(scale), easing: 'ease-in-out' })),
    { duration: 900 });
}

// One zoom on the next loop start after the bass comes in (when the character is tapped), timed on
// the audio clock so its peak lands on the downbeat. Skipped if the sun is no longer what's next.
const ZOOM_PEAK = 0.225; // s into the zoom when it's biggest (the 1.05 frame: a quarter of 900 ms)
let sunBeatTimer;

function zoomSunOnNextLoop() {
  clearTimeout(sunBeatTimer);
  ready.then(() => {
    if (!engine.playing) return;
    let at = engine.nextLoopStart();
    if (at - ZOOM_PEAK < engine.ctx.currentTime) at += engine.duration('ukulele'); // too close to time it
    sunBeatTimer = setTimeout(() => {
      if (step === SUN_NEXT) zoomSun();
    }, (at - ZOOM_PEAK - engine.ctx.currentTime) * 1000);
  }, () => {});
}

// The character's aura (the same image it gets when it rises) flashes on where it sits: in quickly,
// out slowly. Opacity only, so it leaves the aura's own fade-in (.is-visible) alone.
const characterAura = document.querySelector('.layer-particular-aura');

// While the character waits to be tapped (side plants lit, not risen yet), it glows on every loop
// start of the music, from the second one on (the first is when the plants light up), timed on
// the audio clock so the glow's peak lands on the downbeat.
const GLOW_PEAK = 0.27; // s into the glow when it's brightest (offset 0.3 of 900 ms)
let loopGlowTimer;

function glowOnLoops(after = 0) { // after: the downbeat just glowed on (audio-clock time)
  clearTimeout(loopGlowTimer);
  ready.then(() => {
    if (step !== SIDES_LIT || !engine.playing) return;
    let at = engine.nextLoopStart();
    // Skip the very first downbeat, and the one just glowed on (it's still ahead when the glow starts).
    while (at <= Math.max(engine.startedAt, after)) at += engine.duration('ukulele');
    const ms = (at - GLOW_PEAK - engine.ctx.currentTime) * 1000;
    loopGlowTimer = setTimeout(() => {
      if (step !== SIDES_LIT) return; // tapped (or stepped away) in the meantime
      glowCharacter();
      glowOnLoops(at);
    }, Math.max(0, ms));
  }, () => {}); // no audio: no glow
}

// Eased per keyframe (not over the whole glow), so the peak is exactly 30% in: see GLOW_PEAK.
function glowCharacter() {
  characterAura.animate([
    { opacity: 0, easing: 'ease-in-out' },
    { opacity: 1, offset: 0.3, easing: 'ease-in-out' },
    { opacity: 0 },
  ], { duration: 900 });
}

// The hint for right now, if there is one. While the character is still rising, the sun's hint
// isn't due yet, but it's on its way, so keep checking.
function idleHint() {
  if (step < SIDES_LIT) return wobblePlants;
  if (step === SUN_NEXT) return document.body.classList.contains('is-playing') ? zoomSun : () => {};
  return null;
}

function scheduleWobble(delay) {
  clearTimeout(idleTimer);
  if (reducedMotion.matches || !idleHint()) return;
  idleTimer = setTimeout(() => {
    const hint = idleHint(); // the tap that scheduled this may have moved the scene on
    if (!hint) return;
    hint();
    scheduleWobble(WOBBLE_EVERY);
  }, delay);
}

['pointerdown', 'keydown', 'input'].forEach((type) =>
  document.addEventListener(type, () => scheduleWobble(IDLE_DELAY), true));
// The first wobble waits a full idle delay after the left plant has come in and finished sliding
// (and so does the first one with both plants, see STEPS).
const SLIDE_IN = 1400; // ms, the plants' slide-in (see .layer-slide in style.css)
scheduleWobble(FIRST_PLANT_DELAY + SLIDE_IN + IDLE_DELAY);
// -----------------------------------------------------------------------------

// Audio can only be unlocked inside a user gesture, so any tap does it. iOS doesn't send a click
// for a tap on something that isn't clickable (empty space), so the end of the touch counts too.
['touchend', 'pointerup', 'click'].forEach((type) =>
  document.addEventListener(type, () => engine.unlock(), { passive: true }));

// A tap only moves the scene on when it lands on the current step's object.
document.addEventListener('click', (e) => {
  const tap = STEPS[step]?.tap;
  if (typeof tap === 'string' && e.target.closest?.(tap)) forward(); // a function `tap` handles its own
});
document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // holding a key down shouldn't race through the steps
  if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey && !e.altKey) { // M toggles mute (but not Cmd+M etc.)
    muteButton.click();
    return;
  }
  if (e.code === 'KeyD' && !e.metaKey && !e.ctrlKey && !e.altKey) { // D shows/hides the colliders
    document.body.classList.toggle('debug');
    return;
  }
  if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey && !e.altKey) { // H hints at what to tap
    hint();
    return;
  }
  if (controls.contains(e.target)) return; // arrows/Space/Enter belong to the slider or button when focused
  if (['Space', 'Enter', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    forward();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    back();
  }
});
