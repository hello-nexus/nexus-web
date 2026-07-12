import { Sun, Volume2 } from 'lucide-react';
import { setGlobalBrightness } from '../api/lighting';
import { setSystemVolume } from '../api/system';
import type { CommandContext, SearchEntry } from './types';

// Parameterized actions: a query like "brightness 60" or "vol 25%" becomes a
// one-off entry that applies that value directly, the way the calculator
// turns an expression into a copyable result. English trigger words plus each
// entry's localized label, same cross-language policy as entry keywords.

// Unicode letter class, so localized labels ("Helligkeit", "Głośność",
// "音量") trigger the same as the English words.
const VALUE_QUERY = /^(\p{L}[\p{L} .-]*?)\s+(\d{1,3})\s*%?$/u;

const BRIGHTNESS_WORDS = ['brightness', 'bright', 'dim'];
const VOLUME_WORDS = ['volume', 'vol', 'sound', 'loudness'];

// A typed word triggers a target when it prefixes any trigger word and is
// long enough to be distinctive ("bri 40" works, "b 40" stays a non-match).
const MIN_TRIGGER_CHARS = 3;
function matches(typed: string, words: string[]): boolean {
  if (typed.length < MIN_TRIGGER_CHARS) return false;
  return words.some((w) => w.startsWith(typed));
}

/** Entries for a value-setting query, [] when the query isn't one. */
export function buildParamEntries(query: string, ctx: CommandContext): SearchEntry[] {
  const m = VALUE_QUERY.exec(query.trim());
  if (!m) return [];
  const typed = m[1].trim().toLowerCase();
  const value = Math.min(100, Math.max(0, Number(m[2])));
  const out: SearchEntry[] = [];

  const brightnessLabel = ctx.t('lighting.devices.brightness');
  if (ctx.online && matches(typed, [...BRIGHTNESS_WORDS, brightnessLabel.toLowerCase()])) {
    out.push({
      id: 'param:brightness',
      kind: 'action',
      title: `${brightnessLabel} · ${value}%`,
      subtitle: ctx.t('lighting.title'),
      icon: <Sun size={18} />,
      run: () => { void setGlobalBrightness(value / 100).catch(() => {}); },
    });
  }

  const volumeLabel = ctx.t('search.volume.label');
  if (ctx.live.volume?.supported && matches(typed, [...VOLUME_WORDS, volumeLabel.toLowerCase()])) {
    out.push({
      id: 'param:volume',
      kind: 'action',
      title: `${volumeLabel} · ${value}%`,
      icon: <Volume2 size={18} />,
      run: () => { void setSystemVolume(value / 100).catch(() => {}); },
    });
  }

  return out;
}
