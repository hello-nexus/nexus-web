import type { Build, ComponentCategory } from '../types/builder';

/**
 * Encode build slot selections into a compact URL-safe string.
 * Stores normalizedKeys per category, then base64-encodes.
 */
export function encodeBuild(build: Build): string {
  const data: Partial<Record<ComponentCategory, string[]>> = {};

  for (const [cat, entries] of Object.entries(build.slots)) {
    const keys: string[] = [];
    for (const entry of entries) {
      if (entry.selection) {
        keys.push(entry.selection.normalizedKey);
      }
    }
    if (keys.length > 0) {
      data[cat as ComponentCategory] = keys;
    }
  }

  try {
    return btoa(JSON.stringify(data));
  } catch {
    return '';
  }
}
