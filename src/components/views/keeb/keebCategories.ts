// Key-assignment category catalog — ported from the legacy nexus app
// (`renderer/shared/features/nexus/keeb/KeyAssignment/index.ts`).
//
// Shape:  category -> groups -> sections -> functions. The `Keyboard`
// category is intentionally empty here because keyboard-to-keyboard
// reassignment uses the keyboard render itself as a drag-source — see
// the spec §4.4. The four remaining categories drive the assignment
// view's grid below the keyboard render.
//
// `name`, `keyFunction`, `mode`, `input` mirror the firmware contract;
// `KeyAssignmentMode` strings match qos-service's `KeyAssignmentMode`
// DTO.

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

export interface AssignmentFunction {
  name: string;
  keyFunction: string;
  mode: KeyAssignmentMode;
  input?: number | null;
}

export interface AssignmentSection {
  title: string;
  functions: AssignmentFunction[];
}

export interface AssignmentGroup {
  title: string;
  sections: AssignmentSection[];
}

export type AssignmentCategories = Record<KeebAssignmentCategory, AssignmentGroup[]>;

// Mirrors `getDefaultKeyInput` in the legacy file. Functions not in the
// table have no `input` parameter (`null` / undefined at firmware level).
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

const macros = (): AssignmentFunction[] => {
  const out: AssignmentFunction[] = [];
  for (let i = 1; i <= 16; i++) {
    const fn = `Macro${i}`;
    out.push({ name: `Macro ${i}`, keyFunction: fn, mode: 'MacroKey', input: DEFAULT_INPUTS[fn] });
  }
  return out;
};

