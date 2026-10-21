import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RateCapSelect } from './RateCapSelect';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

const api = vi.hoisted(() => ({ setLightingMaxRate: vi.fn() }));
vi.mock('../../../../api/lighting', () => ({ setLightingMaxRate: api.setLightingMaxRate }));

describe('RateCapSelect', () => {
  it('shows Off when no cap is stored and lists the Hz options', () => {
    render(<RateCapSelect id="d1" value={null} onFail={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'lighting.ledMap.rateCap' });
    expect(trigger.textContent).toContain('lighting.ledMap.rateCapOff');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'lighting.ledMap.rateCapOff',
      ...[30, 20, 15, 10, 5, 1].map(hz => `lighting.ledMap.rateCapHz:{"hz":${hz}}`),
    ]);
  });

  it('renders the info tip with the explanation', () => {
    render(<RateCapSelect id="d1" value={null} onFail={vi.fn()} />);
    fireEvent.focus(screen.getByRole('button', { name: 'infoTooltip.ariaLabel' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('lighting.ledMap.rateCapHint');
  });

  it('posts the chosen rate and keeps it', async () => {
    api.setLightingMaxRate.mockResolvedValue({ error: false, msg: '' });
    render(<RateCapSelect id="d1" value={null} onFail={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }));
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.rateCapHz:{"hz":10}' }));
    expect(api.setLightingMaxRate).toHaveBeenCalledWith('d1', 10);
    await waitFor(() => expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":10'));
  });

  it('posts null for Off and reverts with a failure callback on error', async () => {
    api.setLightingMaxRate.mockResolvedValue({ error: true, msg: 'x' });
    const onFail = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={onFail} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }));
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.rateCapOff' }));
    expect(api.setLightingMaxRate).toHaveBeenCalledWith('d1', null);
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":15');
  });

  const pick = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }));
    fireEvent.click(screen.getByRole('option', { name }));
  };
  const HZ = (hz: number) => `lighting.ledMap.rateCapHz:{"hz":${hz}}`;

  it('tells the parent to refetch after a successful save', async () => {
    api.setLightingMaxRate.mockResolvedValue({ error: false, msg: '' });
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={null} onFail={vi.fn()} onSaved={onSaved} />);
    pick(HZ(10));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('follows the stored value when the card or value changes (reopen, zone switch)', () => {
    const { rerender } = render(<RateCapSelect id="a" value={null} onFail={vi.fn()} />);
    rerender(<RateCapSelect id="b" value={5} onFail={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
    rerender(<RateCapSelect id="a" value={10} onFail={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":10');
  });

  it('ignores a stale failure when a newer request is in flight', async () => {
    let failFirst: (v: unknown) => void = () => {};
    api.setLightingMaxRate
      .mockImplementationOnce(() => new Promise(res => { failFirst = res; }))
      .mockResolvedValueOnce({ error: false, msg: '' });
    const onFail = vi.fn();
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={null} onFail={onFail} onSaved={onSaved} />);
    pick(HZ(30));
    pick(HZ(5));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    failFirst({ error: true, msg: 'x' });
    await Promise.resolve();
    await Promise.resolve();
    expect(onFail).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
  });

  it('does not revert or report when the card changed during the request', async () => {
    let failFirst: (v: unknown) => void = () => {};
    api.setLightingMaxRate.mockImplementationOnce(() => new Promise(res => { failFirst = res; }));
    const onFail = vi.fn();
    const { rerender } = render(<RateCapSelect id="a" value={null} onFail={onFail} />);
    pick(HZ(10));
    rerender(<RateCapSelect id="b" value={20} onFail={onFail} />);
    failFirst({ error: true, msg: 'x' });
    await Promise.resolve();
    await Promise.resolve();
    expect(onFail).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":20');
  });

  it('keeps a newer pick when an older save refetch lands while it is pending', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate.mockImplementation(() => new Promise(res => { resolvers.push(res); }));
    const { rerender } = render(<RateCapSelect id="d1" value={null} onFail={vi.fn()} />);
    pick(HZ(30));
    pick(HZ(5));
    rerender(<RateCapSelect id="d1" value={30} onFail={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
    resolvers.forEach(r => r({ error: false, msg: '' }));
    await waitFor(() => expect(api.setLightingMaxRate).toHaveBeenCalledTimes(2));
    rerender(<RateCapSelect id="d1" value={5} onFail={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
  });
});
