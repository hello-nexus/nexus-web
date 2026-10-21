import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AreaSamplingToggle } from './AreaSamplingToggle';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));
const set = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/lighting', () => ({ setLightingAreaSampling: set }));

describe('AreaSamplingToggle', () => {
  it('renders the stored state and posts the new one, then reports saved', async () => {
    set.mockResolvedValue({ error: false, msg: '' });
    const onSaved = vi.fn();
    render(<AreaSamplingToggle id="d1" value={false} onFail={vi.fn()} onSaved={onSaved} />);
    const sw = screen.getByRole('switch', { name: 'lighting.ledMap.areaSampling' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(set).toHaveBeenCalledWith('d1', true);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('reverts and reports when the save fails', async () => {
    set.mockResolvedValue({ error: true, msg: 'x' });
    const onFail = vi.fn();
    render(<AreaSamplingToggle id="d1" value={false} onFail={onFail} />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