/// Returns the categories tree consumed by `KeebKeyAssignmentView`. The
/// `Keyboard` category is handled separately by the view (it renders a
/// second `KeebKeyboard` as a click-to-pick source instead of a tile grid),
/// so it appears as an empty entry here just to satisfy the type.
export function getAssignmentCategories(): AssignmentCategories {
  return {
    Keyboard: [],
    Mouse: [
      {
        title: 'Mouse',
        sections: [
          {
            title: 'Button',
            functions: [
              { name: 'Left Click', keyFunction: 'MouseLButton', mode: 'MouseKey' },
              { name: 'Right Click', keyFunction: 'MouseRButton', mode: 'MouseKey' },
              { name: 'Middle Click', keyFunction: 'MouseMButton', mode: 'MouseKey' },
              { name: 'Button 4', keyFunction: 'MouseB4Button', mode: 'MouseKey' },
              { name: 'Button 5', keyFunction: 'MouseB5Button', mode: 'MouseKey' },
            ],
          },
          {
            title: 'Wheel',
            functions: [
              { name: 'Scroll Up', keyFunction: 'MouseWheelUp', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseWheelUp },
              { name: 'Scroll Down', keyFunction: 'MouseWheelDown', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseWheelDown },
              { name: 'Scroll Left', keyFunction: 'MouseACPanLeft', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseACPanLeft },
              { name: 'Scroll Right', keyFunction: 'MouseACPanRight', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseACPanRight },
            ],
          },
        ],
      },
      {
        title: 'Pan Controls',
        sections: [
          {
            title: 'Pan',
            functions: [
              { name: 'Pan Left', keyFunction: 'MouseXPanLeft', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseXPanLeft },
              { name: 'Pan Right', keyFunction: 'MouseXPanRight', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseXPanRight },
              { name: 'Pan Up', keyFunction: 'MouseXPanUp', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseXPanUp },
              { name: 'Pan Down', keyFunction: 'MouseXPanDown', mode: 'MouseKey', input: DEFAULT_INPUTS.MouseXPanDown },
            ],
          },
        ],
      },
    ],

    'Lighting & Profiles': [
      {
        title: 'RGB Control',
        sections: [
          {
            title: 'Firmware Lighting Effect',
            functions: [
              { name: 'Set to a static effect', keyFunction: 'RGBEffectValue', mode: 'RGBKey', input: DEFAULT_INPUTS.RGBEffectValue },
              { name: 'Toggle Lighting ON/OFF', keyFunction: 'RGBOnOff', mode: 'RGBKey' },
              { name: 'Cycle through Lighting Effects', keyFunction: 'RGBEffectLoop', mode: 'RGBKey' },
              { name: 'Lighting Direction', keyFunction: 'DirectionLoop', mode: 'RGBKey' },
            ],
          },
          {
            title: 'Firmware Lighting Brightness',
            functions: [
              { name: 'Increase', keyFunction: 'BrightnessIncrease', mode: 'RGBKey' },
              { name: 'Decrease', keyFunction: 'BrightnessDecrease', mode: 'RGBKey' },
            ],
          },
          {
            title: 'Firmware Lighting Speed',
            functions: [
              { name: 'Increase', keyFunction: 'SpeedIncrease', mode: 'RGBKey' },
              { name: 'Decrease', keyFunction: 'SpeedDecrease', mode: 'RGBKey' },
              { name: 'Cycle', keyFunction: 'SpeedLoop', mode: 'RGBKey' },
            ],
          },
        ],
      },
      {
        title: 'Layers & Profiles',
        sections: [
          {
            title: 'Layer Switches',
            functions: [
              { name: 'Momentary', keyFunction: 'MOSwitch', mode: 'LayerKey', input: DEFAULT_INPUTS.MOSwitch },
              { name: 'Toggle ON/OFF', keyFunction: 'TGSwitch', mode: 'LayerKey', input: DEFAULT_INPUTS.TGSwitch },
              { name: 'Toggle ON', keyFunction: 'TOSwitch', mode: 'LayerKey', input: DEFAULT_INPUTS.TOSwitch },
              { name: 'Top Layer', keyFunction: 'DFSwitch', mode: 'LayerKey', input: DEFAULT_INPUTS.DFSwitch },
            ],
          },
          {
            title: 'Profiles',
            functions: [
              { name: 'Previous', keyFunction: 'ProfileMinus', mode: 'ProfileKey' },
              { name: 'Next', keyFunction: 'ProfilePlus', mode: 'ProfileKey' },
              { name: 'Cycle', keyFunction: 'ProfilePlusLoop', mode: 'ProfileKey' },
              { name: 'Set', keyFunction: 'ProfileValue', mode: 'ProfileKey', input: DEFAULT_INPUTS.ProfileValue },
            ],
          },
        ],
      },
    ],

    Macros: [
      {
        title: 'Macros',
        sections: [
          {
            title: 'Macro Keys',
            functions: macros(),
          },
        ],
      },
    ],

    'System & Apps': [
      {
        title: 'System Controls',
        sections: [
          {
            title: 'Windows Control',
            functions: [
              { name: 'Power Off', keyFunction: 'Power', mode: 'SystemKey' },
              { name: 'Put PC To Sleep', keyFunction: 'Sleep', mode: 'SystemKey' },
              { name: 'Wake PC', keyFunction: 'Wake', mode: 'SystemKey' },
              { name: 'Windows Search', keyFunction: 'WebSearch', mode: 'WebMediaKey' },
            ],
          },
        ],
      },
      {
        title: 'Apps & System',
        sections: [
          {
            title: 'Web Browser',
            functions: [
              { name: 'Open Default Web Browser', keyFunction: 'WebHome', mode: 'WebMediaKey' },
              { name: 'Back a Page', keyFunction: 'WebBack', mode: 'WebMediaKey' },
              { name: 'Forward a Page', keyFunction: 'WebForward', mode: 'WebMediaKey' },
              { name: 'Stop', keyFunction: 'WebStop', mode: 'WebMediaKey' },
              { name: 'Refresh Page', keyFunction: 'WebRefresh', mode: 'WebMediaKey' },
              { name: 'Favorite Page', keyFunction: 'WebFavorite', mode: 'WebMediaKey' },
            ],
          },
        ],
      },
      {
        title: 'System Apps',
        sections: [
          {
            title: 'Launch System Apps',
            functions: [
              { name: 'Default Media Player', keyFunction: 'MediaSelect', mode: 'SystemMediaKey' },
              { name: 'Default Email App', keyFunction: 'Mail', mode: 'SystemMediaKey' },
              { name: 'Calculator', keyFunction: 'Calculator', mode: 'SystemMediaKey' },
              { name: 'File Explorer', keyFunction: 'MyComputer', mode: 'SystemMediaKey' },
            ],
          },
        ],
      },
    ],
  };
}

// Human-readable tooltip for each rotary function — ported from the
// legacy `getRotaryFunctionTooltip`. Used by `KeebRotaryView`.
export function getRotaryFunctionTooltip(type: string): string {
  switch (type) {
    case 'VolumeAdjustment': return 'System Volume';
    case 'BrightnessAdjustment': return 'Lighting Brightness';
    case 'Scale': return 'Zoom';
    case 'AltTab': return 'App Switch';
    case 'CtrlTab': return 'Tab Switch';
    case 'ScrollX': return 'Scroll Left/Right';
    case 'ScrollY': return 'Scroll Up/Down';
    case 'WaveAdjustment': return 'Lighting DJ';
    case 'ScrubAdobeTimeline': return 'Scrub Timeline in Video Editor';
    case 'ScrollAdobeTimeline': return 'Scroll Timeline in Video Editor';
    case 'AdobeBrushSize': return 'Adjust Brush Size in Adobe';
    case 'ScrollAdobeToolList': return 'Cycle Tool List in Adobe';
    case 'MediaForwardsOrBackwards': return 'Media Forwards/Backwards';
    case 'UndoOrRedo': return 'Undo/Redo';
    case 'Q60PageControl': return 'Cycle pages on your Q60';
    case 'Y70PageControl': return 'Cycle pages on your Y70';
    default: return type;
  }
}

export const ROTARY_SENSITIVITIES: readonly string[] = [
  'Slow', 'Steady', 'Balanced', 'Fast', 'Turbo',
] as const;
