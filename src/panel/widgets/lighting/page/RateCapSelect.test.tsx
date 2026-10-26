import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  beforeEach(() => { api.setLightingMaxRate.mockReset(); });

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
    const { rerender } = render(<RateCapSelect key="a" id="a" value={null} onFail={vi.fn()} />);
    rerender(<RateCapSelect key="b" id="b" value={5} onFail={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
    rerender(<RateCapSelect key="a" id="a" value={10} onFail={vi.fn()} />);
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
    await act(async () => {});
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => { failFirst({ error: true, msg: 'x' }); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
  });

  it('does not revert or report failure when the card was remounted during the request', async () => {
    let failFirst: (v: unknown) => void = () => {};
    api.setLightingMaxRate.mockImplementationOnce(() => new Promise(res => { failFirst = res; }));
    const onFail = vi.fn();
    const { rerender } = render(<RateCapSelect key="a" id="a" value={null} onFail={onFail} />);
    pick(HZ(10));
    rerender(<RateCapSelect key="b" id="b" value={20} onFail={onFail} />);
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

  it('reverts to the last confirmed value after a success then a failure', async () => {
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate
      .mockResolvedValueOnce({ error: false, msg: '' })
      .mockResolvedValueOnce({ error: true, msg: 'x' });
    const onFail = vi.fn();
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={null} onFail={onFail} onSaved={onSaved} />);
    pick(HZ(10));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    pick(HZ(5));
    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":10');
  });

  it('reverts to the confirmed value, not an unconfirmed earlier pick', async () => {
    let failFirst: (v: unknown) => void = () => {};
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate
      .mockImplementationOnce(() => new Promise(res => { failFirst = res; }))
      .mockResolvedValueOnce({ error: true, msg: 'x' });
    const onFail = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={onFail} />);
    pick(HZ(30));
    pick(HZ(5));
    failFirst({ error: true, msg: 'x' });
    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":15');
  });

  it('ignores a late success from the previous card when reverting on the new card', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate
      .mockImplementationOnce(() => new Promise(res => { resolvers.push(res); }))
      .mockResolvedValueOnce({ error: true, msg: 'x' });
    const onFail = vi.fn();
    const { rerender } = render(<RateCapSelect key="a" id="a" value={null} onFail={onFail} />);
    pick(HZ(30));
    rerender(<RateCapSelect key="b" id="b" value={20} onFail={onFail} />);
    await act(async () => { resolvers[0]({ error: false, msg: '' }); });
    pick(HZ(5));
    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":20');
  });

  it('keeps the newest confirmation when an older success lands after it', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate
      .mockImplementationOnce(() => new Promise(res => { resolvers.push(res); }))
      .mockResolvedValueOnce({ error: false, msg: '' })
      .mockResolvedValueOnce({ error: true, msg: 'x' });
    const onFail = vi.fn();
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={null} onFail={onFail} onSaved={onSaved} />);
    pick(HZ(30));
    pick(HZ(5));
    await act(async () => {});
    await act(async () => { resolvers[0]({ error: false, msg: '' }); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    pick(HZ(1));
    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":5');
  });

  it('syncs the display to the confirmed value when an older success lands after the newest failed', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate
      .mockImplementationOnce(() => new Promise(res => { resolvers.push(res); }))
      .mockResolvedValueOnce({ error: true, msg: 'x' });
    const onFail = vi.fn();
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={onFail} onSaved={onSaved} />);
    pick(HZ(30));
    pick(HZ(5));
    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    resolvers[0]({ error: false, msg: '' });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent).toContain('"hz":30');
  });

  const shownHz = () => screen.getByRole('button', { name: 'lighting.ledMap.rateCap' }).textContent;

  it('ends on the confirmed value when C fails, A succeeds, then B fails', async () => {
    const r: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate.mockImplementation(() => new Promise(res => { r.push(res); }));
    const onFail = vi.fn();
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={onFail} onSaved={onSaved} />);
    pick(HZ(30));
    pick(HZ(20));
    pick(HZ(5));
    await act(async () => { r[2]({ error: true, msg: 'x' }); });
    expect(onFail).toHaveBeenCalledTimes(1);
    await act(async () => { r[0]({ error: false, msg: '' }); });
    await act(async () => { r[1]({ error: true, msg: 'x' }); });
    expect(shownHz()).toContain('"hz":30');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('ends on the confirmed value when C fails, B succeeds, then A succeeds', async () => {
    const r: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate.mockImplementation(() => new Promise(res => { r.push(res); }));
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={vi.fn()} onSaved={onSaved} />);
    pick(HZ(30));
    pick(HZ(20));
    pick(HZ(5));
    await act(async () => { r[2]({ error: true, msg: 'x' }); });
    await act(async () => { r[1]({ error: false, msg: '' }); });
    await act(async () => { r[0]({ error: false, msg: '' }); });
    expect(shownHz()).toContain('"hz":20');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('notifies the parent once when A succeeds and then B fails and reverts to A', async () => {
    const r: Array<(v: unknown) => void> = [];
    api.setLightingMaxRate.mockReset();
    api.setLightingMaxRate.mockImplementation(() => new Promise(res => { r.push(res); }));
    const onSaved = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={vi.fn()} onSaved={onSaved} />);
    pick(HZ(30));
    pick(HZ(5));
    await act(async () => { r[0]({ error: false, msg: '' }); });
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => { r[1]({ error: true, msg: 'x' }); });
    expect(shownHz()).toContain('"hz":30');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('asks the parent to refetch when the outcome is unknown (rejected request)', async () => {
    api.setLightingMaxRate.mockRejectedValue(new Error('net'));
    const onSaved = vi.fn();
    const onFail = vi.fn();
    render(<RateCapSelect id="d1" value={15} onFail={onFail} onSaved={onSaved} />);
    pick(HZ(5));
    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(shownHz()).toContain('"hz":15');
  });
});
