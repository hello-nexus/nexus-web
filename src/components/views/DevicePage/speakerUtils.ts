// Pure helpers for the Logitech speaker (G560) page.

/** A band's frequency as G HUB labels it: "48", "500", "1K", "16K". */
export function hzLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}K` : `${hz}`;
}

/** A band's gain with its sign: "+3", "-4.5", "0". */
export function signedDb(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
}

/** A typed number: "+3", "-4,5", "2 dB" and a typographic minus all read as numbers; anything else is null. */
export function parseNumber(text: string): number | null {
  const cleaned = String(text ?? '').replace(/−/g, '-').replace(',', '.').replace(/[^0-9.+-]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** A typed gain kept within the speaker's range, to 0.1 dB; null when it was not a number. */
export function typedDb(text: string, min: number, max: number): number | null {
  const v = parseNumber(text);
  return v === null ? null : Math.round(Math.min(max, Math.max(min, v)) * 10) / 10;
}

/** A dragged gain on the slider's 0.5 dB steps, within the speaker's range. */
export function snapDb(v: number, min: number, max: number, step = 0.5): number {
  const snapped = Math.round(v / step) * step;
  return Math.min(max, Math.max(min, Math.round(snapped * 10) / 10));
}

/** A channel's VOL as G HUB shows it: its gain times ten (10 = unchanged). */
export function volOf(gain: number | undefined): number {
  return Math.round((typeof gain === 'number' && Number.isFinite(gain) ? gain : 1) * 10);
}

/** The highest VOL a channel takes. */
export function volMax(channelMaxGain: number | undefined): number {
  return Math.round((typeof channelMaxGain === 'number' && channelMaxGain > 0 ? channelMaxGain : 2) * 10);
}

/** Which way each speaker's icon faces (degrees, 0 = sound going right), toward the listener. */
export const SPEAKER_FACING: Readonly<Record<string, number>> = {
  frontLeft: 45, center: 90, frontRight: 135, sideLeft: 0, sideRight: 180, rearLeft: -45, rearRight: -135,
};

/** Clockwise from the front left, the order "Test all speakers" plays them in. */
export const TEST_ORDER = ['frontLeft', 'center', 'frontRight', 'sideRight', 'rearRight', 'rearLeft', 'sideLeft', 'subwoofer'] as const;

/** The channels a speaker has, in test order. */
export function testOrder(channels: readonly string[]): number[] {
  return TEST_ORDER.map(key => channels.indexOf(key)).filter(i => i >= 0);
}
