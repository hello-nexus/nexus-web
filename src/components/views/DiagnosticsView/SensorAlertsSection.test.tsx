import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorAlertsSection } from './SensorAlertsSection';

const scroll = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../search/scroll', () => ({ requestSearchScroll: scroll.request }));

const h = vi.hoisted(() => ({
  tempUnit: 'c' as 'c' | 'f',
  frame: null as null | ((data: unknown) => void),
  connected: true,
  push: vi.fn(),
  fetchSensorAlerts: vi.fn(),
  createSensorAlert: vi.fn(),
  updateSensorAlert: vi.fn(),
  deleteSensorAlert: vi.fn(),
}));

vi.mock('../../../api/diagnosticsAlerts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/diagnosticsAlerts')>()),
  fetchSensorAlerts: h.fetchSensorAlerts,
  createSensorAlert: h.createSensorAlert,
  updateSensorAlert: h.updateSensorAlert,
  deleteSensorAlert: h.deleteSensorAlert,
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useMultiplex: () => ({ connected: h.connected }),
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    if (topic === 'diagnostics/alerts' && enabled) h.frame = cb;
  },
}));

vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUnitPrefs: () => ({ monitoringTempUnit: h.tempUnit, numberFormat: 'dot', timeFormat: 'system', monitoringWholeNumbers: false, dateFormat: 'system' }),
}));

vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: h.push }) }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

// The native <select> stands in for the themed one; these tests exercise the section's wiring.
vi.mock('../../common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void; options?: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      <option value="" />
      {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

const sensor = (id: string, name: string, type: string, value: number, units: string) => ({
  id, name, type, value, units, formatted: `${value}${units}`, parent: { id: 'p', name: 'p' },
});

vi.mock('../../../hooks/useSensors', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useSensors')>();
  return {
    ...actual,
    useSensors: () => ({
      summary: [],
      cpu: [sensor('cpu/load/0', 'CPU Total', 'Load', 12, '%'), sensor('cpu/temp/0', 'CPU Package', 'Temperature', 62, '°C')],
      gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {}, storageSensors: [],
      motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
    }),
  };
});
vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({ batteries: [], nics: [], coolers: [], fanSensors: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [] }),
}));

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});

const okState = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => ({
  ruleId, state: 'ok', value: 62, since: null, extreme: null, direction: null, acknowledged: false, ...over,
});

async function renderSection(rules: SensorAlertRule[], states: SensorAlertState[] = []) {
  h.fetchSensorAlerts.mockResolvedValue({ ok: true, status: 200, data: { rules, states, history: [] } });
  h.updateSensorAlert.mockImplementation(async (r: SensorAlertRule) => ({ ok: true, status: 200, data: r }));
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<SensorAlertsSection />); });
  return utils;
}

const openFirst = () => fireEvent.click(screen.getAllByRole('button', { name: /CPU Package/ })[0]);

beforeEach(() => {
  vi.clearAllMocks();
  h.tempUnit = 'c';
  h.frame = null;
  h.connected = true;
});

