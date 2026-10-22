import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { getDeckInstances, getDeckPreset, getDeckPresets, type DeckPresetSummary } from '../../../api/deck';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import type { HotkeyBinding } from '../../../api/hotkeys';
import type { DeckConfig } from './types';

const DEVICE_PREFIX = 'streamdeck:';
const WIDGET_PREFIX = 'widget:';

// One copy for every mounted consumer (each deck hotkey field plus the Hotkeys
// tab), cleared when the last one unmounts. Topic frames patch it in place; a
// refetch happens only for what a frame says changed.
const store = {
  names: {} as Record<string, string>,
  configs: {} as Record<string, DeckConfig>,
  /** Instance id (`streamdeck:<serial>` or `widget:<id>`) with the preset it shows. */
  instances: [] as { id: string; presetId: string }[],
  version: 0,
  users: 0,
  epoch: 0,
  namesInflight: false,
  instancesInflight: false,
  configsPending: new Set<string>(),
};
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function bump(): void {
  store.version += 1;
  listeners.forEach(l => l());
}

function refreshNames(): void {
  if (store.namesInflight) return;
  const epoch = store.epoch;
  store.namesInflight = true;
  void getDeckPresets().then(list => {
    if (epoch !== store.epoch) return;
    store.namesInflight = false;
    store.names = Object.fromEntries(list.map(p => [p.id, p.name]));
    bump();
  });
}

function refreshInstances(): void {
  if (store.instancesInflight) return;
  const epoch = store.epoch;
  store.instancesInflight = true;
  void getDeckInstances().then(map => {
    if (epoch !== store.epoch) return;
    store.instancesInflight = false;
    store.instances = Object.entries(map).map(([id, inst]) => ({ id, presetId: inst.activePresetId }));
    bump();
  });
}

function ensureConfigs(ids: readonly string[]): void {
  const epoch = store.epoch;
  for (const id of ids) {
    if (store.configs[id] || store.configsPending.has(id)) continue;
    store.configsPending.add(id);
    void getDeckPreset(id).then(preset => {
      if (epoch !== store.epoch) return;
      store.configsPending.delete(id);
      if (preset) {
        store.configs = { ...store.configs, [id]: preset.deck };
        bump();
      }
    });
  }
}

interface DeckFrame { kind?: string; presetId?: string; summary?: DeckPresetSummary; deck?: DeckConfig }

function handleDeckFrame(data: unknown): void {
  const frame = data as DeckFrame;
  if (frame.kind === 'presets') {
    refreshNames();
  } else if (frame.kind === 'preset' && frame.presetId) {
    let changed = false;
    if (frame.summary && store.names[frame.presetId] !== frame.summary.name) {
      store.names = { ...store.names, [frame.presetId]: frame.summary.name };
      changed = true;
    }
    if (frame.deck && store.configs[frame.presetId]) {
      store.configs = { ...store.configs, [frame.presetId]: frame.deck };
      changed = true;
    }
    if (changed) bump();
  } else if (frame.kind === 'active') {
    refreshInstances();
  }
}

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
 * preset. Derived values are computed in render, so an emptied deck list needs
 * no effect.
 */
export function useHotkeyDeckInfo(
  enabled: boolean,
  bindings: readonly HotkeyBinding[],
  options: { configs: boolean; deckSerials: readonly string[] },
): HotkeyDeckInfo {
  const version = useSyncExternalStore(subscribe, () => store.version);
  useTopicCallback('deck', enabled, useCallback((data: unknown) => handleDeckFrame(data), []));

  useEffect(() => {
    if (!enabled) return;
    store.users += 1;
    if (store.users === 1) {
      refreshNames();
      refreshInstances();
    }
    return () => {
      store.users -= 1;
      if (store.users === 0) {
        store.epoch += 1;
        Object.assign(store, {
          names: {}, configs: {}, instances: [], namesInflight: false, instancesInflight: false, configsPending: new Set<string>(),
        });
      }
    };
  }, [enabled]);

  const presetKey = useMemo(
    () => [...new Set(bindings.flatMap(b => (b.target.kind === 'deck' ? [b.target.presetId] : [])))].sort().join(','),
    [bindings],
  );
  const wantConfigs = options.configs;
  useEffect(() => {
    if (enabled && wantConfigs && presetKey) ensureConfigs(presetKey.split(','));
  }, [enabled, wantConfigs, presetKey]);

  const serialKey = options.deckSerials.join(',');

  return useMemo(() => {
    const present = new Set(serialKey ? serialKey.split(',') : []);
    const serialByPreset: Record<string, string> = {};
    const holders: Record<string, { serials: string[]; widgets: number }> = {};
    for (const i of store.instances) {
      const entry = (holders[i.presetId] ??= { serials: [], widgets: 0 });
      if (i.id.startsWith(DEVICE_PREFIX)) {
        const serial = i.id.slice(DEVICE_PREFIX.length);
        entry.serials.push(serial);
        if (present.has(serial)) serialByPreset[i.presetId] = serial;
      } else if (i.id.startsWith(WIDGET_PREFIX)) {
        entry.widgets += 1;
      }
    }
    return {
      presetNames: store.names,
      configs: wantConfigs ? store.configs : {},
      serialByPreset,
      holders,
    };
    // version is the store's change counter; the derived maps are read from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, serialKey, wantConfigs]);
}
