// Physical layout of the HYTE Keeb TKL keyboard. Each entry is one physical
// key with its default function (the printed legend), the assignment mode
// the firmware uses for that function, and any positioning hints - gaps
// between groups and oversized keys.
//
// Every cell here exists on the real board: the set was verified against a
// factory 0xF2 layer-table dump (fw 1.33) and the vendor driver's
// ANSI/ISO_COMMAND_INDEX tables. The legacy port also carried a phantom
// numpad cluster and two None/PassThrough filler keys with no firmware slot
// or LED behind them; those are gone - "clear key" actions live in the
// assignment picker instead.
//
// Row x col coordinates are the wire contract for /keeb/layer/{n}/key: the
// service's KeebLayerMap mirrors these rows exactly and translates (x, y)
// into firmware slots, rejecting any coordinate it does not know.
//
// Row 0 is the RGB-effect key between the rotary wheels (a real assignable
// key - firmware slot 1). Row 1 is the physical media-button strip under the
// wheels at the board's top left.

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
    // Row 0 - the RGB-effect-cycle key between the wheels.
    [{ function: 'RGBEffectLoop', mode: 'RGBKey', style: { position: 'absolute', left: 210 } }],

    // Row 1 - physical media buttons under the rotary wheels.
    [
      { function: 'Stop', mode: 'MediaKey' },
      { function: 'ScanPreviousTrack', mode: 'MediaKey' },
      { function: 'PlayAndPause', mode: 'MediaKey' },
      { function: 'ScanNextTrack', mode: 'MediaKey' },
      { function: 'Mute', mode: 'MediaKey' },
    ],

    // Row 2 - Esc + F-row + nav.
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
    ],

    // Row 3 - number row + nav.
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
    ],

    // Row 4 - Tab row + QWERTY top half + Del/End/PgDn.
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
        : [{ function: 'NonUsPound', mode: 'StandardKey' as KeyAssignmentMode }]),
    ],

    // Row 6 - Shift row + Up arrow.
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
    ],

    // Row 7 - bottom row (modifiers + space + arrows).
    [
      { function: 'LeftControl', mode: 'StandardKey', style: { width: 105 } },
      { function: 'LeftGUI', mode: 'StandardKey', style: { width: 105 } },
      { function: 'LeftAlt', mode: 'StandardKey', style: { width: 105 } },
      { function: 'Space', mode: 'StandardKey', style: { width: 508 } },
      { function: 'RightAlt', mode: 'StandardKey', style: { width: 105 } },
      { function: 'MOSwitch', mode: 'LayerKey', style: { width: 105 } },
      // Firmware default at this position is RGui on both layouts (the ANSI
      // legend suggests a menu key, but the fw table carries 0xE7).
      { function: 'RightGUI', mode: 'StandardKey', style: { width: 105 } },
      { function: 'RightControl', mode: 'StandardKey', style: { width: 105 } },
      { function: 'LeftArrow', mode: 'StandardKey', style: { marginLeft: 24 } },
      { function: 'DownArrow', mode: 'StandardKey' },
      { function: 'RightArrow', mode: 'StandardKey' },
    ],
  ];
}
