// LoopEngine: plays several equal-length loops in sample-accurate sync using the Web Audio API.
//
// Signal chain:  source → track gain ┐
//                source → track gain ┼→ master gain → limiter → speakers
//
// Every loop keeps running while playback is on; "muting" a track only fades its gain,
// so a track that comes back is always still in sync with the others.
class LoopEngine {
  constructor({ fadeTime = 0.04 } = {}) {
    // Created now (suspended) so files can be decoded on page load; resumed on the first user gesture.
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.fadeTime = fadeTime; // seconds; 30–50 ms avoids clicks
    this.tracks = new Map();  // name → { buffer, gain, source, active }
    this.playing = false;

    this.master = this.ctx.createGain();

    // Gentle limiter: the loops stack, so catch peaks without audibly squashing them.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; // dB
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master.connect(this.limiter).connect(this.ctx.destination);
  }

  // Fetch and decode a file into an AudioBuffer, and give it its own gain node.
  async load(name, url, { active = true } = {}) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());

    const gain = this.ctx.createGain();
    gain.gain.value = active ? 1 : 0;
    gain.connect(this.master);

    this.tracks.set(name, { buffer, gain, source: null, active });
  }

  // Must be called from a user gesture (click/tap/key) before sound can play.
  unlock() {
    if (this.ctx.state !== 'running') return this.ctx.resume();
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
    this.playing = false;
  }

  // Bring a track in or out with a short fade. Works whether or not playback is running.
  setActive(name, active) {
    const track = this.tracks.get(name);
    if (!track) return;
    track.active = active;
    this.ramp(track.gain.gain, active ? 1 : 0);
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
