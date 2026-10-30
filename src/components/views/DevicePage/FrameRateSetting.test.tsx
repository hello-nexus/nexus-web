import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameRateSetting } from './FrameRateSetting';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const api = vi.hoisted(() => ({ patchPanelDevice: vi.fn() }));
vi.mock('../../../api/panel', () => ({ patchPanelDevice: api.patchPanelDevice }));

const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../common/Toast/Toast', () => ({ useToastSafe: () => toast }));

const LABEL = 'lighting.ledMap.rateCap';
const OFF = 'lighting.ledMap.rateCapOff';
const HZ = (hz: number) => `lighting.ledMap.rateCapHz:{"hz":${hz}}`;
const trigger = () => screen.getByRole('button', { name: LABEL });
const pick = (name: string) => {
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('option', { name }));
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('FrameRateSetting', () => {
  beforeEach(() => {
    api.patchPanelDevice.mockReset();
    toast.push.mockReset();
  });

  it('lists Off then the lighting frame cap values, in fps-agnostic Hz labels', () => {
    render(<FrameRateSetting recordId="p1" cap={null} />);
    expect(trigger().textContent).toContain(OFF);
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([OFF, ...[30, 20, 15, 10, 5, 1].map(HZ)]);
  });

  it('sends the pick, and 0 for Off', async () => {
    api.patchPanelDevice.mockResolvedValue({ id: 'p1' });
    render(<FrameRateSetting recordId="p1" cap={null} />);
    pick(HZ(15));
    expect(api.patchPanelDevice).toHaveBeenCalledWith('p1', { fpsCap: 15 });
    await waitFor(() => expect(trigger().textContent).toContain(HZ(15)));
    pick(OFF);
    expect(api.patchPanelDevice).toHaveBeenLastCalledWith('p1', { fpsCap: 0 });
  });

  it('a failed save reverts to the confirmed value and toasts', async () => {
    api.patchPanelDevice.mockResolvedValue(null);
    render(<FrameRateSetting recordId="p1" cap={30} />);
    pick(HZ(10));
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith({ title: 'lighting.ledMap.rateCapFailed' }));
    expect(trigger().textContent).toContain(HZ(30));
  });

  it('an older save failing late neither reverts nor toasts over a newer pick', async () => {
    const slow = deferred<unknown>();
    api.patchPanelDevice.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ id: 'p1' });
    render(<FrameRateSetting recordId="p1" cap={null} />);
    pick(HZ(10));
    pick(HZ(5));
    await act(async () => { slow.resolve(null); });
    expect(toast.push).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain(HZ(5));
  });

  it('a newer pick failing after an older one succeeded falls back to the older value', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    api.patchPanelDevice.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<FrameRateSetting recordId="p1" cap={null} />);
    pick(HZ(10));
    pick(HZ(5));
    await act(async () => { first.resolve({ id: 'p1' }); });
    await act(async () => { second.resolve(null); });
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith({ title: 'lighting.ledMap.rateCapFailed' }));
    expect(trigger().textContent).toContain(HZ(10));
  });

  it('a newer pick failing before an older one succeeds ends on the older value', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    api.patchPanelDevice.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<FrameRateSetting recordId="p1" cap={null} />);
    pick(HZ(10));
    pick(HZ(5));
    await act(async () => { second.resolve(null); });
    await act(async () => { first.resolve({ id: 'p1' }); });
    await waitFor(() => expect(trigger().textContent).toContain(HZ(10)));
  });
});
