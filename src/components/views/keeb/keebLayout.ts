// Physical layout of the HYTE Keeb TKL keyboard. Each entry is one physical
// key with its default function (the printed legend), the assignment mode
// the firmware uses for that function, and any positioning hints - gaps
// between groups, oversized keys, the keypad cluster.
//
// Ported from nexus/src/renderer/shared/features/nexus/keeb/KeebLayout.tsx.
// Row x col coordinates here are web-local render coordinates, NOT the
// firmware's key matrix (which is a separate row-major table; see
// .agents/keeb-layer-wire-format.md in the master repo). The service-side
// slot map translates web (x, y) into firmware slots for
// /keeb/layer/{n}/key writes.
//
// Row 0 is the top LED strip (the renderer adds the rotary wheels around
// it) - not user-assignable, but still drawn. Row 1 is the physical
// media-button strip under the wheels at the board's top left.

import type { CSSProperties } from 'react';
import type { KeyAssignmentMode } from '../../../api/keeb';
import type { KeebLayoutKind } from './keebGlyphs';

export interface KeebLayoutKey {
  function: string;
  mode: KeyAssignmentMode;
  /** Optional positioning override - gap, fixed width, vertical span. */
  style?: CSSProperties;
}

export type KeebLayoutRow = KeebLayoutKey[];

