import { describe, expect, it } from 'vitest';
import type { KeyAssignmentMode } from '../../../api/keeb';
import en from '../../../locales/en.json';
import {
  ASSIGNMENT_CATEGORIES,
  CATEGORY_LABEL_KEYS,
  SPECIAL_ASSIGNMENTS,
  getAssignmentCategories,
  getRotaryFunctionLabelKey,
  getRotaryFunctionTooltipKey,
} from './keebCategories';
import type { AssignmentFunction } from './keebCategories';

// Must mirror the KeyAssignmentMode union in src/api/keeb.ts; the type
// annotation makes drift a compile error.
const VALID_MODES: readonly KeyAssignmentMode[] = [
  'StandardKey',
  'MouseKey',
  'MediaKey',
  'SystemMediaKey',
  'WebMediaKey',
  'SystemKey',
  'MacroKey',
  'LayerKey',
  'ProfileKey',
  'RGBKey',
  'SoftwareKey',
];

const enDict: Record<string, string> = en;

interface FlatSection {
  path: string;
  titleKey: string;
  groupTitleKey: string;
  functions: AssignmentFunction[];
}

function flatSections(): FlatSection[] {
  const categories = getAssignmentCategories();
  const out: FlatSection[] = [];
  for (const category of ASSIGNMENT_CATEGORIES) {
    for (const group of categories[category]) {
      for (const section of group.sections) {
        out.push({
          path: `${category} > ${group.titleKey} > ${section.titleKey}`,
          titleKey: section.titleKey,
          groupTitleKey: group.titleKey,
          functions: section.functions,
        });
      }
    }
  }
  return out;
}

function allFunctions(): AssignmentFunction[] {
  return flatSections().flatMap(s => s.functions);
}

function findFunction(keyFunction: string): AssignmentFunction {
  const match = allFunctions().find(f => f.keyFunction === keyFunction);
  expect(match, `function ${keyFunction} should exist in the catalog`).toBeDefined();
  return match!;
}

describe('getAssignmentCategories', () => {
  it('returns all assignment categories as keys, with Keyboard empty', () => {
    const categories = getAssignmentCategories();
    expect(Object.keys(categories).sort()).toEqual([...ASSIGNMENT_CATEGORIES].sort());
    expect(ASSIGNMENT_CATEGORIES).toHaveLength(5);
    expect(categories.Keyboard).toEqual([]);
  });

  it('every function has a keeb.-prefixed labelKey, non-empty keyFunction, and a valid mode', () => {
    const fns = allFunctions();
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      expect(fn.labelKey, `labelKey for ${fn.keyFunction}`).toMatch(/^keeb\./);
      expect(fn.keyFunction.length, `keyFunction for ${fn.labelKey}`).toBeGreaterThan(0);
      expect(VALID_MODES, `mode for ${fn.keyFunction}`).toContain(fn.mode);
    }
  });

  it('keyFunctions are unique within each section', () => {
    for (const section of flatSections()) {
      const names = section.functions.map(f => f.keyFunction);
      expect(new Set(names).size, `duplicates in ${section.path}`).toBe(names.length);
    }
  });
});

describe('Macros category', () => {
  it('carries exactly 16 macro functions with sequential params', () => {
    const categories = getAssignmentCategories();
    const macroFns = categories.Macros.flatMap(g => g.sections).flatMap(s => s.functions);
    expect(macroFns).toHaveLength(16);
    macroFns.forEach((fn, i) => {
      const n = i + 1;
      expect(fn.labelKey).toBe('keeb.fn.macroN');
      expect(fn.labelParams).toEqual({ n });
      expect(fn.keyFunction).toBe(`Macro${n}`);
      expect(fn.mode).toBe('MacroKey');
      expect(fn.input).toBe(1);
    });
  });
});

describe('input wiring', () => {
  it('wheel functions carry input 1', () => {
    expect(findFunction('MouseWheelUp').input).toBe(1);
    expect(findFunction('MouseWheelDown').input).toBe(1);
  });

  it('XPan functions carry input 10', () => {
    for (const name of ['MouseXPanLeft', 'MouseXPanRight', 'MouseXPanUp', 'MouseXPanDown']) {
      expect(findFunction(name).input, name).toBe(10);
    }
  });

  it('layer switches carry input 1', () => {
    for (const name of ['MOSwitch', 'TGSwitch', 'TOSwitch', 'DFSwitch']) {
      expect(findFunction(name).input, name).toBe(1);
    }
  });

  it('RGBEffectValue carries input 1', () => {
    expect(findFunction('RGBEffectValue').input).toBe(1);
  });

  it('plain buttons have no input', () => {
    expect(findFunction('MouseLButton').input).toBeUndefined();
  });
});

describe('CATEGORY_LABEL_KEYS', () => {
  it('has an entry for every category', () => {
    for (const category of ASSIGNMENT_CATEGORIES) {
      expect(CATEGORY_LABEL_KEYS[category], category).toBeTruthy();
    }
  });
});

// Guard that keeps the catalog and the locale files in sync: every key the
// catalog can hand to t() must exist in en.json (the other locales are pinned
// to en.json's key set by the localeParity audit).
describe('locale parity guard (en.json)', () => {
  const expectKey = (key: string, context: string) => {
    expect(enDict[key], `${context}: missing en.json key '${key}'`).toBeDefined();
  };

  it('every function labelKey exists in en.json', () => {
    for (const fn of allFunctions()) {
      if (fn.labelKey === 'keeb.fn.macroN') continue; // parameterized, checked below
      expectKey(fn.labelKey, `labelKey of ${fn.keyFunction}`);
    }
    expectKey('keeb.fn.macroN', 'parameterized macro label');
  });

  it('every group and section titleKey exists in en.json', () => {
    for (const section of flatSections()) {
      expectKey(section.groupTitleKey, `group title in ${section.path}`);
      expectKey(section.titleKey, `section title in ${section.path}`);
    }
  });

  it('every category label key exists in en.json', () => {
    for (const category of ASSIGNMENT_CATEGORIES) {
      expectKey(CATEGORY_LABEL_KEYS[category], `category ${category}`);
    }
  });

  it('the special clear-key assignments carry locale keys and firmware-known functions', () => {
    expect(SPECIAL_ASSIGNMENTS.map(f => f.keyFunction)).toEqual(['None', 'PassThrough']);
    for (const f of SPECIAL_ASSIGNMENTS) {
      expectKey(f.labelKey, `special ${f.keyFunction}`);
      expectKey(`keeb.assignTip.${f.keyFunction}`, `special tip ${f.keyFunction}`);
      expect(f.mode).toBe('StandardKey');
    }
  });

  it('every known rotary function has label and tooltip keys in en.json', () => {
    const rotaryFunctions = [
      'VolumeAdjustment', 'BrightnessAdjustment', 'Scale', 'AltTab', 'CtrlTab',
      'ScrollX', 'ScrollY', 'WaveAdjustment', 'ScrubAdobeTimeline',
      'ScrollAdobeTimeline', 'AdobeBrushSize', 'ScrollAdobeToolList',
      'MediaForwardsOrBackwards', 'UndoOrRedo', 'Q60PageControl', 'Y70PageControl',
    ];
    for (const type of rotaryFunctions) {
      expectKey(getRotaryFunctionLabelKey(type), `rotary label ${type}`);
      expectKey(getRotaryFunctionTooltipKey(type), `rotary tooltip ${type}`);
    }
  });
});
