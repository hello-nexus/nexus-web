// Unit coverage for the host-side WebAudio sampler: clock anchoring and
// dropping a late clock voice, the stop() filters, the per-instance voice
// and buffer caps, unavailable-document no-ops, and dispose() cleanup.
// jsdom has no WebAudio, so every test installs a minimal fake AudioContext.

import { describe, it, expect, afterEach, vi } from 'vitest';

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn((v: number) => { this.value = v; });
  linearRampToValueAtTime = vi.fn((v: number) => { this.value = v; });
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeStereoPannerNode extends FakeNode {
  pan = new FakeAudioParam();
}

// Chrome refuses a convolver buffer whose sample rate differs from the
// context's own; enforcing that here is what makes the resample-and-cache
// test below meaningful (an unresampled assignment throws, same as Chrome).
class FakeConvolverNode extends FakeNode {
  private _buffer: FakeAudioBuffer | null = null;
  constructor(private ctx: FakeAudioContext) { super(); }
  get buffer() { return this._buffer; }
  set buffer(b: FakeAudioBuffer | null) {
    if (b && b.sampleRate !== this.ctx.sampleRate) {
      throw new Error(`NotSupportedError: The buffer sample rate of ${b.sampleRate} does not match the context rate of ${this.ctx.sampleRate} Hz`);
    }
    this._buffer = b;
  }
}

// Chrome throws InvalidStateError from stop() on a source that never started;
// enforcing that here is what makes the start-before-stop test below meaningful.
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeAudioParam();
  private endedHandler: (() => void) | null = null;
  private started = false;
  start = vi.fn(() => { this.started = true; });
  stop = vi.fn(() => {
    if (!this.started) throw new Error('InvalidStateError: cannot call stop without calling start first');
  });
  addEventListener(event: string, cb: () => void) { if (event === 'ended') this.endedHandler = cb; }
  fireEnded() { this.endedHandler?.(); }
}

class FakeAudioBuffer {
  channels: Float32Array[] = [];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    for (let i = 0; i < numberOfChannels; i += 1) this.channels.push(new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  copyToChannel(source: Float32Array, channel: number) { this.channels[channel].set(source); }
  getChannelData(channel: number) { return this.channels[channel]; }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new FakeNode();
  sources: FakeBufferSource[] = [];
  convolvers: FakeConvolverNode[] = [];
  gains: FakeGainNode[] = [];
  createGain() {
    const g = new FakeGainNode();
    this.gains.push(g);
    return g;
  }
  createStereoPanner() { return new FakeStereoPannerNode(); }
  createConvolver() {
    const c = new FakeConvolverNode(this);
    this.convolvers.push(c);
    return c;
  }
  createBuffer = vi.fn((numberOfChannels: number, length: number, sampleRate: number) => {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  });
  createBufferSource() {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
}

let fakeCtx: FakeAudioContext;

async function freshEngineModule() {
  vi.resetModules();
  fakeCtx = new FakeAudioContext();
  vi.stubGlobal('AudioContext', vi.fn().mockImplementation(function AudioContextCtor() { return fakeCtx; }));
  return import('../audioEngine');
}

function monoChannels(length: number, value = 0.5): Float32Array[] {
  return [new Float32Array(length).fill(value)];
}

describe('AudioInstanceEngine', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports WebAudio support based on window.AudioContext', async () => {
    const { isWebAudioSupported } = await freshEngineModule();
    expect(isWebAudioSupported()).toBe(true);
  });

