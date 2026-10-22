import { useEffect, useMemo, useState } from 'react';
import { getDeckInstances, getDeckPreset, getDeckPresets } from '../../../api/deck';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import type { HotkeyBinding } from '../../../api/hotkeys';
import type { DeckConfig } from './types';

interface Fetched {
  names: Record<string, string>;
  configs: Record<string, DeckConfig>;
  /** Instance id (`streamdeck:<serial>` or `widget:<id>`) with the preset it shows. */
  instances: { id: string; presetId: string }[];
}

const DEVICE_PREFIX = 'streamdeck:';
const WIDGET_PREFIX = 'widget:';

const EMPTY: Fetched = { names: {}, configs: {}, instances: [] };

export interface HotkeyDeckInfo {
  presetNames: Record<string, string>;
  /** Authored config per preset the bindings point at; only when `configs` was asked for. */
  configs: Record<string, DeckConfig>;
  /** The connected device currently showing each preset, the target of an editor jump. */
  serialByPreset: Record<string, string>;
  /** Every deck showing each preset: device serials and how many Deck widgets. */
  holders: Record<string, { serials: string[]; widgets: number }>;
}

/**
 * What a deck binding row needs to describe itself: preset names, the preset
 * configs (to find where a tag sits), and which connected deck shows which
 * preset. Re-reads on every deck topic frame, so a rename, an edit or an
 * active-preset change shows up. Everything derived from the deck list is
 * computed in render, so an emptied deck list needs no effect.
 */
export function useHotkeyDeckInfo(
  enabled: boolean,
  bindings: readonly HotkeyBinding[],
  options: { configs: boolean; deckSerials: readonly string[] },
): HotkeyDeckInfo {
  const [fetched, setFetched] = useState<Fetched>(EMPTY);
  const [tick, setTick] = useState(0);
  useTopicCallback('deck', enabled, () => setTick(n => n + 1));

  const presetKey = useMemo(
    () => [...new Set(bindings.flatMap(b => (b.target.kind === 'deck' ? [b.target.presetId] : [])))].sort().join(','),
    [bindings],
  );
  const serialKey = options.deckSerials.join(',');
  const wantConfigs = options.configs;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const ids = presetKey ? presetKey.split(',') : [];
      const [list, configs, instances] = await Promise.all([
        getDeckPresets(),
        wantConfigs ? Promise.all(ids.map(async id => [id, (await getDeckPreset(id))?.deck] as const)) : Promise.resolve([]),
        getDeckInstances(),
      ]);
      if (cancelled) return;
      setFetched({
        names: Object.fromEntries(list.map(p => [p.id, p.name])),
        configs: Object.fromEntries(configs.filter((c): c is readonly [string, DeckConfig] => !!c[1])),
        instances: Object.entries(instances).map(([id, inst]) => ({ id, presetId: inst.activePresetId })),
      });
    })();
    return () => { cancelled = true; };
  }, [enabled, presetKey, wantConfigs, tick]);

  const serialByPreset = useMemo(() => {
    const present = new Set(serialKey ? serialKey.split(',') : []);
    const map: Record<string, string> = {};
    for (const i of fetched.instances) {
      const serial = i.id.startsWith(DEVICE_PREFIX) ? i.id.slice(DEVICE_PREFIX.length) : '';
      if (serial && present.has(serial)) map[i.presetId] = serial;
    }
    return map;
  }, [fetched.instances, serialKey]);

  const holders = useMemo(() => {
    const map: Record<string, { serials: string[]; widgets: number }> = {};
    for (const i of fetched.instances) {
      const entry = (map[i.presetId] ??= { serials: [], widgets: 0 });
      if (i.id.startsWith(DEVICE_PREFIX)) entry.serials.push(i.id.slice(DEVICE_PREFIX.length));
      else if (i.id.startsWith(WIDGET_PREFIX)) entry.widgets += 1;
    }
    return map;
  }, [fetched.instances]);

  return { presetNames: fetched.names, configs: fetched.configs, serialByPreset, holders };
}
