// Host-side WebAudio sampler backing the SDK's useAudio(). One AudioContext
// per document, lazily created on the first load/play from any instance;
// each SDK widget instance gets its own gain + reverb-send bus + voice pool.
// Workers have no AudioContext, so an app synthesizes PCM in its worker and
// this module is the only place that ever touches WebAudio.

import type { AudioPlay } from '../../sdk/runtime/context';

const RATE_RANGE: [number, number] = [0.1, 4];
const GAIN_RANGE: [number, number] = [0, 4];
const PAN_RANGE: [number, number] = [-1, 1];
const SEND_RANGE: [number, number] = [0, 1];
const WET_RANGE: [number, number] = [0, 1];
const AT_RANGE: [number, number] = [0, 3600];
const DUR_RANGE: [number, number] = [0, 3600];
const RELEASE_RANGE: [number, number] = [0, 10];
const LEAD_RANGE: [number, number] = [0, 5];
const FADE_RANGE: [number, number] = [0, 30];
const VOLUME_RANGE: [number, number] = [0, 4];

const DEFAULT_RELEASE_SECONDS = 0.008;
const DEFAULT_LEAD_SECONDS = 0.1;
const DEFAULT_STOP_FADE_SECONDS = 0.03;
// A voice on a named clock is dropped rather than played late once its
// scheduled start has slipped this far into the past; music sent ahead in
// batches must not audibly bunch up on a slow tick.
const CLOCK_TOLERANCE_SECONDS = 0.02;

const MAX_ID_LENGTH = 64;
const MAX_TOKEN_LENGTH = 64;
// Headroom over the reef song's peak concurrent-voice count with sends on
// top of the melodic/percussive layers.
const MAX_VOICES_PER_INSTANCE = 64;
const MAX_BYTES_PER_INSTANCE = 20 * 1024 * 1024;
const STEAL_FADE_SECONDS = 0.005;
const MAX_CLOCKS_PER_INSTANCE = 16;
// Fade for the solo clock another instance just took over.
const SOLO_FADE_SECONDS = 1;
// An impulse response longer than this is truncated before resampling; a
// reverb tail has no audible use past a few seconds and an unbounded one
// is an easy way to force a heavy resample.
const REVERB_MAX_IMPULSE_SECONDS = 8;
// Ceiling on load()/play() calls per instance per second - a spamming
// worker creates WebAudio nodes on the main thread, so this is a flood
// guard, not a musical constraint.
const MAX_OPS_PER_SECOND = 200;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 192000;
const MAX_CHANNELS = 32;

function clamp(value: number, range: [number, number], fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(range[1], Math.max(range[0], n));
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;
}

function isOverLength(v: string | undefined, maxLen: number): boolean {
  return typeof v === 'string' && v.length > maxLen;
}

// A ConvolverNode only accepts an impulse response at the context's own
// sample rate; apps load PCM at their own rate, so the reverb bus resamples
// on the way in rather than rejecting a mismatched rate. `maxSourceSeconds`
// truncates an oversize impulse before the resample, not after.
function resampleForContext(ctx: AudioContext, source: AudioBuffer, maxSourceSeconds: number): AudioBuffer {
  const maxFrames = Math.max(1, Math.round(maxSourceSeconds * source.sampleRate));
  const sourceLength = Math.min(source.length, maxFrames);
  if (source.sampleRate === ctx.sampleRate && sourceLength === source.length) return source;
  const ratio = ctx.sampleRate / source.sampleRate;
  const length = Math.max(1, Math.round(sourceLength * ratio));
  const resampled = ctx.createBuffer(source.numberOfChannels, length, ctx.sampleRate);
  for (let c = 0; c < source.numberOfChannels; c += 1) {
    const input = source.getChannelData(c);
    const output = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const pos = i / ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, sourceLength - 1);
      const frac = pos - i0;
      output[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    resampled.copyToChannel(output as Float32Array<ArrayBuffer>, c);
  }
  return resampled;
}

function webAudioSupported(): boolean {
  return typeof window !== 'undefined'
    && (typeof window.AudioContext === 'function' || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === 'function');
}

let sharedCtx: AudioContext | null = null;
let autoplayWired = false;
let liveInstances = 0;
// Solo claims, oldest first: the last one is the page's one sounding solo
// clock, and releasing it hands the solo back to the claim below.
const soloClaims: Array<{ engine: AudioInstanceEngine; clock: string }> = [];
const soloHolder = () => soloClaims[soloClaims.length - 1] ?? null;

function resumeSharedCtx(): void {
  if (sharedCtx && sharedCtx.state !== 'running' && sharedCtx.state !== 'closed') {
    void sharedCtx.resume().catch(() => { /* not user-gestured yet */ });
  }
}

