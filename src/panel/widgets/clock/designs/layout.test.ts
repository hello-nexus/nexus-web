import { describe, expect, it } from 'vitest';
import { splitTimeLines } from './layout';

describe('splitTimeLines', () => {
  it('keeps a horizontal time on one line, colons included', () => {
    expect(splitTimeLines('07:46:12', 'horizontal')).toEqual(['07:46:12']);
    expect(splitTimeLines('07:46', 'horizontal')).toEqual(['07:46']);
  });

  it('gives each unit its own line when stacked, consuming the colons', () => {
    expect(splitTimeLines('07:46:12', 'stacked')).toEqual(['07', '46', '12']);
    expect(splitTimeLines('07:46', 'stacked')).toEqual(['07', '46']);
  });
});
