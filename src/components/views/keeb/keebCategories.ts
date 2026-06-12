// Key-assignment category catalog. Shape: category -> groups -> sections ->
// functions. The `Keyboard` category is empty here because keyboard-to-keyboard
// reassignment uses the keyboard render as a click-to-pick source (spec §4.4),
// not a tile grid. The four remaining categories drive the assignment view's
// grid below the keyboard render.
//
// `keyFunction`, `mode`, `input` mirror the firmware contract;
// `KeyAssignmentMode` strings match nexus-service's `KeyAssignmentMode` DTO.
// Display text is i18n: `labelKey`/`titleKey` resolve through t().

import type { KeyAssignmentMode } from '../../../api/keeb';

export type KeebAssignmentCategory =
  | 'Keyboard'
  | 'Mouse'
  | 'System & Apps'
  | 'Lighting & Profiles'
  | 'Macros';

export const ASSIGNMENT_CATEGORIES: readonly KeebAssignmentCategory[] = [
  'Keyboard',
  'Mouse',
  'System & Apps',
  'Lighting & Profiles',
  'Macros',
] as const;

/// Locale key for each category tab label. Category ids stay stable (they are
/// record keys and test fixtures); only the rendered label localizes.
export const CATEGORY_LABEL_KEYS: Record<KeebAssignmentCategory, string> = {
  Keyboard: 'keeb.category.keyboard',
  Mouse: 'keeb.category.mouse',
  'System & Apps': 'keeb.category.systemApps',
  'Lighting & Profiles': 'keeb.category.lightingProfiles',
  Macros: 'keeb.category.macros',
};

export interface AssignmentFunction {
  labelKey: string;
  labelParams?: Record<string, string | number>;
  keyFunction: string;
  mode: KeyAssignmentMode;
  input?: number | null;
}

export interface AssignmentSection {
  titleKey: string;
  functions: AssignmentFunction[];
}

export interface AssignmentGroup {
  titleKey: string;
  sections: AssignmentSection[];
}

export type AssignmentCategories = Record<KeebAssignmentCategory, AssignmentGroup[]>;

// Functions not in this table have no `input` parameter (null/undefined at
// firmware level).
const DEFAULT_INPUTS: Record<string, number> = {
  MouseWheelUp: 1,
  MouseWheelDown: 1,
  MouseACPanLeft: 1,
  MouseACPanRight: 1,
  MouseXPanLeft: 10,
  MouseXPanRight: 10,
  MouseXPanUp: 10,
  MouseXPanDown: 10,
  MOSwitch: 1,
  TGSwitch: 1,
  TOSwitch: 1,
  DFSwitch: 1,
  ProfileValue: 0,
  RGBEffectValue: 1,
  DirectionValue: 0,
  Macro1: 1, Macro2: 1, Macro3: 1, Macro4: 1, Macro5: 1, Macro6: 1, Macro7: 1, Macro8: 1,
  Macro9: 1, Macro10: 1, Macro11: 1, Macro12: 1, Macro13: 1, Macro14: 1, Macro15: 1, Macro16: 1,
};

const fn = (labelKey: string, keyFunction: string, mode: KeyAssignmentMode): AssignmentFunction =>
  ({ labelKey, keyFunction, mode, input: DEFAULT_INPUTS[keyFunction] });

const macros = (): AssignmentFunction[] => {
  const out: AssignmentFunction[] = [];
  for (let i = 1; i <= 16; i++) {
    out.push({
      labelKey: 'keeb.fn.macroN',
      labelParams: { n: i },
      keyFunction: `Macro${i}`,
      mode: 'MacroKey',
      input: DEFAULT_INPUTS[`Macro${i}`],
    });
  }
  return out;
};

