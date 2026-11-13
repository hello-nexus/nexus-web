import type { LightingDevice } from '../../../../api/lighting';
import type { LightingMode } from '../../../../types/lighting';

/**
 * A card whose colors are written to the keyboard's own memory can only keep a
 * still frame, so an animated look would never settle enough to be saved.
 */
export function savesColorsToDevice(device: Pick<LightingDevice, 'saveToDeviceSupported' | 'savedToDevice'>): boolean {
  return device.saveToDeviceSupported === true && device.savedToDevice === true;
}

/** The selected cards that keep their colors on the device. */
export function savedColorsCards(devices: readonly LightingDevice[], selectedIds: ReadonlySet<string>): LightingDevice[] {
  return devices.filter(d => selectedIds.has(d.id) && savesColorsToDevice(d));
}

/** True when any selected card keeps its colors on the device, which limits the picker to static looks. */
export function selectionSavesColors(devices: readonly LightingDevice[], selectedIds: ReadonlySet<string>): boolean {
  if (selectedIds.size === 0) return false;
  return savedColorsCards(devices, selectedIds).length > 0;
}

/** Modes that cannot hold a still frame; Static is the only one a saved-colors card can show. */
export function modeBlockedBySavedColors(mode: LightingMode): boolean {
  return mode === 'animate' || mode === 'screen' || mode === 'gif';
}
