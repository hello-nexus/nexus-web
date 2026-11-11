import { deleteService, fetchService, postService } from './service';

/** One EQ preset: G HUB's own, Flat, or the user's. */
export interface SpeakerEqPreset {
  name: string;
  /** dB per band, 48 Hz to 16 kHz. */
  bands: number[];
  builtIn: boolean;
}

export type SpeakerRoom = 'gaming' | 'movie';

/** A Logitech speaker's acoustics and surround sound, as G HUB shows them. */
export interface SpeakerState {
  present: boolean;
  simulated: boolean;
  name?: string;
  model?: string;
  /** System volume of the speaker's output, 0 to 1. */
  volume?: number;
  /** 0 to 100; absent when the speaker did not answer. */
  subwooferLevel?: number;
  eqEnabled: boolean;
  bands: number[];
  bandHz: number[];
  bandMinDb: number;
  bandMaxDb: number;
  /** Present only while the live bands still equal that preset. */
  preset?: string;
  /** Built-in presets first, then the user's. */
  presets: SpeakerEqPreset[];
  surroundEnabled: boolean;
  room: SpeakerRoom;
  /** Wire order; an index is the channel number the routes take. */
  channels: string[];
  /** Linear per channel, 1 = unchanged. */
  channelGains: number[];
  channelMaxGain: number;
}

const BASE = '/devices/logitech-speaker';

export const fetchSpeaker = (signal?: AbortSignal) => fetchService<SpeakerState>(BASE, signal);

// Every change answers with the state after it, or null when the speaker did not take it.
export const setSpeakerEq = (patch: { enabled?: boolean; bands?: number[]; preset?: string }) =>
  postService<SpeakerState>(`${BASE}/eq`, patch);

export const setSpeakerSurround = (patch: { enabled?: boolean; room?: SpeakerRoom }) =>
  postService<SpeakerState>(`${BASE}/surround`, patch);

export const setSpeakerChannel = (channel: number, gain: number) =>
  postService<SpeakerState>(`${BASE}/channel`, { channel, gain });

/** Puts every channel back to a gain of 1. */
export const resetSpeakerChannels = () => postService<SpeakerState>(`${BASE}/channel`, {});

/** System volume, 0 to 1. */
export const setSpeakerVolume = (level: number) => postService<SpeakerState>(`${BASE}/volume`, { level });

/** Subwoofer level, 0 to 100. */
export const setSpeakerSubwoofer = (level: number) => postService<SpeakerState>(`${BASE}/subwoofer`, { level });

/** Saves a user preset; the same name replaces it. */
export const saveSpeakerPreset = (name: string, bands: number[]) =>
  postService<SpeakerState>(`${BASE}/presets`, { name, bands });

export const deleteSpeakerPreset = (name: string) =>
  deleteService<SpeakerState>(`${BASE}/presets/${encodeURIComponent(name)}`);

/** Plays a short sound from one channel; null when it could not play. */
export const testSpeakerChannel = (channel: number) =>
  postService<{ error: boolean; msg: string }>(`${BASE}/test`, { channel });
