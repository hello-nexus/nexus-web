import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SamplingModeSelect } from './SamplingModeSelect';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));
const set = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/lighting', () => ({ setLightingSampling: set }));

const trigger = () => screen.getByRole('button', { name: 'lighting.ledMap.sampling' });

describe('SamplingModeSelect', () => {
  it('lists the four modes and shows the stored one', () => {
    render(<SamplingModeSelect id="d1" value="led" onFail={vi.fn()} />);
    expect(trigger().textContent).toContain('lighting.ledMap.samplingLed');
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'lighting.ledMap.samplingLed',
      'lighting.ledMap.samplingNearest',
      'lighting.ledMap.samplingRows',
      'lighting.ledMap.samplingColumns',
    ]);
  });

  it('posts the chosen mode optimistically, then reports saved', async () => {
    set.mockResolvedValue({ error: false, msg: '' });
    const onSaved = vi.fn();
    render(<SamplingModeSelect id="d1" value="led" onFail={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.samplingRows' }));
    expect(set).toHaveBeenCalledWith('d1', 'rows');
    expect(trigger().textContent).toContain('lighting.ledMap.samplingRows');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('reverts and reports when the save fails', async () => {
    set.mockResolvedValue({ error: true, msg: 'x' });
    const onFail = vi.fn();
    render(<SamplingModeSelect id="d1" value="led" onFail={onFail} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.samplingNearest' }));
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    expect(trigger().textContent).toContain('lighting.ledMap.samplingLed');
  });

  it('resets to the new card value when the id changes', () => {
    const { rerender } = render(<SamplingModeSelect id="d1" value="columns" onFail={vi.fn()} />);
    expect(trigger().textContent).toContain('lighting.ledMap.samplingColumns');
    rerender(<SamplingModeSelect id="d2" value="led" onFail={vi.fn()} />);
    expect(trigger().textContent).toContain('lighting.ledMap.samplingLed');
  });

  it('lets only the newest response decide', async () => {
    let first: (v: { error: boolean; msg: string }) => void = () => {};
    set.mockReset();
    set.mockImplementationOnce(() => new Promise(res => { first = res; }));
    set.mockResolvedValueOnce({ error: false, msg: '' });
    const onFail = vi.fn();
    const onSaved = vi.fn();
    render(<SamplingModeSelect id="d1" value="led" onFail={onFail} onSaved={onSaved} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.samplingRows' }));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.samplingColumns' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    first({ error: true, msg: 'x' });
    await Promise.resolve();
    await Promise.resolve();
    expect(onFail).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain('lighting.ledMap.samplingColumns');
  });
});
