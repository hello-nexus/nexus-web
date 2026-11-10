import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorAlertsSection } from './SensorAlertsSection';

const h = vi.hoisted(() => ({
  tempUnit: 'c' as 'c' | 'f',
  frame: null as null | ((data: unknown) => void),
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
  useSensorExtras: () => ({ batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [] }),
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
  await act(async () => { render(<SensorAlertsSection />); });
}

const openFirst = () => fireEvent.click(screen.getAllByRole('button', { name: /CPU Package/ })[0]);

beforeEach(() => {
  vi.clearAllMocks();
  h.tempUnit = 'c';
  h.frame = null;
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
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.enabled' }));
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
});
