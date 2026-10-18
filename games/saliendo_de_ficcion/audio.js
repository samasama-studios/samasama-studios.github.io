// LoopEngine: plays several equal-length loops in sample-accurate sync using the Web Audio API.
//
// Signal chain:  source → track gain ┐
//                source → track gain ┼→ master gain → volume → limiter → speakers
//
// The master gain is for start/stop fades; the volume is the listener's (slider / mute).
//
// Every loop keeps running while playback is on; "muting" a track only fades its gain,
// so a track that comes back is always still in sync with the others.
//
// Clips (loaded with { loop: false }) don't run with the loops; they start when asked, once or
// looping, e.g. an ending phrase scheduled exactly on the next loop boundary (see nextLoopStart /
// playClip), or a new loop that starts from its first note right on a tap.
// iPhone, iPod, or iPad (which reports itself as a Mac, but with touch).
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class LoopEngine {
  constructor({ fadeTime = 0.04 } = {}) {
    // Created now (suspended) so files can be decoded on page load; resumed on the first user gesture.
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.fadeTime = fadeTime; // seconds; 30–50 ms avoids clicks
    this.tracks = new Map();   // loops:     name → { buffer, gain, source, active, level }
    this.clips = new Map();    // clips:     name → { buffer, gain, source, startedAt, loop }
    this.playing = false;
    this.startedAt = 0;        // audio-clock time the loops started, for finding loop boundaries

    this.master = this.ctx.createGain();

    // Gentle limiter: the loops stack, so catch peaks without audibly squashing them.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; // dB
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.volume = this.ctx.createGain();

    this.master.connect(this.volume).connect(this.limiter).connect(this.ctx.destination);

    // iOS mutes Web Audio when the phone's ring/silent switch is on silent, unless the page says
    // it's playing media. Safari 16.4+ lets it say so directly; older iOS needs an <audio> element
    // playing (silently) alongside, which unlock() starts.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  }

  // Listener volume, 0–1 as a gain (callers decide the curve). Faded so moving the slider doesn't click.
  setVolume(value) {
    this.ramp(this.volume.gain, value);
  }

  // Fetch and decode a file into an AudioBuffer, and give it its own gain node.
  // loop: false makes it a clip, which start() leaves alone; play it with playClip().
  // level is a loop's gain while it's on (1 = as recorded), for balancing loops against each other.
  async load(name, url, { active = true, loop = true, level = 1 } = {}) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());

    const gain = this.ctx.createGain();
    gain.connect(this.master);

    if (loop) {
      gain.gain.value = active ? level : 0;
      this.tracks.set(name, { buffer, gain, source: null, active, level });
    } else {
      this.clips.set(name, { buffer, gain, source: null });
    }
  }

  // Must be called from a user gesture (click/tap/key) before sound can play.
  unlock() {
    if (IOS && !navigator.audioSession && !this.silence) {
      this.silence = new Audio(silentWav());
      this.silence.loop = true;
      this.silence.play().catch(() => { this.silence = null; }); // try again on the next gesture
    }
    if (this.ctx.state !== 'running') return this.ctx.resume(); // also 'interrupted' (iOS, after a call)
    return Promise.resolve();
  }

  // Start every loaded loop at the exact same moment on the audio clock.
  start() {
    if (this.playing) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const when = now + 0.1; // small lead time so all sources are scheduled before they begin

    // Undo any fade-out left over from stop().
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(1, now);

    for (const track of this.tracks.values()) {
      const source = this.ctx.createBufferSource();
      source.buffer = track.buffer;
      source.loop = true; // gapless, sample-accurate looping
      source.connect(track.gain);
      source.start(when);
      track.source = source;
    }
    this.startedAt = when;
    this.playing = true;
  }

  // Fade everything out, then stop the sources (an AudioBufferSourceNode can't be restarted,
  // so start() creates fresh ones).
  stop() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.ramp(this.master.gain, 0);

    for (const track of this.tracks.values()) {
      track.source.stop(now + this.fadeTime);
      track.source = null;
    }
    for (const name of this.clips.keys()) this.stopClip(name);
    this.playing = false;
  }

  // Audio-clock time at which the loops next wrap around (null when not playing).
  // A boundary closer than 50 ms is skipped, so there's always time to schedule against it.
  nextLoopStart() {
    if (!this.playing) return null;
    const length = this.tracks.values().next().value.buffer.duration; // all loops share one length
    const passes = Math.max(0, Math.ceil((this.ctx.currentTime + 0.05 - this.startedAt) / length));
    return this.startedAt + passes * length;
  }

  // Play a clip from its start at audio-clock time `when` (default: right now), once or looping.
  playClip(name, when = this.ctx.currentTime, { loop = false } = {}) {
    const shot = this.clips.get(name);
    if (!shot) return;
    this.stopClip(name);
    const now = this.ctx.currentTime;
    shot.gain.gain.cancelScheduledValues(now);
    shot.gain.gain.setValueAtTime(1, now);

    const source = this.ctx.createBufferSource();
    source.buffer = shot.buffer;
    source.loop = loop;
    source.connect(shot.gain);
    source.onended = () => { if (shot.source === source) shot.source = null; };
    source.start(when);
    shot.source = source;
    shot.startedAt = when;
    shot.loop = loop;
  }

  // Stop a clip with a short fade (or cancel it if it hasn't started yet).
  stopClip(name) {
    const shot = this.clips.get(name);
    if (!shot?.source) return;
    this.ramp(shot.gain.gain, 0);
    shot.source.stop(this.ctx.currentTime + this.fadeTime);
    shot.source = null;
  }

  // Bring a track in or out with a short fade. Works whether or not playback is running.
  setActive(name, active) {
    const track = this.tracks.get(name);
    if (!track) return;
    track.active = active;
    this.ramp(track.gain.gain, active ? track.level : 0);
  }

  // Like setActive, but the change lands at audio-clock time `when` (its fade ends exactly then).
  setActiveAt(name, active, when) {
    this.fadeAt(name, active, when - this.fadeTime, this.fadeTime);
  }

  // Fade a loop in or out over `duration` seconds, starting at audio-clock time `start`.
  fadeAt(name, active, start, duration) {
    const track = this.tracks.get(name);
    if (!track) return;
    track.active = active;
    const param = track.gain.gain;
    const now = this.ctx.currentTime;
    start = Math.max(now, start);
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setValueAtTime(param.value, start);
    param.linearRampToValueAtTime(active ? track.level : 0, start + duration);
  }

  // How far through the current pass of the loops playback is, 0–1 (0 when not playing).
  loopProgress() {
    if (!this.playing) return 0;
    const length = this.tracks.values().next().value.buffer.duration;
    const t = this.ctx.currentTime - this.startedAt;
    return t < 0 ? 0 : (t % length) / length;
  }

  // How far through a playing clip (or its current pass, if looping) playback is, 0–1;
  // null when the clip isn't playing or hasn't started yet.
  clipProgress(name) {
    const shot = this.clips.get(name);
    if (!shot?.source) return null;
    const length = shot.buffer.duration;
    const t = this.ctx.currentTime - shot.startedAt;
    if (t < 0) return null;
    return shot.loop ? (t % length) / length : Math.min(1, t / length);
  }

  // Bring a loop back in now, then fade it out over `fadeDuration` seconds from audio-clock time
  // `fadeStart`. If that fade should already be under way, it rejoins it at the level it would
  // have reached by now, so this can restore a fade-out that was interrupted.
  activeUntil(name, fadeStart, fadeDuration) {
    const track = this.tracks.get(name);
    if (!track) return;
    track.active = false; // where it ends up
    const param = track.gain.gain;
    const now = this.ctx.currentTime;
    const fadeEnd = fadeStart + fadeDuration;
    if (fadeEnd <= now) return this.setActive(name, false);

    const rejoinAt = Math.min(now + this.fadeTime, fadeEnd);
    const levelAt = (t) => track.level * Math.min(1, Math.max(0, (fadeEnd - t) / fadeDuration));
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(levelAt(rejoinAt), rejoinAt);
    if (fadeStart > rejoinAt) param.setValueAtTime(track.level, fadeStart);
    param.linearRampToValueAtTime(0, fadeEnd);
  }

  // Audio-clock time a clip starts (or started), while it's scheduled or playing; otherwise null.
  clipStart(name) {
    const shot = this.clips.get(name);
    return shot?.source ? shot.startedAt : null;
  }

  // Length of a loaded loop or clip, in seconds.
  duration(name) {
    return (this.tracks.get(name) ?? this.clips.get(name))?.buffer.duration ?? 0;
  }

  toggle(name) {
    const active = !this.isActive(name);
    this.setActive(name, active);
    return active;
  }

  isActive(name) {
    return Boolean(this.tracks.get(name)?.active);
  }

  // Linear fade from the current value to `target` over fadeTime.
  ramp(param, target) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + this.fadeTime);
  }
}

// A short silent WAV (0.1 s, mono, 8 kHz, 16-bit) as a blob URL, for the <audio> element that
// keeps older iOS playing Web Audio with the silent switch on (see the constructor).
function silentWav() {
  const samples = 800;
  const view = new DataView(new ArrayBuffer(44 + samples * 2)); // header, then silence (zeros)
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); view.setUint32(24, 8000, true); // mono, 8 kHz
  view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); // 16-bit
  text(36, 'data'); view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}
