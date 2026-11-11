import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorSamplingSelect } from './ColorSamplingSelect';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));
const set = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/lighting', () => ({ setLightingColorSampling: set }));

const trigger = () => screen.getByRole('button', { name: 'lighting.ledMap.colorSampling' });

describe('ColorSamplingSelect', () => {
  it('lists the three modes and shows the stored one', () => {
    render(<ColorSamplingSelect id="d1" value="vivid" onFail={vi.fn()} />);
    expect(trigger().textContent).toContain('lighting.ledMap.colorSamplingVivid');
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'lighting.ledMap.colorSamplingStandard',
      'lighting.ledMap.colorSamplingVivid',
      'lighting.ledMap.colorSamplingIgnoreBlack',
    ]);
  });

  it('posts the chosen mode optimistically, then reports saved', async () => {
    set.mockResolvedValue({ error: false, msg: '' });
    const onSaved = vi.fn();
    render(<ColorSamplingSelect id="d1" value="standard" onFail={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.colorSamplingIgnoreBlack' }));
    expect(set).toHaveBeenCalledWith('d1', 'ignore-black');
    expect(trigger().textContent).toContain('lighting.ledMap.colorSamplingIgnoreBlack');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('reverts and reports when the save fails', async () => {
    set.mockResolvedValue({ error: true, msg: 'x' });
    const onFail = vi.fn();
    render(<ColorSamplingSelect id="d1" value="standard" onFail={onFail} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.colorSamplingVivid' }));
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    expect(trigger().textContent).toContain('lighting.ledMap.colorSamplingStandard');
  });
});
