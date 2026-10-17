import { describe, expect, it } from 'vitest';
import type { FanChannel } from '../../../../api/cooling';
import { pinTooltipKey, presetReach, modeTabTip } from './pinHelp';

const fan = (id: string, over: Partial<FanChannel> = {}): FanChannel => ({
  id, name: id, dutyPercent: 30, rpm: 800, mode: 'Auto', classification: 'Controllable', ...over,
});

describe('pinTooltipKey', () => {
  it('names the GPU reason first, even on a channel flagged otherwise', () => {
    expect(pinTooltipKey({ isGpu: true, kind: 'Fan' })).toBe('cooling.pin.tipGpu');
    expect(pinTooltipKey({ isGpu: true, kind: 'Pump', isAio: true })).toBe('cooling.pin.tipGpu');
  });

  it('names the pump reason for a pump, including an AIO pump', () => {
    expect(pinTooltipKey({ kind: 'Pump' })).toBe('cooling.pin.tipPump');
    expect(pinTooltipKey({ kind: 'Pump', isAio: true })).toBe('cooling.pin.tipPump');
  });

  it('names the cooler reason for an AIO radiator fan', () => {
    expect(pinTooltipKey({ kind: 'Fan', isAio: true })).toBe('cooling.pin.tipAio');
  });

  it('falls back to the plain pin copy', () => {
    expect(pinTooltipKey({ kind: 'Fan' })).toBe('cooling.pin.tip');
    expect(pinTooltipKey({})).toBe('cooling.pin.tip');
  });
});

describe('modeTabTip', () => {
  it('has no tooltip when nothing is pinned', () => {
    expect(modeTabTip([fan('a'), fan('b')], 'en')).toBeNull();
  });

  it('counts the pinned fans a mode skips, with the plural form', () => {
    const one = modeTabTip([fan('a'), fan('b', { pinned: true })], 'en');
    expect(one).toEqual({ key: 'cooling.pin.presetTipPinned.one', params: { count: 1 } });
    const many = modeTabTip([fan('a'), fan('b', { pinned: true }), fan('c', { pinned: true })], 'en');
    expect(many).toEqual({ key: 'cooling.pin.presetTipPinned.other', params: { count: 2 } });
  });

  it('uses the few form where the language has one', () => {
    const chans = [fan('a'), ...['b', 'c', 'd'].map(id => fan(id, { pinned: true }))];
    expect(modeTabTip(chans, 'ru')?.key).toBe('cooling.pin.presetTipPinned.few');
    expect(modeTabTip(chans, 'en')?.key).toBe('cooling.pin.presetTipPinned.other');
  });

  it('does not count a pinned fan a mode could not reach anyway', () => {
    const chans = [
      fan('a'),
      fan('b', { pinned: true, controlled: false }),
      fan('c', { pinned: true, readOnly: true }),
    ];
    expect(modeTabTip(chans, 'en')).toBeNull();
  });
});

describe('presetReach', () => {
  it('skips pinned fans unless Off hands them back', () => {
    const chans = [fan('a'), fan('b', { pinned: true })];
    expect([...presetReach(chans)]).toEqual(['a']);
    expect([...presetReach(chans, true)]).toEqual(['a', 'b']);
  });
});
