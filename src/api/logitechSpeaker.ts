import { deleteService, fetchService, postService } from './service';

/** One EQ preset: the G560's own from G HUB, Flat, or the user's own. */
export interface SpeakerEqPreset {
  name: string;
  /** dB per band, 48 Hz to 16 kHz. */
  bands: number[];
  builtIn: boolean;
}

/** A Logitech speaker's acoustics, as G HUB's Acoustics and Surround sound pages show them. */
export interface SpeakerState {
  /** The speaker's output carries Logitech's speaker effect. */
  present: boolean;
  name?: string | null;
  model?: string | null;
  /** System volume of the speaker's output, 0-1. */
  volume?: number | null;
  /** 0-100; null when the speaker did not answer. */
  subwooferLevel?: number | null;
  eqEnabled: boolean;
  /** dB per band. */
  bands: number[];
  bandHz: number[];
  bandMinDb: number;
  bandMaxDb: number;
  /** The preset the bands came from; null once a band was moved by hand. */
  preset?: string | null;
  presets: SpeakerEqPreset[];
  surroundEnabled: boolean;
  room: 'gaming' | 'movie' | string;
  /** frontLeft, frontRight, center, subwoofer, rearLeft, rearRight, sideLeft, sideRight. */
  channels: string[];
  /** Linear per channel, 1 = unchanged. */
  channelGains: number[];
  channelMaxGain: number;
}

const BASE = '/devices/logitech-speaker';

export const getSpeaker = () => fetchService<SpeakerState>(BASE);

// Each change answers with the state after it, or null when the speaker did not take it.
export const setSpeakerEq = (patch: { enabled?: boolean; bands?: number[]; preset?: string }) =>
  postService<SpeakerState>(`${BASE}/eq`, patch);

export const setSpeakerSurround = (patch: { enabled?: boolean; room?: string }) =>
  postService<SpeakerState>(`${BASE}/surround`, patch);

/** One channel's gain (linear); without a channel every channel goes back to 1. */
export const setSpeakerChannel = (channel: number | undefined, gain = 1) =>
  postService<SpeakerState>(`${BASE}/channel`, channel === undefined ? {} : { channel, gain });

/** System volume, 0-1. */
export const setSpeakerVolume = (level: number) => postService<SpeakerState>(`${BASE}/volume`, { level });

/** Subwoofer level, 0-100. */
export const setSpeakerSubwoofer = (level: number) => postService<SpeakerState>(`${BASE}/subwoofer`, { level });

export const saveSpeakerPreset = (name: string, bands: number[]) =>
  postService<SpeakerState>(`${BASE}/presets`, { name, bands });

export const deleteSpeakerPreset = (name: string) =>
  deleteService<SpeakerState>(`${BASE}/presets/${encodeURIComponent(name)}`);

/** A short sound from one channel; ok is false when it could not play. */
export const testSpeakerChannel = (channel: number) =>
  postService<{ error: boolean }>(`${BASE}/test`, { channel });