  it('resumes the shared context on pointerup/touchend/click, not just pointerdown/keydown', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('kick', monoChannels(100), 44100); // wires the autoplay listeners
    for (const type of ['pointerup', 'touchend', 'click']) {
      fakeCtx.state = 'suspended';
      fakeCtx.resume.mockClear();
      document.dispatchEvent(new Event(type));
      expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
    }
  });

  it('ignores a load with an out-of-range sample rate, too many channels, or mismatched channel lengths', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    expect(() => {
      engine.load('bad-rate', monoChannels(100), 1);
      engine.load('too-many-channels', Array.from({ length: 33 }, () => new Float32Array(10)), 44100);
      engine.load('mismatched', [new Float32Array(10), new Float32Array(5)], 44100);
    }).not.toThrow();
    engine.play('bad-rate');
    engine.play('too-many-channels');
    engine.play('mismatched');
    expect(fakeCtx.sources).toHaveLength(0);
  });

  it('steals the oldest sounding voice before a still-queued one', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('loop', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
    engine.clock('bar', 0); // anchor = 0
    engine.play('loop', { clock: 'bar', at: 5 }); // still queued far in the future
    const queuedSource = fakeCtx.sources[fakeCtx.sources.length - 1];
    fakeCtx.currentTime = 1;
    for (let i = 1; i < 64; i += 1) engine.play('loop'); // fills the cap, all sounding at currentTime=1
    const oldestSoundingSource = fakeCtx.sources[1];
    fakeCtx.currentTime = 2; // the queued voice (startAt=5) is still in the future
    engine.play('loop'); // one over the cap: must steal a sounding voice, not the queued one
    expect(queuedSource.stop).not.toHaveBeenCalled();
    expect(oldestSoundingSource.stop).toHaveBeenCalled();
  });

  it('is a safe no-op set when this document has no WebAudio support', async () => {
    vi.resetModules();
    vi.stubGlobal('AudioContext', undefined);
    const { AudioInstanceEngine, isWebAudioSupported } = await import('../audioEngine');
    expect(isWebAudioSupported()).toBe(false);
    const engine = new AudioInstanceEngine();
    expect(() => {
      engine.load('kick', monoChannels(100), 44100);
      engine.play('kick');
      engine.clock('beat');
      engine.stop();
      engine.reverb('kick', 0.5);
      engine.volume(0.5);
      engine.dispose();
    }).not.toThrow();
  });

  it('schedules a clocked voice at anchor + at', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('kick', monoChannels(100), 44100);
    fakeCtx.currentTime = 10;
    engine.clock('beat', 0.2); // anchor = 10.2
    engine.play('kick', { clock: 'beat', at: 0.5 });
    const source = fakeCtx.sources[fakeCtx.sources.length - 1];
    expect(source.start).toHaveBeenCalledWith(10.7);
  });

  it('drops a clocked voice whose scheduled start has already slipped into the past', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('kick', monoChannels(100), 44100);
    engine.clock('beat', 0); // anchor = 0
    fakeCtx.currentTime = 5; // way past anchor + at
    const before = fakeCtx.sources.length;
    engine.play('kick', { clock: 'beat', at: 0.1 });
    expect(fakeCtx.sources.length).toBe(before);
  });

  it('plays immediately (never drops) when no clock is given', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('kick', monoChannels(100), 44100);
    fakeCtx.currentTime = 5;
    engine.play('kick');
    const source = fakeCtx.sources[fakeCtx.sources.length - 1];
    expect(source.start).toHaveBeenCalledWith(5);
  });

  it('starts a voice before scheduling its stop', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('kick', monoChannels(100), 44100);
    expect(() => engine.play('kick', { dur: 0.05 })).not.toThrow();
    const source = fakeCtx.sources[fakeCtx.sources.length - 1];
    expect(source.start).toHaveBeenCalled();
    expect(source.stop).toHaveBeenCalled();
    expect(source.start.mock.invocationCallOrder[0]).toBeLessThan(source.stop.mock.invocationCallOrder[0]);
  });

  it('stops a not-yet-started clocked voice at now with no gain ramp', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    // Looping with no `dur` never schedules its own release ramp, isolating
    // this assertion to whatever fadeAndStop does on its own.
    engine.load('kick', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
    engine.clock('bar', 0); // anchor = currentTime (0)
    engine.play('kick', { clock: 'bar', at: 1.5 }); // scheduled 1.5s ahead
    const source = fakeCtx.sources[fakeCtx.sources.length - 1];
    const voiceGain = fakeCtx.gains[fakeCtx.gains.length - 1];
    fakeCtx.currentTime = 0.2; // still well before the voice's scheduled start
    engine.stop({ clock: 'bar', fade: 0.05 });
    expect(source.stop).toHaveBeenCalledWith(0.2);
    expect(voiceGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it('holds full gain for dur, then fades over release AFTER dur (not overlapping it)', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('kick', monoChannels(100), 44100);
    fakeCtx.currentTime = 2;
    engine.play('kick', { dur: 0.5, release: 0.2, gain: 0.8 });
    const source = fakeCtx.sources[fakeCtx.sources.length - 1];
    const voiceGain = fakeCtx.gains[fakeCtx.gains.length - 1];
    // holdEnd = startAt(2) + dur(0.5); fadeEnd = holdEnd + release(0.2).
    expect(voiceGain.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 2.5);
    expect(voiceGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2.7);
    expect(source.stop).toHaveBeenCalledWith(2.7);
  });

  it('resamples a reverb impulse to the context sample rate and caches it per id', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('room', monoChannels(1000, 0.2), 32000); // context runs at fakeCtx.sampleRate (44100)
    expect(() => engine.reverb('room', 0.5)).not.toThrow();
    const convolver = fakeCtx.convolvers[fakeCtx.convolvers.length - 1];
    expect((convolver.buffer as { sampleRate: number }).sampleRate).toBe(fakeCtx.sampleRate);
    const createBufferCalls = fakeCtx.createBuffer.mock.calls.length;
    engine.reverb('room', 0.8);
    expect(fakeCtx.createBuffer.mock.calls.length).toBe(createBufferCalls);
  });

  it('keeps one solo clock sounding across instances, and hands it back on a fresh solo()', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const a = new AudioInstanceEngine();
    const b = new AudioInstanceEngine();
    for (const e of [a, b]) {
      e.load('snd', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
      e.clock('music');
      e.solo('music');
    }
    // b took the solo from a: a's playing voice fades and its new plays are dropped.
    const before = fakeCtx.sources.length;
    a.play('snd', { clock: 'music' });
    expect(fakeCtx.sources.length).toBe(before);
    b.play('snd', { clock: 'music' });
    const bVoice = fakeCtx.sources[fakeCtx.sources.length - 1];
    expect(fakeCtx.sources.length).toBe(before + 1);

    a.solo('music');
    expect(bVoice.stop).toHaveBeenCalled();
    a.play('snd', { clock: 'music' });
    expect(fakeCtx.sources.length).toBe(before + 2);
    b.play('snd', { clock: 'music' });
    expect(fakeCtx.sources.length).toBe(before + 2);
    // Clocks never marked solo, and unclocked sounds, are unaffected.
    b.clock('fx');
    b.play('snd', { clock: 'fx' });
    b.play('snd');
    expect(fakeCtx.sources.length).toBe(before + 4);
  });

  it('hands the solo back to the claim before it when its holder is parked or disposed', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const tile = new AudioInstanceEngine();
    const full = new AudioInstanceEngine();
    for (const e of [tile, full]) {
      e.load('snd', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
      e.clock('music');
      e.solo('music');
    }
    const count = () => fakeCtx.sources.length;
    let n = count();
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n);

    full.park();
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n + 1);
    // Parked, it plays and claims nothing until a mount shows it again.
    full.play('snd');
    full.solo('music');
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n + 2);

    full.unpark();
    full.solo('music');
    n = count();
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n);
    full.dispose();
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n + 1);
  });

  it('gives a parked instance its solo back on unpark, or queues it under a claim made meanwhile', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const tile = new AudioInstanceEngine();
    const other = new AudioInstanceEngine();
    for (const e of [other, tile]) {
      e.load('snd', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
      e.clock('music');
      e.solo('music');
    }
    const count = () => fakeCtx.sources.length;
    tile.park();
    tile.unpark();
    let n = count();
    tile.play('snd', { clock: 'music' });
    other.play('snd', { clock: 'music' });
    expect(count()).toBe(n + 1);

    // Parked while the other claims: it comes back under that claim, and gets the solo when the other goes.
    tile.park();
    other.solo('music');
    tile.unpark();
    n = count();
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n);
    other.dispose();
    tile.play('snd', { clock: 'music' });
    expect(count()).toBe(n + 1);
  });

  it('ignores a solo on a clock never started, and moves an instance\'s own solo to its newer clock', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const e = new AudioInstanceEngine();
    e.load('snd', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
    e.solo('nowhere');
    e.play('snd', { clock: 'nowhere' });
    expect(fakeCtx.sources).toHaveLength(1);

    e.clock('a');
    e.solo('a');
    e.clock('b');
    e.solo('b');
    const n = fakeCtx.sources.length;
    e.play('snd', { clock: 'a' });
    e.play('snd', { clock: 'b' });
    expect(fakeCtx.sources.length).toBe(n + 1);
  });

  it('stop() filters by tag and by clock independently', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    // Looping with no `dur` never schedules its own stop(), so any stop()
    // call below can only come from the explicit engine.stop() filter.
    engine.load('snd', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
    engine.play('snd', { tag: 'a' });
    engine.play('snd', { tag: 'b' });
    const [voiceA, voiceB] = fakeCtx.sources;
    engine.stop({ tag: 'a' });
    expect(voiceA.stop).toHaveBeenCalled();
    expect(voiceB.stop).not.toHaveBeenCalled();
  });

  it('caps concurrent voices per instance, stealing the oldest with a short fade', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('loop', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
    engine.play('loop');
    const oldestSource = fakeCtx.sources[fakeCtx.sources.length - 1];
    const oldestGain = fakeCtx.gains[fakeCtx.gains.length - 1];
    fakeCtx.currentTime = 1; // the oldest voice is now audibly sounding, not still queued
    // One more play than the cap steals this first voice; the cap allows the
    // reef song's observed ~47-voice peak plus headroom.
    for (let i = 1; i < 65; i += 1) engine.play('loop');
    const newestSource = fakeCtx.sources[fakeCtx.sources.length - 1];
    expect(oldestSource.stop).toHaveBeenCalled();
    expect(oldestGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(newestSource.stop).not.toHaveBeenCalled();
  });

  it('caps total loaded PCM bytes per instance and ignores an id over the cap', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    const bigLength = 15 * 1024 * 1024 / 4; // 15 MB as float32 samples
    engine.load('a', monoChannels(bigLength), 44100);
    engine.load('b', monoChannels(bigLength), 44100); // would push total past the cap
    engine.play('a');
    engine.play('b');
    expect(fakeCtx.sources).toHaveLength(1);
  });

  it('ignores an id over the max length', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('x'.repeat(65), monoChannels(100), 44100);
    engine.play('x'.repeat(65));
    expect(fakeCtx.sources).toHaveLength(0);
  });

  it('ignores playback of an unknown id silently', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    expect(() => engine.play('never-loaded')).not.toThrow();
    expect(fakeCtx.sources).toHaveLength(0);
  });

  it('dispose() stops every active voice and disconnects the instance graph', async () => {
    const { AudioInstanceEngine } = await freshEngineModule();
    const engine = new AudioInstanceEngine();
    engine.load('loop', monoChannels(100), 44100, { start: 0, end: 100 / 44100 });
    engine.play('loop');
    engine.play('loop');
    const [v1, v2] = fakeCtx.sources;
    engine.dispose();
    expect(v1.stop).toHaveBeenCalled();
    expect(v2.stop).toHaveBeenCalled();
    // Further calls after dispose are no-ops, not errors.
    expect(() => engine.play('loop')).not.toThrow();
  });
});
