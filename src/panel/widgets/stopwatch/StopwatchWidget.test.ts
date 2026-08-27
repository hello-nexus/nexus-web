// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatStopwatchElapsed } from './formatStopwatchElapsed';

describe('formatStopwatchElapsed', () => {
  it('uses hundredths and hides hours below one hour', () => {
    expect(formatStopwatchElapsed(0)).toEqual({
      h: null,
      m: '00',
      s: '00',
      hundredths: '00',
    });

    expect(formatStopwatchElapsed(61_239)).toEqual({
      h: null,
      m: '01',
      s: '01',
      hundredths: '23',
    });
  });

  it('shows unpadded hours once elapsed time reaches one hour', () => {
    expect(formatStopwatchElapsed(3_600_000)).toEqual({
      h: '1',
      m: '00',
      s: '00',
      hundredths: '00',
    });

    expect(formatStopwatchElapsed(36_123_450)).toEqual({
      h: '10',
      m: '02',
      s: '03',
      hundredths: '45',
    });
  });
});