/// Returns the categories tree consumed by `KeebKeyAssignmentView`. The
/// `Keyboard` category is an empty entry; the view handles it separately by
/// rendering a second `KeebKeyboard` as a click-to-pick source.
export function getAssignmentCategories(): AssignmentCategories {
  return {
    Keyboard: [],
    Mouse: [
      {
        titleKey: 'keeb.group.mouse',
        sections: [
          {
            titleKey: 'keeb.section.button',
            functions: [
              fn('keeb.fn.MouseLButton', 'MouseLButton', 'MouseKey'),
              fn('keeb.fn.MouseRButton', 'MouseRButton', 'MouseKey'),
              fn('keeb.fn.MouseMButton', 'MouseMButton', 'MouseKey'),
              fn('keeb.fn.MouseB4Button', 'MouseB4Button', 'MouseKey'),
              fn('keeb.fn.MouseB5Button', 'MouseB5Button', 'MouseKey'),
            ],
          },
          {
            titleKey: 'keeb.section.wheel',
            functions: [
              fn('keeb.fn.MouseWheelUp', 'MouseWheelUp', 'MouseKey'),
              fn('keeb.fn.MouseWheelDown', 'MouseWheelDown', 'MouseKey'),
              fn('keeb.fn.MouseACPanLeft', 'MouseACPanLeft', 'MouseKey'),
              fn('keeb.fn.MouseACPanRight', 'MouseACPanRight', 'MouseKey'),
            ],
          },
        ],
      },
      {
        titleKey: 'keeb.group.panControls',
        sections: [
          {
            titleKey: 'keeb.section.pan',
            functions: [
              fn('keeb.fn.MouseXPanLeft', 'MouseXPanLeft', 'MouseKey'),
              fn('keeb.fn.MouseXPanRight', 'MouseXPanRight', 'MouseKey'),
              fn('keeb.fn.MouseXPanUp', 'MouseXPanUp', 'MouseKey'),
              fn('keeb.fn.MouseXPanDown', 'MouseXPanDown', 'MouseKey'),
            ],
          },
        ],
      },
    ],

    'Lighting & Profiles': [
      {
        titleKey: 'keeb.group.rgbControl',
        sections: [
          {
            titleKey: 'keeb.section.fwEffect',
            functions: [
              fn('keeb.fn.RGBEffectValue', 'RGBEffectValue', 'RGBKey'),
              fn('keeb.fn.RGBOnOff', 'RGBOnOff', 'RGBKey'),
              fn('keeb.fn.RGBEffectLoop', 'RGBEffectLoop', 'RGBKey'),
              fn('keeb.fn.DirectionLoop', 'DirectionLoop', 'RGBKey'),
            ],
          },
          {
            titleKey: 'keeb.section.fwBrightness',
            functions: [
              fn('keeb.fn.BrightnessIncrease', 'BrightnessIncrease', 'RGBKey'),
              fn('keeb.fn.BrightnessDecrease', 'BrightnessDecrease', 'RGBKey'),
            ],
          },
          {
            titleKey: 'keeb.section.fwSpeed',
            functions: [
              fn('keeb.fn.SpeedIncrease', 'SpeedIncrease', 'RGBKey'),
              fn('keeb.fn.SpeedDecrease', 'SpeedDecrease', 'RGBKey'),
              fn('keeb.fn.SpeedLoop', 'SpeedLoop', 'RGBKey'),
            ],
          },
        ],
      },
      {
        titleKey: 'keeb.group.layersProfiles',
        sections: [
          {
            titleKey: 'keeb.section.layerSwitches',
            functions: [
              fn('keeb.fn.MOSwitch', 'MOSwitch', 'LayerKey'),
              fn('keeb.fn.TGSwitch', 'TGSwitch', 'LayerKey'),
              fn('keeb.fn.TOSwitch', 'TOSwitch', 'LayerKey'),
              fn('keeb.fn.DFSwitch', 'DFSwitch', 'LayerKey'),
            ],
          },
          {
            titleKey: 'keeb.section.profiles',
            functions: [
              fn('keeb.fn.ProfileMinus', 'ProfileMinus', 'ProfileKey'),
              fn('keeb.fn.ProfilePlus', 'ProfilePlus', 'ProfileKey'),
              fn('keeb.fn.ProfilePlusLoop', 'ProfilePlusLoop', 'ProfileKey'),
              fn('keeb.fn.ProfileValue', 'ProfileValue', 'ProfileKey'),
            ],
          },
        ],
      },
    ],

    Macros: [
      {
        titleKey: 'keeb.group.macros',
        sections: [
          {
            titleKey: 'keeb.section.macroKeys',
            functions: macros(),
          },
        ],
      },
    ],

    'System & Apps': [
      {
        titleKey: 'keeb.group.systemControls',
        sections: [
          {
            titleKey: 'keeb.section.windowsControl',
            functions: [
              fn('keeb.fn.Power', 'Power', 'SystemKey'),
              fn('keeb.fn.Sleep', 'Sleep', 'SystemKey'),
              fn('keeb.fn.Wake', 'Wake', 'SystemKey'),
              fn('keeb.fn.WebSearch', 'WebSearch', 'WebMediaKey'),
            ],
          },
        ],
      },
      {
        titleKey: 'keeb.group.appsSystem',
        sections: [
          {
            titleKey: 'keeb.section.webBrowser',
            functions: [
              fn('keeb.fn.WebHome', 'WebHome', 'WebMediaKey'),
              fn('keeb.fn.WebBack', 'WebBack', 'WebMediaKey'),
              fn('keeb.fn.WebForward', 'WebForward', 'WebMediaKey'),
              fn('keeb.fn.WebStop', 'WebStop', 'WebMediaKey'),
              fn('keeb.fn.WebRefresh', 'WebRefresh', 'WebMediaKey'),
              fn('keeb.fn.WebFavorite', 'WebFavorite', 'WebMediaKey'),
            ],
          },
        ],
      },
      {
        titleKey: 'keeb.group.systemApps',
        sections: [
          {
            titleKey: 'keeb.section.launchSystemApps',
            functions: [
              fn('keeb.fn.MediaSelect', 'MediaSelect', 'SystemMediaKey'),
              fn('keeb.fn.Mail', 'Mail', 'SystemMediaKey'),
              fn('keeb.fn.Calculator', 'Calculator', 'SystemMediaKey'),
              fn('keeb.fn.MyComputer', 'MyComputer', 'SystemMediaKey'),
            ],
          },
        ],
      },
    ],
  };
}

/// Locale key carrying the human label for a rotary function the service
/// reports. Functions without a key (future firmware additions) fall back to
/// the camelCase-split name in the view.
export function getRotaryFunctionLabelKey(type: string): string {
  return `keeb.rotaryFn.${type}`;
}

/// Locale key carrying the tooltip for a rotary function.
export function getRotaryFunctionTooltipKey(type: string): string {
  return `keeb.rotaryTip.${type}`;
}

export const ROTARY_SENSITIVITIES: readonly string[] = [
  'Slow', 'Steady', 'Balanced', 'Fast', 'Turbo',
] as const;