// A touch tap's user-activation grant completes on release, not on
// pointerdown - listening only for pointerdown left the Y70's first tap
// silent. pointerup/touchend/click cover release across pointer types;
// keydown covers keyboard-driven surfaces.
const AUTOPLAY_UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

function wireAutoplay(): void {
  if (autoplayWired || typeof document === 'undefined') return;
  autoplayWired = true;
  for (const type of AUTOPLAY_UNLOCK_EVENTS) document.addEventListener(type, resumeSharedCtx, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!sharedCtx || sharedCtx.state === 'closed') return;
    if (document.hidden) void sharedCtx.suspend().catch(() => {});
    else resumeSharedCtx();
  });
}

function getSharedCtx(): AudioContext | null {
  if (!webAudioSupported()) return null;
  if (!sharedCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor();
    wireAutoplay();
  }
  return sharedCtx;
}

interface LoadedBuffer {
  buffer: AudioBuffer;
  bytes: number;
  loop?: { start: number; end: number };
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startAt: number;
  tag?: string;
  clock?: string;
}

/** One SDK widget instance's sampler surface: a master gain, a reverb send
 *  bus, and the buffers/voices that instance owns. */
export class AudioInstanceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private buffers = new Map<string, LoadedBuffer>();
  private bytesLoaded = 0;
  // Resampled-to-context-rate impulse responses, keyed by id, so reverb()
  // only pays the resample cost once per id even across repeated room swaps.
  // Counted into bytesLoaded alongside the loaded PCM.
  private reverbCache = new Map<string, { buffer: AudioBuffer; bytes: number }>();
  private voices: Voice[] = [];
  private clocks = new Map<string, number>();
  private soloClocks = new Set<string>();
  private disposed = false;
  // Set while no mount shows this instance: it plays and claims nothing.
  private parked = false;
  // The solo claim a park set aside, and the claim that sat below it, so an unpark can put it back.
  private shelved: { clock: string; below: { engine: AudioInstanceEngine; clock: string } | null } | null = null;
  private opWindowStart = 0;
  private opCount = 0;

  private ensureCtx(): AudioContext | null {
    if (this.disposed) return null;
    const ctx = getSharedCtx();
    if (!ctx) return null;
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.convolver = ctx.createConvolver();
      this.reverbReturn = ctx.createGain();
      this.reverbReturn.gain.value = 0;
      this.convolver.connect(this.reverbReturn);
      this.reverbReturn.connect(this.master);
      liveInstances += 1;
    }
    resumeSharedCtx();
    return ctx;
  }

  // A malformed or hostile payload must never throw here: this runs behind a
  // cross-thread bridge, and a synchronous throw comes back as an unhandled
  // promise rejection in the worker rather than a caught error.
  load(id: string, channels: Float32Array[], sampleRate: number, loop?: { start: number; end: number }): void {
    try {
      if (!this.consumeOpBudget()) return;
      const ctx = this.ensureCtx();
      if (!ctx || !isValidId(id)) return;
      if (!Array.isArray(channels) || channels.length === 0 || channels.length > MAX_CHANNELS) return;
      if (!Number.isFinite(sampleRate) || sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) return;
      const length = channels[0]?.length ?? 0;
      if (length <= 0) return;
      for (const ch of channels) {
        if (!(ch instanceof Float32Array) || ch.length !== length) return;
      }
      const bytes = length * channels.length * Float32Array.BYTES_PER_ELEMENT;
      const existing = this.buffers.get(id);
      const existingReverb = this.reverbCache.get(id);
      const nextTotal = this.bytesLoaded - (existing?.bytes ?? 0) - (existingReverb?.bytes ?? 0) + bytes;
      if (nextTotal > MAX_BYTES_PER_INSTANCE) return;
      const buffer = ctx.createBuffer(channels.length, length, sampleRate);
      for (let c = 0; c < channels.length; c += 1) buffer.copyToChannel(channels[c] as Float32Array<ArrayBuffer>, c);
      this.bytesLoaded = nextTotal;
      this.reverbCache.delete(id);
      this.buffers.set(id, {
        buffer,
        bytes,
        loop: loop && Number.isFinite(loop.start) && Number.isFinite(loop.end) && loop.end > loop.start
          ? { start: Math.max(0, loop.start), end: loop.end }
          : undefined,
      });
    } catch { /* malformed payload - ignore rather than propagate */ }
  }

  clock(name: string, lead?: number): void {
    const ctx = this.ensureCtx();
    if (!ctx || typeof name !== 'string' || !name || name.length > MAX_TOKEN_LENGTH) return;
    if (!this.clocks.has(name) && this.clocks.size >= MAX_CLOCKS_PER_INSTANCE) return;
    this.clocks.set(name, ctx.currentTime + clamp(lead ?? DEFAULT_LEAD_SECONDS, LEAD_RANGE, DEFAULT_LEAD_SECONDS));
  }

  /** Makes this instance's clock the page's one solo clock. Another instance's
   *  solo clock fades out, and plays on any solo clock that no longer holds it
   *  are dropped until its instance calls solo() for it again. */
  solo(name: string): void {
    if (this.disposed || this.parked || !this.consumeOpBudget()) return;
    if (typeof name !== 'string' || !this.clocks.has(name)) return;
    this.soloClocks.add(name);
    const prev = soloHolder();
    this.releaseSolo();
    soloClaims.push({ engine: this, clock: name });
    // An instance's own earlier clock is left to whatever fade it gave it.
    if (prev && prev.engine !== this) prev.engine.stop({ clock: prev.clock, fade: SOLO_FADE_SECONDS });
  }

  /** No mount shows this instance any more: its voices stop and its solo passes back to the claim before it. */
  park(): void {
    if (this.parked) return;
    this.parked = true;
    const at = soloClaims.findIndex((c) => c.engine === this);
    this.shelved = at >= 0 ? { clock: soloClaims[at].clock, below: soloClaims[at - 1] ?? null } : null;
    this.releaseSolo();
    this.stop();
  }

  /** A mount shows this instance again: its solo claim comes back, on top when nothing claimed in between, else under the newer one. */
  unpark(): void {
    if (!this.parked) return;
    this.parked = false;
    const shelved = this.shelved;
    this.shelved = null;
    if (!shelved || this.disposed || soloClaims.some((c) => c.engine === this)) return;
    const claim = { engine: this, clock: shelved.clock };
    if (soloHolder() === shelved.below) soloClaims.push(claim);
    else soloClaims.splice(Math.max(0, soloClaims.length - 1), 0, claim);
  }

  private releaseSolo(): void {
    for (let i = soloClaims.length - 1; i >= 0; i -= 1) if (soloClaims[i].engine === this) soloClaims.splice(i, 1);
  }

  play(id: string, opts?: AudioPlay): void {
    if (!this.consumeOpBudget()) return;
    if (isOverLength(opts?.clock, MAX_TOKEN_LENGTH) || isOverLength(opts?.tag, MAX_TOKEN_LENGTH)) return;
    if (this.parked) return;
    const holder = soloHolder();
    if (opts?.clock && this.soloClocks.has(opts.clock) && !(holder?.engine === this && holder.clock === opts.clock)) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || !this.convolver) return;
    const entry = this.buffers.get(id);
    if (!entry) return;

    let startAt: number;
    if (opts?.clock) {
      const anchor = this.clocks.get(opts.clock) ?? ctx.currentTime;
      startAt = anchor + clamp(opts.at ?? 0, AT_RANGE, 0);
      if (startAt < ctx.currentTime - CLOCK_TOLERANCE_SECONDS) return;
      startAt = Math.max(startAt, ctx.currentTime);
    } else {
      startAt = Math.max(ctx.currentTime, ctx.currentTime + clamp(opts?.at ?? 0, AT_RANGE, 0));
    }

    const rate = clamp(opts?.rate ?? 1, RATE_RANGE, 1);
    const gainLevel = clamp(opts?.gain ?? 1, GAIN_RANGE, 1);
    const pan = clamp(opts?.pan ?? 0, PAN_RANGE, 0);
    const send = clamp(opts?.send ?? 0, SEND_RANGE, 0);
    const looping = !!entry.loop;
    const dur = opts?.dur != null ? clamp(opts.dur, DUR_RANGE, entry.buffer.duration) : (looping ? undefined : entry.buffer.duration);
    const release = clamp(opts?.release ?? DEFAULT_RELEASE_SECONDS, RELEASE_RANGE, DEFAULT_RELEASE_SECONDS);

    const source = ctx.createBufferSource();
    source.buffer = entry.buffer;
    source.playbackRate.value = rate;
    if (looping) {
      source.loop = true;
      source.loopStart = entry.loop!.start;
      source.loopEnd = entry.loop!.end;
    }

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = gainLevel;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(this.master);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      panner.connect(sendGain);
      sendGain.connect(this.convolver);
    }

    const voice: Voice = { source, gain: voiceGain, startAt, tag: opts?.tag, clock: opts?.clock };
    this.addVoice(voice);
    source.addEventListener('ended', () => this.removeVoice(voice));

    source.start(startAt);
    if (dur != null) {
      // dur holds the voice at full gain; release fades it out AFTER that,
      // so the audible note length is dur + release, not dur.
      const holdEnd = startAt + dur;
      const fadeEnd = holdEnd + release;
      voiceGain.gain.setValueAtTime(gainLevel, holdEnd);
      voiceGain.gain.linearRampToValueAtTime(0, fadeEnd);
      source.stop(fadeEnd);
    }
  }

  stop(opts?: { tag?: string; clock?: string; fade?: number }): void {
    if (!this.ctx) return;
    const fade = clamp(opts?.fade ?? DEFAULT_STOP_FADE_SECONDS, FADE_RANGE, DEFAULT_STOP_FADE_SECONDS);
    const targets = this.voices.filter((v) => {
      if (opts?.tag != null && v.tag !== opts.tag) return false;
      if (opts?.clock != null && v.clock !== opts.clock) return false;
      return true;
    });
    for (const voice of targets) this.fadeAndStop(voice, fade);
  }

  private fadeAndStop(voice: Voice, fade: number): void {
    const ctx = this.ctx;
    if (!ctx) { try { voice.source.stop(); } catch { /* already stopped */ } return; }
    const now = ctx.currentTime;
    // A voice scheduled on a clock ahead of now has not started sounding -
    // stopping it before its scheduled start is valid once start() has been
    // called, and skipping the ramp keeps it silent instead of fading in
    // from wherever the ramp catches it.
    if (voice.startAt >= now) {
      try { voice.source.stop(now); } catch { /* already scheduled to stop */ }
      return;
    }
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    try { voice.source.stop(now + fade); } catch { /* already scheduled to stop */ }
  }

  reverb(id: string | null, wet?: number): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.convolver || !this.reverbReturn) return;
    if (id === null) {
      this.convolver.buffer = null;
      this.reverbReturn.gain.value = 0;
      return;
    }
    const entry = this.buffers.get(id);
    if (!entry) return;
    let cached = this.reverbCache.get(id);
    if (!cached) {
      const impulse = resampleForContext(ctx, entry.buffer, REVERB_MAX_IMPULSE_SECONDS);
      const bytes = impulse.length * impulse.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
      if (this.bytesLoaded + bytes > MAX_BYTES_PER_INSTANCE) return;
      cached = { buffer: impulse, bytes };
      this.reverbCache.set(id, cached);
      this.bytesLoaded += bytes;
    }
    this.convolver.buffer = cached.buffer;
    this.reverbReturn.gain.value = clamp(wet ?? 1, WET_RANGE, 1);
  }

  volume(level: number, fade?: number): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    const target = clamp(level, VOLUME_RANGE, 1);
    const fadeSeconds = clamp(fade ?? 0, FADE_RANGE, 0);
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    if (fadeSeconds <= 0) {
      this.master.gain.setValueAtTime(target, now);
    } else {
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(target, now + fadeSeconds);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseSolo();
    this.stop();
    for (const voice of this.voices) { try { voice.source.stop(); } catch { /* already stopped */ } }
    this.voices = [];
    this.buffers.clear();
    this.reverbCache.clear();
    this.bytesLoaded = 0;
    try { this.master?.disconnect(); } catch { /* already disconnected */ }
    try { this.convolver?.disconnect(); } catch { /* already disconnected */ }
    try { this.reverbReturn?.disconnect(); } catch { /* already disconnected */ }
    if (this.ctx) {
      liveInstances = Math.max(0, liveInstances - 1);
      if (liveInstances === 0 && sharedCtx && sharedCtx.state === 'running') void sharedCtx.suspend().catch(() => {});
    }
  }

  private addVoice(voice: Voice): void {
    if (this.voices.length >= MAX_VOICES_PER_INSTANCE) {
      // The oldest already-sounding voice is the least noticeable to cut;
      // only steal a still-queued one when nothing is sounding yet.
      const now = this.ctx?.currentTime ?? 0;
      const soundingIndex = this.voices.findIndex((v) => v.startAt < now);
      const at = soundingIndex >= 0 ? soundingIndex : 0;
      const [stolen] = this.voices.splice(at, 1);
      if (stolen) this.fadeAndStop(stolen, STEAL_FADE_SECONDS);
    }
    this.voices.push(voice);
  }

  private removeVoice(voice: Voice): void {
    const at = this.voices.indexOf(voice);
    if (at >= 0) this.voices.splice(at, 1);
  }

  private consumeOpBudget(): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.opWindowStart >= 1000) { this.opWindowStart = now; this.opCount = 0; }
    this.opCount += 1;
    return this.opCount <= MAX_OPS_PER_SECOND;
  }
}

/** True when this document can ever play SDK audio: WebAudio is supported
 *  here. Does not account for the manifest capability, preview, or a
 *  streamed/headless panel render - callers gate those separately. */
export function isWebAudioSupported(): boolean {
  return webAudioSupported();
}
