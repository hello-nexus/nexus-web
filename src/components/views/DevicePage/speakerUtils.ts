import type { SpeakerEqPreset } from '../../../api/logitechSpeaker';
import type { ChannelPos } from '../../common/ChannelLayout/channelLayoutUtils';

/** A band's frequency as G HUB labels it: "48", "500", "1K", "16K". */
export function hzLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}K` : `${hz}`;
}

/** A band's gain with its sign: "+3", "-4.5", "0". */
export function signedDb(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
}

/** A channel's VOL as G HUB shows it: its linear gain times ten. */
export function volOf(gain: number | undefined): number {
  return Math.round((typeof gain === 'number' && Number.isFinite(gain) ? gain : 1) * 10);
}

/** The highest VOL a channel takes. */
export function volMax(channelMaxGain: number | undefined): number {
  return Math.round((typeof channelMaxGain === 'number' && channelMaxGain > 0 ? channelMaxGain : 2) * 10);
}

/** Where each speaker sits around the listener, as G HUB draws them; y runs front (-1) to back (1). */
export const SPEAKER_POS: Readonly<Record<string, ChannelPos>> = {
  subwoofer: { x: -0.9, y: -0.9 },
  center: { x: 0, y: -0.85 },
  frontLeft: { x: -0.5, y: -0.4 },
  frontRight: { x: 0.5, y: -0.4 },
  sideLeft: { x: -0.85, y: 0.1 },
  sideRight: { x: 0.85, y: 0.1 },
  rearLeft: { x: -0.5, y: 0.55 },
  rearRight: { x: 0.5, y: 0.55 },
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

/** Whether another preset, built-ins included, already has this name, ignoring case and surrounding spaces. */
export function presetNameTaken(presets: readonly SpeakerEqPreset[], name: string, except?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return presets.some(p => p.name !== except && p.name.trim().toLowerCase() === wanted);
}

export const isFlat = (bands: readonly number[]) => bands.every(b => b === 0);
