// useReducer-based build state management.
// Persists to localStorage key `qos_builder_current` on every change.
// Restores from localStorage on mount.

import { useReducer, useEffect, useMemo } from 'react';
import type {
  Build, BuildSlotEntry, ComponentCategory, ComponentOption,
  CompatibilityIssue, WattageEstimate,
} from '../types/builder';
import { checkCompatibility } from '../lib/compatibility';
import { estimateWattage } from '../lib/wattage';

const STORAGE_KEY = 'qos_builder_current';

// ── Actions ──────────────────────────────────────────────────────────────────

type BuilderAction =
  | { type: 'SELECT_COMPONENT'; category: ComponentCategory; index: number; component: ComponentOption; retailer?: string }
  | { type: 'REMOVE_COMPONENT'; category: ComponentCategory; index: number }
  | { type: 'ADD_SLOT'; category: ComponentCategory }
  | { type: 'REMOVE_SLOT'; category: ComponentCategory; index: number }
  | { type: 'TOGGLE_OWNED'; category: ComponentCategory }
  | { type: 'LOAD_BUILD'; build: Build }
  | { type: 'LOAD_OWNED_HARDWARE'; detected: Partial<Record<ComponentCategory, ComponentOption[]>> }
  | { type: 'CLEAR' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptySlot(): BuildSlotEntry {
  return { selection: null, selectedRetailer: null };
}

function createEmptyBuild(): Build {
  const slots = {} as Build['slots'];
  const allCats: ComponentCategory[] = [
    'cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'cooler', 'case', 'monitor',
  ];
  for (const cat of allCats) {
    slots[cat] = [emptySlot()];
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'New Build',
    slots,
    ownedSlots: [],
    createdAt: now,
    updatedAt: now,
  };
}

function loadFromStorage(): Build {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Build;
      if (parsed.schemaVersion === 1 && parsed.slots) return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return createEmptyBuild();
}

function saveToStorage(build: Build): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(build));
  } catch { /* quota exceeded — silently ignore */ }
}

// ── Reducer ──────────────────────────────────────────────────────────────────

function builderReducer(state: Build, action: BuilderAction): Build {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SELECT_COMPONENT': {
      const entries = [...(state.slots[action.category] ?? [emptySlot()])];
      entries[action.index] = {
        selection: action.component,
        selectedRetailer: action.retailer ?? null,
      };
      return {
        ...state,
        slots: { ...state.slots, [action.category]: entries },
        updatedAt: now,
      };
    }

    case 'REMOVE_COMPONENT': {
      const entries = [...(state.slots[action.category] ?? [emptySlot()])];
      entries[action.index] = emptySlot();
      return {
        ...state,
        slots: { ...state.slots, [action.category]: entries },
        updatedAt: now,
      };
    }

    case 'ADD_SLOT': {
      const entries = [...(state.slots[action.category] ?? []), emptySlot()];
      return {
        ...state,
        slots: { ...state.slots, [action.category]: entries },
        updatedAt: now,
      };
    }

    case 'REMOVE_SLOT': {
      const entries = [...(state.slots[action.category] ?? [])];
      if (entries.length > 1) {
        entries.splice(action.index, 1);
      }
      return {
        ...state,
        slots: { ...state.slots, [action.category]: entries },
        updatedAt: now,
      };
    }

    case 'TOGGLE_OWNED': {
      const owned = [...state.ownedSlots];
      const idx = owned.indexOf(action.category);
      if (idx >= 0) owned.splice(idx, 1);
      else owned.push(action.category);
      return { ...state, ownedSlots: owned, updatedAt: now };
    }

    case 'LOAD_BUILD':
      return { ...action.build, updatedAt: now };

    case 'LOAD_OWNED_HARDWARE': {
      const base = createEmptyBuild();
      const slots = { ...base.slots };
      const owned: ComponentCategory[] = [];
      for (const [cat, parts] of Object.entries(action.detected) as [ComponentCategory, ComponentOption[]][]) {
        if (!parts || parts.length === 0) continue;
        slots[cat] = parts.map(c => ({ selection: c, selectedRetailer: null }));
        owned.push(cat);
      }
      return {
        ...state,
        slots,
        ownedSlots: owned,
        updatedAt: now,
      };
    }

    case 'CLEAR':
      return createEmptyBuild();

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseBuilderResult {
  build: Build;
  dispatch: React.Dispatch<BuilderAction>;
  issues: CompatibilityIssue[];
  wattage: WattageEstimate;
}

export function useBuilder(): UseBuilderResult {
  const [build, dispatch] = useReducer(builderReducer, null, loadFromStorage);

  // Persist on every change
  useEffect(() => {
    saveToStorage(build);
  }, [build]);

  const issues = useMemo<CompatibilityIssue[]>(() => {
    return checkCompatibility(build);
  }, [build]);

  const wattage = useMemo<WattageEstimate>(() => {
    return estimateWattage(build);
  }, [build]);

  return { build, dispatch, issues, wattage };
}
