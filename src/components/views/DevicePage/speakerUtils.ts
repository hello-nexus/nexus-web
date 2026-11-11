import type { SpeakerEqPreset } from '../../../api/logitechSpeaker';

/** A band's frequency written out: "48Hz", "500Hz", "1KHz", "16KHz". */
export function hzLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}KHz` : `${hz}Hz`;
}

/** A gain written out with its sign: "+6dB", "-20dB", "0dB". */
export function dbLabel(v: number): string {
  return `${signedDb(v)}dB`;
}

/** A band's gain with its sign: "+3", "-4.5", "0". */
export function signedDb(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
}

const PRESET_NAME_KEYS: Readonly<Record<string, string>> = {
  'Acoustic': 'acoustic',
  'Bass Boost': 'bassBoost',
  'Bass Reducer': 'bassReducer',
  'Cinematic': 'cinematic',
  'Classical': 'classical',
  'Communications': 'communications',
  'Dance': 'dance',
  'Deep': 'deep',
  'Electronic': 'electronic',
  'First Person Shooter (FPS)': 'fps',
  'Flat': 'flat',
  'Hip-Hop': 'hipHop',
  'Jazz': 'jazz',
  'Latin': 'latin',
  'Loudness': 'loudness',
  'Lounge': 'lounge',
  'Multiplayer Online Battle Arena (MOBA)': 'moba',
  'Piano': 'piano',
  'Pop': 'pop',
  'R&B': 'rnb',
  'Rock': 'rock',
  'Small Speakers': 'smallSpeakers',
  'Spoken Word': 'spokenWord',
  'Treble Booster': 'trebleBooster',
  'Treble Reducer': 'trebleReducer',
  'Vocal Booster': 'vocalBooster',
};

/** The locale key for a built-in preset's name, or undefined for a name the service added that this build does not know. The wire value stays the English name. */
export function builtInPresetLabelKey(name: string): string | undefined {
  return Object.hasOwn(PRESET_NAME_KEYS, name) ? `devices.logitechSpeaker.presetName.${PRESET_NAME_KEYS[name]}` : undefined;
}

/** A channel's VOL as G HUB shows it: its linear gain times ten. */
export function volOf(gain: number | undefined): number {
  return Math.round((typeof gain === 'number' && Number.isFinite(gain) ? gain : 1) * 10);
}

/** The highest VOL a channel takes. */
export function volMax(channelMaxGain: number | undefined): number {
  return Math.round((typeof channelMaxGain === 'number' && channelMaxGain > 0 ? channelMaxGain : 2) * 10);
}

const RING = 0.8;
const ring = (degrees: number) => ({
  x: Math.round(Math.sin((degrees * Math.PI) / 180) * RING * 1000) / 1000,
  y: Math.round(-Math.cos((degrees * Math.PI) / 180) * RING * 1000) / 1000,
});

/** Where each speaker sits around the listener, evenly on a ring from the front clockwise; y runs front (-1) to back (1). The subwoofer is not positional and sits below the ring. */
export const SPEAKER_POS: Readonly<Record<string, { x: number; y: number }>> = {
  center: ring(0),
  frontRight: ring(45),
  sideRight: ring(90),
  rearRight: ring(135),
  rearLeft: ring(225),
  sideLeft: ring(270),
  frontLeft: ring(315),
  subwoofer: { x: 0, y: 1.2 },
};

/** Which way each speaker's icon faces, in degrees, 0 being sound going right, so it points at the listener. */
export const SPEAKER_FACING: Readonly<Record<string, number>> = {
  frontLeft: 45, center: 90, frontRight: 135, sideLeft: 0, sideRight: 180, rearLeft: -45, rearRight: -135,
};

/** Clockwise from the front left: the order "Test all" plays them in. */
const TEST_ORDER = ['frontLeft', 'center', 'frontRight', 'sideRight', 'rearRight', 'rearLeft', 'sideLeft', 'subwoofer'] as const;

/** The channel numbers a speaker has, in test order. */
export function testOrder(channels: readonly string[]): number[] {
  return TEST_ORDER.map(key => channels.indexOf(key)).filter(i => i >= 0);
}

/** The preset the live bands came from, if the service names one. */
export function currentPreset(presets: readonly SpeakerEqPreset[], name: string | undefined): SpeakerEqPreset | undefined {
  return name === undefined ? undefined : presets.find(p => p.name === name);
}

export const isFlat = (bands: readonly number[]) => bands.every(b => b === 0);
