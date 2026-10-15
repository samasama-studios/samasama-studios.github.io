// Page wiring: loads the loops into the engine and connects them to the page.
// Flow (the whole screen is the control):
//   1st tap → the character starts levitating and the ukulele starts
//   2nd tap → bass + sun + aura on
//   every tap after that → bass + sun + aura toggle off/on

const engine = new LoopEngine();

const TRACKS = {
  ukulele: { url: 'assets/sounds/ukulele.wav', active: true },
  bass: { url: 'assets/sounds/bass.wav', active: false },
};

// Illustration layers shown only while their track is on.
const TRACK_VISUALS = {
  bass: document.querySelectorAll('.layer-sun, .layer-aura'),
};

// Fetch + decode everything up front so the music starts instantly on the first tap.
const ready = Promise.all(
  Object.entries(TRACKS).map(([name, { url, active }]) => engine.load(name, url, { active }))
);
ready.catch((err) => {
  // Most likely cause: the page was opened as a file:// URL, where fetch() is blocked.
  console.error('Audio failed to load. Serve the folder over http (e.g. VS Code Live Server).', err);
});

// Turn a track on/off along with its visuals. A body class (e.g. .ukulele-off)
// lets the CSS react too — .ukulele-off brings the character to rest.
function setTrack(track, active) {
  engine.setActive(track, active);
  TRACK_VISUALS[track]?.forEach((el) => el.classList.toggle('is-visible', active));
  document.body.classList.toggle(`${track}-off`, !active);
}

let started = false;

function onTap() {
  if (!started) {
    // The first tap is the user gesture that unlocks audio, so everything starts from here.
    started = true;
    engine.unlock(); // must happen synchronously inside the gesture
    document.body.classList.add('is-playing'); // starts the levitation (see style.css)
    ready.then(() => engine.start(), () => {}); // if the tap came very early, start once loaded
    return;
  }
  setTrack('bass', !engine.isActive('bass'));
}

document.addEventListener('click', onTap);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    onTap();
  }
});
