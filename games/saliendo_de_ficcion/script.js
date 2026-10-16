// Page wiring: connects taps to the scene (the whole screen is the control).
// Current flow:
//   on load → the side plants come in (no tap needed); the sun and particles are already there
//   1st tap → the side plants light up and the ukulele starts
//   2nd tap → the character gets its aura and the bass comes in; it slowly rises
//             to the centre, then starts levitating
//   3rd tap → the corner plants come in
//   4th tap → the corner plants light up; at the next loop start the ukulele hands over to its
//             ending phrase (ukulele_intro_end), which plays once while the bass slowly fades out
//   5th tap → the spiral (aura.webp) appears above the head and the ukulele + birds loop starts,
//             taking over from the ukulele and bass loops if they're still playing
//   6th tap → the mushrooms slide up from below
//   7th tap → the mushrooms light up
//   taps after that → nothing yet (see STEPS below)
// ← steps back (each step animates in reverse); → / Space / Enter step forward like a tap; M mutes.
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

// The ukulele + birds loop starts from its first note right on the tap, then keeps looping, and
// the plain ukulele and bass loops stop (they may still be playing if tap 4's ending hasn't
// started yet, and the bass fades through the ending). Going back stops the birds and puts the
// ukulele and bass back on tap 4's plan: the ukulele until the ending starts, the bass fading
// over it (rejoining that fade part-way if the ending is already playing).
let birdsWanted = false;

function startBirds() {
  birdsWanted = true;
  ready.then(() => {
    if (!birdsWanted || !engine.playing) return;
    engine.playClip('ukulele_birds', undefined, { loop: true });
    engine.setActive('ukulele', false);
    engine.setActive('bass', false);
  }, () => {});
}

function stopBirds() {
  birdsWanted = false;
  engine.stopClip('ukulele_birds');
  const endingAt = engine.clipStart('ukulele_intro_end');
  if (endingAt === null) return; // the ending is over (or never queued): nothing to restore
  engine.activeUntil('ukulele', endingAt - engine.fadeTime, engine.fadeTime);
  engine.activeUntil('bass', endingAt, engine.duration('ukulele_intro_end') - BASS_ENDS_EARLY);
}

// The character gets its aura (and the bass comes in) as it starts rising out of the grass, and
// starts levitating once it arrives. Going back reverses it: the bass drops out, the aura fades and
// the character sinks back down.
const aura = document.querySelectorAll('.layer-particular-aura');
const riser = document.querySelector('.riser');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

riser.addEventListener('transitionend', (e) => {
  if (e.target !== riser) return; // ignore transitions bubbling up from inside the character
  if (riser.classList.contains('is-risen')) document.body.classList.add('is-playing'); // starts the levitation
});

function rise() {
  reveal(aura);
  engine.setActive('bass', true);
  riser.classList.add('is-risen');
  if (reducedMotion.matches) document.body.classList.add('is-playing'); // no transition, so no transitionend
}

function sink() {
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

// The side plants come in as soon as the page loads.
reveal(document.querySelectorAll('.plants-sides'));

// The scene's steps, in order. Tap / → / Space / Enter goes forward, ← goes back.
const STEPS = [
  {                                       // 1: side plants light up, ukulele starts
    forward: () => { layers('.plants-sides .layer-light').forward(); startMusic(); },
    back: () => { layers('.plants-sides .layer-light').back(); stopMusic(); },
  },
  { forward: rise, back: sink },          // 2: aura + bass, character rises, levitates
  layers('.plants-corner'),               // 3: corner plants come in
  {                                       // 4: corner plants light up, ukulele ending phrase
    forward: () => { layers('.plants-corner .layer-light').forward(); endUkulele(); },
    back: () => { layers('.plants-corner .layer-light').back(); resumeUkulele(); },
  },
  {                                       // 5: the spiral appears above the head, ukulele + birds
    forward: () => { layers('.layer-aura').forward(); startBirds(); },
    back: () => { layers('.layer-aura').back(); stopBirds(); },
  },
  layers('.layer-shrooms'),               // 6: mushrooms slide up from below
  layers('.layer-shrooms .layer-light'),  // 7: mushrooms light up
];

let step = 0; // how many steps are currently done

function forward() {
  // Audio can only be unlocked inside a user gesture, so do it on every one (cheap once running).
  engine.unlock();
  if (step >= STEPS.length) return;
  STEPS[step].forward();
  step++;
  updateLevel();

  // On hold:
  // setTrack('bass', !engine.isActive('bass'));
}

function back() {
  if (step === 0) return;
  step--;
  STEPS[step].back();
  updateLevel();
}

// --- Progress bars -----------------------------------------------------------
// Level: how many of the scene's steps are done. Loop: where the music is in its loop (the
// ukulele + birds loop once it's playing, since it runs on its own timing; otherwise the synced
// loops, whose loop starts are when tap 4's ending lands). Both scale a fill with scaleX.
const levelBar = document.querySelector('.bar-level');
const levelFill = levelBar.querySelector('span');
const loopFill = document.querySelector('.bar-loop span');
levelBar.setAttribute('aria-valuemax', STEPS.length);

function updateLevel() {
  levelFill.style.transform = `scaleX(${step / STEPS.length})`;
  levelBar.setAttribute('aria-valuenow', step);
}

function updateLoop() {
  const progress = engine.clipProgress('ukulele_birds') ?? engine.loopProgress();
  loopFill.style.transform = `scaleX(${progress})`;
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

document.addEventListener('click', forward);
document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // holding a key down shouldn't race through the steps
  if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey && !e.altKey) { // M toggles mute (but not Cmd+M etc.)
    muteButton.click();
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
