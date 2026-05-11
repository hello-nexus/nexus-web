import type { Build, CatalogData, ComponentCategory } from '../types/builder';

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

/**
 * Decode a build string back into a Build, looking up components from the catalog.
 * Returns null if the string is invalid.
 */
export function decodeBuild(encoded: string, catalog: CatalogData): Build | null {
  try {
    const json = atob(encoded);
    const data: Partial<Record<ComponentCategory, string[]>> = JSON.parse(json);

    const slots = {} as Build['slots'];
    const allCategories: ComponentCategory[] = [
      'cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'cooler', 'case', 'monitor',
    ];

    for (const cat of allCategories) {
      const keys = data[cat];
      if (keys && keys.length > 0) {
        const catComponents = catalog.components[cat] ?? [];
        slots[cat] = keys.map(key => {
          const found = catComponents.find(c => c.normalizedKey === key) ?? null;
          return { selection: found, selectedRetailer: null };
        });
      } else {
        slots[cat] = [{ selection: null, selectedRetailer: null }];
      }
    }

    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      name: 'Shared Build',
      slots,
      ownedSlots: [],
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}
