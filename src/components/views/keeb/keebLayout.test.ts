// Layout data tests - pin the physical layout shape of the Keeb TKL render.
// Every cell is a real key verified against a factory layer-table dump; the
// (x, y) coordinates are the wire contract with the service's KeebLayerMap,
// so a typo or a well-meaning cleanup that inserts or removes a cell would
// silently swap which key the user remaps. These tests catch that.

import { describe, it, expect } from 'vitest';
import { getKeebLayoutRows } from './keebLayout';

const MEDIA_ROW_FUNCTIONS = ['Stop', 'ScanPreviousTrack', 'PlayAndPause', 'ScanNextTrack', 'Mute'];

describe('keebLayout - row shape', () => {
  it('returns 8 rows for ANSI', () => {
    expect(getKeebLayoutRows('ANSI')).toHaveLength(8);
  });
  it('returns 8 rows for ISO', () => {
    expect(getKeebLayoutRows('ISO')).toHaveLength(8);
  });

  it('row 0 holds only RGBEffectLoop (the firmware mode-cycle key)', () => {
    const rows = getKeebLayoutRows('ANSI');
    expect(rows[0]).toHaveLength(1);
    expect(rows[0][0].function).toBe('RGBEffectLoop');
    expect(rows[0][0].mode).toBe('RGBKey');
  });

  it('row 1 has the 5 physical media buttons in order', () => {
    const rows = getKeebLayoutRows('ANSI');
    expect(rows[1].map(k => k.function)).toEqual(MEDIA_ROW_FUNCTIONS);
    rows[1].forEach(k => {
      expect(k.mode).toBe('MediaKey');
      expect(k.style).toBeUndefined();
    });
  });

  it('row 2 starts with Escape and includes the F-row gaps', () => {
    const r = getKeebLayoutRows('ANSI')[2];
    expect(r[0].function).toBe('Escape');
    // Esc → F1 group, F4 → F5 group, F8 → F9 group: legacy gaps preserved
    expect(r.find(k => k.function === 'F1')?.style?.marginLeft).toBe(85);
    expect(r.find(k => k.function === 'F5')?.style?.marginLeft).toBe(85);
    expect(r.find(k => k.function === 'F9')?.style?.marginLeft).toBe(45);
    expect(r.find(k => k.function === 'F12')?.style?.marginRight).toBe(30);
  });

  it('row 2 carries no phantom None/PassThrough filler keys', () => {
    const r = getKeebLayoutRows('ANSI')[2];
    expect(r.find(k => k.function === 'None')).toBeUndefined();
    expect(r.find(k => k.function === 'PassThrough')).toBeUndefined();
    expect(r).toHaveLength(16);
    expect(r[r.length - 1].function).toBe('Pause');
  });

  it('row 3 Backspace is the oversized 205-wide key with 30-margin gap to nav', () => {
    const r = getKeebLayoutRows('ANSI')[3];
    const bs = r.find(k => k.function === 'Backspace');
    expect(bs?.style).toMatchObject({ width: 205, marginRight: 30 });
    expect(r[r.length - 1].function).toBe('PageUp');
  });

  it('row 4 ANSI ends with Backslash 140-wide; ISO swaps it for Return', () => {
    const ansi = getKeebLayoutRows('ANSI')[4];
    const iso = getKeebLayoutRows('ISO')[4];
    const ansiTail = ansi.find(k => k.function === 'Backslash');
    const isoTail = iso.find(k => k.function === 'Return');
    expect(ansiTail?.style).toMatchObject({ width: 140, marginRight: 30 });
    expect(isoTail?.style).toMatchObject({ width: 140, marginRight: 30 });
    // ANSI must NOT have Return on row 4; ISO must NOT have Backslash on row 4
    expect(ansi.find(k => k.function === 'Return')).toBeUndefined();
    expect(iso.find(k => k.function === 'Backslash')).toBeUndefined();
  });

  it('no keypad cells exist anywhere (the board is a true TKL)', () => {
    for (const layout of ['ANSI', 'ISO'] as const) {
      const keypadCells = getKeebLayoutRows(layout).flat()
        .filter(k => k.function.startsWith('Keypad') || k.function === 'NumLock');
      expect(keypadCells).toEqual([]);
    }
  });

  it('row 5 CapsLock width swaps 158 ↔ 170 between ANSI and ISO', () => {
    expect(getKeebLayoutRows('ANSI')[5][0].style?.width).toBe(158);
    expect(getKeebLayoutRows('ISO')[5][0].style?.width).toBe(170);
  });

  it('row 5 ANSI ends with Return (width 210); ISO uses NonUsPound', () => {
    const ansi = getKeebLayoutRows('ANSI')[5];
    const iso = getKeebLayoutRows('ISO')[5];
    expect(ansi[ansi.length - 1].function).toBe('Return');
    expect(ansi[ansi.length - 1].style?.width).toBe(210);
    expect(iso[iso.length - 1].function).toBe('NonUsPound');
  });

  it('row 6 LeftShift width swaps 200 ↔ 114 (ISO inserts NonUsBackslash)', () => {
    const ansi = getKeebLayoutRows('ANSI')[6];
    const iso = getKeebLayoutRows('ISO')[6];
    expect(ansi[0].style?.width).toBe(200);
    expect(iso[0].style?.width).toBe(114);
    // ISO inserts NonUsBackslash right after LeftShift
    expect(iso[1].function).toBe('NonUsBackslash');
    expect(ansi[1].function).toBe('Z');
  });

  it('row 6 RightShift and UpArrow keep their offsets and close the row', () => {
    const r = getKeebLayoutRows('ANSI')[6];
    expect(r.find(k => k.function === 'RightShift')?.style?.width).toBe(254);
    expect(r.find(k => k.function === 'UpArrow')?.style?.marginLeft).toBe(108);
    expect(r[r.length - 1].function).toBe('UpArrow');
  });

  it('row 7 bottom row has fixed-width modifiers + 508-wide Space + MOSwitch as LayerKey', () => {
    const r = getKeebLayoutRows('ANSI')[7];
    expect(r.find(k => k.function === 'Space')?.style?.width).toBe(508);
    const mo = r.find(k => k.function === 'MOSwitch');
    expect(mo?.mode).toBe('LayerKey');
    expect(mo?.style?.width).toBe(105);
    // Both layouts carry RGui at this position - the firmware default is
    // 0xE7 even on ANSI boards, so no Application cell exists.
    expect(r.find(k => k.function === 'RightGUI')?.style?.width).toBe(105);
    expect(r.find(k => k.function === 'Application')).toBeUndefined();
    expect(getKeebLayoutRows('ISO')[7].find(k => k.function === 'RightGUI')?.style?.width).toBe(105);
    expect(r.find(k => k.function === 'LeftArrow')?.style?.marginLeft).toBe(24);
    expect(r[r.length - 1].function).toBe('RightArrow');
  });

  it('the only media-key cells are the five physical media buttons on row 1', () => {
    for (const layout of ['ANSI', 'ISO'] as const) {
      const mediaCells = getKeebLayoutRows(layout).flat().filter(k => k.mode === 'MediaKey');
      expect(mediaCells.map(k => k.function)).toEqual(MEDIA_ROW_FUNCTIONS);
    }
  });

  it('total cell count matches the physical board (ISO adds NonUsBackslash)', () => {
    const ansiTotal = getKeebLayoutRows('ANSI').reduce((n, r) => n + r.length, 0);
    const isoTotal = getKeebLayoutRows('ISO').reduce((n, r) => n + r.length, 0);
    // Row 4: ANSI has Backslash, ISO has Return - same count.
    // Row 5: ANSI has Return, ISO has NonUsPound - same count.
    // Row 6: ISO inserts NonUsBackslash (one extra cell).
    // 93 keys = every non-sentinel populated slot in the factory dump
    // (91 standard/media/MO keys + the RGB key + nothing else).
    expect(ansiTotal).toBe(93);
    expect(isoTotal).toBe(ansiTotal + 1);
  });
});

describe('keebLayout - visual class hint per mode/position', () => {
  // The renderer derives the visual shape from row/index:
  //   row === 0 && key === 0  → middle button (pill)
  //   row === 1               → media key (wide-short rounded)
  //   otherwise               → standard key
  // These tests pin the positional rules at the data level so the renderer
  // can keep applying them deterministically.

  it('first cell of row 0 is the firmware-supplied RGB-cycle key (middle-button role)', () => {
    const rows = getKeebLayoutRows('ANSI');
    expect(rows[0][0].function).toBe('RGBEffectLoop');
    expect(rows[0][0].mode).toBe('RGBKey');
  });

  it('every cell of row 1 is a media key', () => {
    const r = getKeebLayoutRows('ANSI')[1];
    expect(r.every(k => k.mode === 'MediaKey')).toBe(true);
  });
});