export function getKeebLayoutRows(layout: KeebLayoutKind): KeebLayoutRow[] {
  return [
    // Row 0 - top LED strip (purely cosmetic on this surface).
    [{ function: 'RGBEffectLoop', mode: 'RGBKey', style: { position: 'absolute', left: 210 } }],

    // Row 1 - physical media buttons under the rotary wheels.
    [
      { function: 'Stop', mode: 'MediaKey' },
      { function: 'ScanPreviousTrack', mode: 'MediaKey' },
      { function: 'PlayAndPause', mode: 'MediaKey' },
      { function: 'ScanNextTrack', mode: 'MediaKey' },
      { function: 'Mute', mode: 'MediaKey' },
    ],

    // Row 2 - Esc + F-row + nav + None/PassThrough split keys.
    [
      { function: 'Escape', mode: 'StandardKey' },
      { function: 'F1', mode: 'StandardKey', style: { marginLeft: 85 } },
      { function: 'F2', mode: 'StandardKey' },
      { function: 'F3', mode: 'StandardKey' },
      { function: 'F4', mode: 'StandardKey' },
      { function: 'F5', mode: 'StandardKey', style: { marginLeft: 85 } },
      { function: 'F6', mode: 'StandardKey' },
      { function: 'F7', mode: 'StandardKey' },
      { function: 'F8', mode: 'StandardKey' },
      { function: 'F9', mode: 'StandardKey', style: { marginLeft: 45 } },
      { function: 'F10', mode: 'StandardKey' },
      { function: 'F11', mode: 'StandardKey' },
      { function: 'F12', mode: 'StandardKey', style: { marginRight: 30 } },
      { function: 'PrintScreen', mode: 'StandardKey' },
      { function: 'ScrollLock', mode: 'StandardKey' },
      { function: 'Pause', mode: 'StandardKey' },
      { function: 'None', mode: 'StandardKey', style: { marginLeft: 35, width: 160 } },
      { function: 'PassThrough', mode: 'StandardKey', style: { width: 160 } },
    ],

    // Row 3 - number row + nav + start of numpad.
    [
      { function: 'Backtick', mode: 'StandardKey' },
      { function: 'Number1', mode: 'StandardKey' },
      { function: 'Number2', mode: 'StandardKey' },
      { function: 'Number3', mode: 'StandardKey' },
      { function: 'Number4', mode: 'StandardKey' },
      { function: 'Number5', mode: 'StandardKey' },
      { function: 'Number6', mode: 'StandardKey' },
      { function: 'Number7', mode: 'StandardKey' },
      { function: 'Number8', mode: 'StandardKey' },
      { function: 'Number9', mode: 'StandardKey' },
      { function: 'Number0', mode: 'StandardKey' },
      { function: 'Minus', mode: 'StandardKey' },
      { function: 'Equals', mode: 'StandardKey' },
      { function: 'Backspace', mode: 'StandardKey', style: { width: 205, marginRight: 30 } },
      { function: 'Insert', mode: 'StandardKey' },
      { function: 'Home', mode: 'StandardKey' },
      { function: 'PageUp', mode: 'StandardKey' },
      { function: 'NumLock', mode: 'StandardKey', style: { marginLeft: 35 } },
      { function: 'KeypadSlash', mode: 'StandardKey' },
      { function: 'KeypadAsterisk', mode: 'StandardKey' },
      { function: 'KeypadMinus', mode: 'StandardKey' },
    ],

    // Row 4 - Tab row + QWERTY top half + Del/End/PgDn + numpad continuation.
    [
      { function: 'Tab', mode: 'StandardKey', style: { width: 140 } },
      { function: 'Q', mode: 'StandardKey' },
      { function: 'W', mode: 'StandardKey' },
      { function: 'E', mode: 'StandardKey' },
      { function: 'R', mode: 'StandardKey' },
      { function: 'T', mode: 'StandardKey' },
      { function: 'Y', mode: 'StandardKey' },
      { function: 'U', mode: 'StandardKey' },
      { function: 'I', mode: 'StandardKey' },
      { function: 'O', mode: 'StandardKey' },
      { function: 'P', mode: 'StandardKey' },
      { function: 'LeftBracket', mode: 'StandardKey' },
      { function: 'RightBracket', mode: 'StandardKey' },
      ...(layout === 'ANSI'
        ? [{ function: 'Backslash', mode: 'StandardKey' as KeyAssignmentMode, style: { width: 140, marginRight: 30 } }]
        : [{ function: 'Return', mode: 'StandardKey' as KeyAssignmentMode, style: { width: 140, marginRight: 30 } }]),
      { function: 'Delete', mode: 'StandardKey' },
      { function: 'End', mode: 'StandardKey' },
      { function: 'PageDown', mode: 'StandardKey' },
      { function: 'Keypad7Home', mode: 'StandardKey', style: { marginLeft: 34 } },
      { function: 'Keypad8UpArrow', mode: 'StandardKey' },
      { function: 'Keypad9PageUp', mode: 'StandardKey' },
      { function: 'KeypadPlus', mode: 'StandardKey', style: { marginTop: 80, marginLeft: -1, height: 145 } },
    ],

    // Row 5 - Caps + ASDF.
    [
      { function: 'CapsLock', mode: 'StandardKey', style: { width: layout === 'ISO' ? 170 : 158 } },
      { function: 'A', mode: 'StandardKey' },
      { function: 'S', mode: 'StandardKey' },
      { function: 'D', mode: 'StandardKey' },
      { function: 'F', mode: 'StandardKey' },
      { function: 'G', mode: 'StandardKey' },
      { function: 'H', mode: 'StandardKey' },
      { function: 'J', mode: 'StandardKey' },
      { function: 'K', mode: 'StandardKey' },
      { function: 'L', mode: 'StandardKey' },
      { function: 'Semicolon', mode: 'StandardKey' },
      { function: 'Quote', mode: 'StandardKey' },
      ...(layout === 'ANSI'
        ? [{ function: 'Return', mode: 'StandardKey' as KeyAssignmentMode, style: { width: 210 } }]
        : [{ function: 'NonUsPound', mode: 'StandardKey' as KeyAssignmentMode, style: { marginRight: 124 } }]),
      { function: 'Keypad4LeftArrow', mode: 'StandardKey', style: { marginLeft: 313 } },
      { function: 'Keypad5', mode: 'StandardKey' },
      { function: 'Keypad6RightArrow', mode: 'StandardKey' },
    ],

    // Row 6 - Shift row.
    [
      { function: 'LeftShift', mode: 'StandardKey', style: { width: layout === 'ISO' ? 114 : 200 } },
      ...(layout === 'ISO' ? [{ function: 'NonUsBackslash', mode: 'StandardKey' as KeyAssignmentMode }] : []),
      { function: 'Z', mode: 'StandardKey' },
      { function: 'X', mode: 'StandardKey' },
      { function: 'C', mode: 'StandardKey' },
      { function: 'V', mode: 'StandardKey' },
      { function: 'B', mode: 'StandardKey' },
      { function: 'N', mode: 'StandardKey' },
      { function: 'M', mode: 'StandardKey' },
      { function: 'Comma', mode: 'StandardKey' },
      { function: 'Period', mode: 'StandardKey' },
      { function: 'Slash', mode: 'StandardKey' },
      { function: 'RightShift', mode: 'StandardKey', style: { width: 254 } },
      { function: 'UpArrow', mode: 'StandardKey', style: { marginLeft: 108 } },
      { function: 'Keypad1End', mode: 'StandardKey', style: { marginLeft: 119 } },
      { function: 'Keypad2DownArrow', mode: 'StandardKey' },
      { function: 'Keypad3PageDown', mode: 'StandardKey' },
      { function: 'KeypadEqual', mode: 'StandardKey', style: { marginTop: 80, height: 140 } },
    ],

    // Row 7 - bottom row (modifiers + space).
    [
      { function: 'LeftControl', mode: 'StandardKey', style: { width: 105 } },
      { function: 'LeftGUI', mode: 'StandardKey', style: { width: 105 } },
      { function: 'LeftAlt', mode: 'StandardKey', style: { width: 105 } },
      { function: 'Space', mode: 'StandardKey', style: { width: 508 } },
      { function: 'RightAlt', mode: 'StandardKey', style: { width: 105 } },
      { function: 'MOSwitch', mode: 'LayerKey', style: { width: 105 } },
      ...(layout === 'ISO'
        ? [{ function: 'RightGUI', mode: 'StandardKey' as KeyAssignmentMode, style: { width: 105 } }]
        : [{ function: 'Application', mode: 'StandardKey' as KeyAssignmentMode, style: { width: 105 } }]),
      { function: 'RightControl', mode: 'StandardKey', style: { width: 105 } },
      { function: 'LeftArrow', mode: 'StandardKey', style: { marginLeft: 24 } },
      { function: 'DownArrow', mode: 'StandardKey' },
      { function: 'RightArrow', mode: 'StandardKey' },
      { function: 'Keypad0Insert', mode: 'StandardKey', style: { width: 161, marginLeft: 33 } },
      { function: 'KeypadPeriodDelete', mode: 'StandardKey' },
    ],
  ];
}
