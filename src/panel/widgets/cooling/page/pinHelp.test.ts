import { describe, expect, it } from 'vitest';
import { pinTooltipKey } from './pinHelp';

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