describe('SensorAlertsSection', () => {
  it('lists each rule with its sensor name, live value and state chip', async () => {
    await renderSection([rule('r1')], [okState('r1', { state: 'pending' })]);
    expect(screen.getByText('CPU Package')).toBeInTheDocument();
    expect(screen.getByText('62°C')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.alerts.state.pending')).toBeInTheDocument();
  });

  it('follows state frames from the websocket topic', async () => {
    await renderSection([rule('r1')], [okState('r1')]);
    expect(screen.getByText('diagnostics.alerts.state.ok')).toBeInTheDocument();
    await act(async () => { h.frame!({ states: [okState('r1', { state: 'active', direction: 'above' })] }); });
    expect(screen.getByText('diagnostics.alerts.state.active')).toBeInTheDocument();
  });

  it('adds a rule on the first picker sensor with the upper limit at the reading times 1.2 and the lower limit off', async () => {
    await renderSection([]);
    const created = rule('new', { sensor: { category: 'cpu', id: 'cpu/load/0', name: 'CPU Total', type: 'Load', parentName: 'p' }, high: 14 });
    h.createSensorAlert.mockResolvedValue({ ok: true, status: 201, data: created });
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.add' }));
    await waitFor(() => expect(h.createSensorAlert).toHaveBeenCalledTimes(1));
    expect(h.createSensorAlert.mock.calls[0][0]).toMatchObject({
      enabled: true,
      sensor: { category: 'cpu', id: 'cpu/load/0', name: 'CPU Total', type: 'Load', parentName: 'p' },
      low: null,
      high: 14,
    });
    expect(h.createSensorAlert.mock.calls[0][0]).not.toHaveProperty('id');
    expect(await screen.findByText('CPU Total')).toBeInTheDocument();
  });

  it('disables Add at ten rules and explains why', async () => {
    const rules = Array.from({ length: 10 }, (_, i) => rule(`r${i}`));
    await renderSection(rules);
    expect(screen.getByRole('button', { name: 'diagnostics.alerts.add' })).toBeDisabled();
    expect(screen.getByText('diagnostics.alerts.limitNote(max=10)')).toBeInTheDocument();
  });

  it('keeps Add enabled below the limit', async () => {
    await renderSection([rule('r1')]);
    expect(screen.getByRole('button', { name: 'diagnostics.alerts.add' })).toBeEnabled();
    expect(screen.queryByText(/limitNote/)).toBeNull();
  });

  it('writes the full rule when a toggle changes', async () => {
    await renderSection([rule('r1')]);
    openFirst();
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.below' }));
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenCalledTimes(1));
    const sent = h.updateSensorAlert.mock.calls[0][0] as SensorAlertRule;
    expect(sent).toMatchObject({ id: 'r1', high: 80, severity: 'watch', notifyDesktop: true, showInHealth: true });
    expect(sent.low).toBeLessThan(80);
    expect(sent.low).not.toBeNull();
  });

  it('writes the severity and the enabled switch', async () => {
    await renderSection([rule('r1')]);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.enabledFor(name=CPU Package)' }));
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1', enabled: false })));
    openFirst();
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.incidents.severity.critical' }));
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1', severity: 'act' })));
  });

  it('will not switch off the last remaining limit', async () => {
    await renderSection([rule('r1')]);
    openFirst();
    expect(screen.getByRole('switch', { name: 'diagnostics.alerts.above' })).toBeDisabled();
  });

  it('reverts to the service list when a write is refused', async () => {
    await renderSection([rule('r1')]);
    h.updateSensorAlert.mockResolvedValue({ ok: false, status: 400, data: null });
    openFirst();
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.notifyDesktop' }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.saveFailed' }));
    expect(h.fetchSensorAlerts).toHaveBeenCalledTimes(2);
  });

  it('deletes a rule after confirmation', async () => {
    await renderSection([rule('r1')]);
    h.deleteSensorAlert.mockResolvedValue({ ok: true, status: 204, data: null });
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(h.deleteSensorAlert).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(screen.queryByText('CPU Package')).toBeNull());
  });

  it('shows and edits Fahrenheit while storing Celsius', async () => {
    h.tempUnit = 'f';
    await renderSection([rule('r1', { high: 80 })]);
    expect(screen.getByText('143.6°F')).toBeInTheDocument();
    openFirst();
    expect(screen.getByRole('slider', { name: 'diagnostics.alerts.highKnob' })).toHaveValue('176');
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.highKnob' }));
    const field = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '194' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenCalledTimes(1));
    expect(h.updateSensorAlert.mock.calls[0][0]).toMatchObject({ id: 'r1', high: 90 });
  });

  it('widens the track when a typed limit is past its end', async () => {
    await renderSection([rule('r1', { high: 80 })]);
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.highKnob' }));
    const field = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '150' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenCalledWith(expect.objectContaining({ high: 150 })));
    expect(screen.getByRole('slider', { name: 'diagnostics.alerts.highKnob' })).toHaveAttribute('max', '150');
  });

  it('writes a delay picked in seconds, and shows an off-list stored delay as its own option', async () => {
    await renderSection([rule('r1', { raiseAfterSeconds: 7 })]);
    openFirst();
    const raise = screen.getByRole('combobox', { name: 'diagnostics.alerts.raiseAfter' }) as HTMLSelectElement;
    expect(raise.value).toBe('7');
    expect(within(raise).getAllByRole('option').map(o => o.getAttribute('value'))).toEqual(['', '0', '5', '7', '10', '15', '30', '60', '180', '300']);
    fireEvent.change(raise, { target: { value: '30' } });
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1', raiseAfterSeconds: 30, clearAfterSeconds: 5 })));
    fireEvent.change(screen.getByRole('combobox', { name: 'diagnostics.alerts.clearAfter' }), { target: { value: '0' } });
    await waitFor(() => expect(h.updateSensorAlert).toHaveBeenLastCalledWith(expect.objectContaining({ clearAfterSeconds: 0 })));
  });

  describe('focus from the Summary list', () => {
    it('opens the rule card, scrolls to its anchor and reports it handled', async () => {
      const onFocused = vi.fn();
      h.fetchSensorAlerts.mockResolvedValue({ ok: true, status: 200, data: { rules: [rule('r1'), rule('r2', { sensor: { category: 'cpu', id: 'cpu/load/0', name: 'CPU Total', type: 'Load', parentName: 'p' } })], states: [], history: [] } });
      await act(async () => { render(<SensorAlertsSection focusRuleId="r2" onFocused={onFocused} />); });
      expect(scroll.request).toHaveBeenCalledWith('sensor-alert-r2');
      expect(onFocused).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /CPU Total/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /CPU Package/ })).toHaveAttribute('aria-expanded', 'false');
      expect(document.querySelector('[data-search-anchor="sensor-alert-r2"]')).not.toBeNull();
    });

    it('drops a request for a rule that no longer exists without scrolling', async () => {
      const onFocused = vi.fn();
      h.fetchSensorAlerts.mockResolvedValue({ ok: true, status: 200, data: { rules: [rule('r1')], states: [], history: [] } });
      await act(async () => { render(<SensorAlertsSection focusRuleId="gone" onFocused={onFocused} />); });
      expect(scroll.request).not.toHaveBeenCalled();
      expect(onFocused).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading and resync', () => {
    it('shows an error with retry until the list loads, and keeps Add disabled', async () => {
      h.fetchSensorAlerts.mockResolvedValue({ ok: false, status: 500, data: null });
      await act(async () => { render(<SensorAlertsSection />); });
      expect(screen.getByText('diagnostics.loadFailed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'diagnostics.alerts.add' })).toBeDisabled();
      h.fetchSensorAlerts.mockResolvedValue({ ok: true, status: 200, data: { rules: [rule('r1')], states: [] } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'diagnostics.retry' })); });
      expect(screen.getByText('CPU Package')).toBeInTheDocument();
      expect(screen.queryByText('diagnostics.loadFailed')).toBeNull();
      expect(screen.getByRole('button', { name: 'diagnostics.alerts.add' })).toBeEnabled();
    });

    it('keeps Add disabled while the first fetch is pending', async () => {
      h.fetchSensorAlerts.mockReturnValue(new Promise(() => {}));
      await act(async () => { render(<SensorAlertsSection />); });
      expect(screen.getByRole('button', { name: 'diagnostics.alerts.add' })).toBeDisabled();
    });

    it('refetches after the socket reconnects, so a stale active state clears', async () => {
      h.connected = false;
      const utils = await renderSection([rule('r1')], [okState('r1', { state: 'active', direction: 'above' })]);
      expect(screen.getByText('diagnostics.alerts.state.active')).toBeInTheDocument();
      h.fetchSensorAlerts.mockResolvedValue({ ok: true, status: 200, data: { rules: [rule('r1')], states: [okState('r1')] } });
      h.connected = true;
      await act(async () => { utils.rerender(<SensorAlertsSection />); });
      expect(h.fetchSensorAlerts).toHaveBeenCalledTimes(2);
      expect(screen.getByText('diagnostics.alerts.state.ok')).toBeInTheDocument();
    });

    it('refetches when the window regains focus', async () => {
      await renderSection([rule('r1')]);
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      expect(h.fetchSensorAlerts).toHaveBeenCalledTimes(2);
    });
  });

  describe('write queue', () => {
    function deferred() {
      let resolve!: (v: { ok: boolean; status: number; data: SensorAlertRule | null }) => void;
      const promise = new Promise<{ ok: boolean; status: number; data: SensorAlertRule | null }>(r => { resolve = r; });
      return { promise, resolve };
    }
    const ok = (r: SensorAlertRule) => ({ ok: true, status: 200, data: r });

    it('coalesces edits made while a write is in flight into one newest write', async () => {
      await renderSection([rule('r1')]);
      const first = deferred();
      h.updateSensorAlert.mockReset();
      h.updateSensorAlert.mockReturnValueOnce(first.promise);
      h.updateSensorAlert.mockImplementation(async (r: SensorAlertRule) => ok(r));
      openFirst();
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.notifyDesktop' }));
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.showInHealth' }));
      fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.incidents.severity.critical' }));
      expect(h.updateSensorAlert).toHaveBeenCalledTimes(1);
      await act(async () => { first.resolve(ok(rule('r1'))); });
      await waitFor(() => expect(h.updateSensorAlert).toHaveBeenCalledTimes(2));
      expect(h.updateSensorAlert.mock.calls[1][0]).toMatchObject({ notifyDesktop: false, showInHealth: false, severity: 'act' });
    });

    it('sends the newest edit after a refused write instead of dropping it', async () => {
      await renderSection([rule('r1')]);
      const first = deferred();
      h.updateSensorAlert.mockReset();
      h.updateSensorAlert.mockReturnValueOnce(first.promise);
      h.updateSensorAlert.mockImplementation(async (r: SensorAlertRule) => ok(r));
      openFirst();
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.notifyDesktop' }));
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.showInHealth' }));
      await act(async () => { first.resolve({ ok: false, status: 400, data: null }); });
      await waitFor(() => expect(h.updateSensorAlert).toHaveBeenCalledTimes(2));
      expect(h.updateSensorAlert.mock.calls[1][0]).toMatchObject({ showInHealth: false });
      expect(h.push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.saveFailed' });
      expect(h.fetchSensorAlerts).toHaveBeenCalledTimes(1);
    });

    it('sends a queued edit even when the page is left mid-write', async () => {
      const utils = await renderSection([rule('r1')]);
      const first = deferred();
      h.updateSensorAlert.mockReset();
      h.updateSensorAlert.mockReturnValueOnce(first.promise);
      h.updateSensorAlert.mockImplementation(async (r: SensorAlertRule) => ok(r));
      openFirst();
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.notifyDesktop' }));
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.showInHealth' }));
      utils.unmount();
      await act(async () => { first.resolve(ok(rule('r1'))); });
      await waitFor(() => expect(h.updateSensorAlert).toHaveBeenCalledTimes(2));
      expect(h.updateSensorAlert.mock.calls[1][0]).toMatchObject({ showInHealth: false });
    });

    it('waits for a write in flight before deleting, with no failure toast', async () => {
      await renderSection([rule('r1')]);
      const first = deferred();
      h.updateSensorAlert.mockReset();
      h.updateSensorAlert.mockReturnValueOnce(first.promise);
      h.deleteSensorAlert.mockResolvedValue({ ok: true, status: 204, data: null });
      openFirst();
      fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.notifyDesktop' }));
      fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));
      await act(async () => {});
      expect(h.deleteSensorAlert).not.toHaveBeenCalled();
      await act(async () => { first.resolve({ ok: false, status: 404, data: null }); });
      await waitFor(() => expect(h.deleteSensorAlert).toHaveBeenCalledWith('r1'));
      expect(h.push).not.toHaveBeenCalled();
    });

    it('sends one create for a double click on Add', async () => {
      await renderSection([]);
      const pending = deferred();
      h.createSensorAlert.mockReturnValue(pending.promise);
      const add = screen.getByRole('button', { name: 'diagnostics.alerts.add' });
      fireEvent.click(add);
      fireEvent.click(add);
      expect(h.createSensorAlert).toHaveBeenCalledTimes(1);
      await act(async () => { pending.resolve({ ok: false, status: 500, data: null }); });
    });
  });
});
