import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticsTabSettings } from './DiagnosticsTabSettings';

const update = vi.fn();
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../hooks/useUiSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useUiSettings')>();
  return { ...actual, useUiSettings: () => ({ settings: mockSettings, update, reload: vi.fn() }) };
});
vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('DiagnosticsTabSettings', () => {
  it('puts GPU and system monitoring and the device problem notification on the System tab', () => {
    mockSettings = { diagnosticsNotificationsEnabled: true, diagnosticsComponentGpu: true, diagnosticsComponentSystem: true };
    update.mockClear();
    render(<DiagnosticsTabSettings tab="system" />);
    expect(screen.getAllByRole('switch').map(el => el.getAttribute('aria-label'))).toEqual([
      'diagnostics.monitorComponent.gpu', 'diagnostics.monitorComponent.system',
      'diagnostics.notify.systemDevices',
    ]);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.monitorComponent.gpu' }));
    expect(update).toHaveBeenCalledWith({ diagnosticsComponentGpu: false });
  });

  it('puts the GPU throttle notification on the Cooling tab, where its alert opens', () => {
    mockSettings = { diagnosticsNotificationsEnabled: true };
    update.mockClear();
    render(<DiagnosticsTabSettings tab="cooling" />);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.notify.gpuThrottle' }));
    expect(update).toHaveBeenCalledWith({ diagnosticsNotifyGpuThrottle: true });
  });

  it.each([
    ['storage', 'diagnostics.monitorComponent.storage', 'diagnostics.notify.storage', 'diagnosticsNotifyStorageHealth'],
    ['memory', 'diagnostics.monitorComponent.ram', 'diagnostics.notify.memoryTest', 'diagnosticsNotifyMemoryTest'],
    ['cooling', 'diagnostics.monitorComponent.cooling', 'diagnostics.notify.cooling', 'diagnosticsNotifyCooling'],
  ] as const)('%s tab carries its monitor switch and its notification switch', (tab, monitor, notify, field) => {
    mockSettings = { diagnosticsNotificationsEnabled: true };
    update.mockClear();
    render(<DiagnosticsTabSettings tab={tab} />);
    expect(screen.getByRole('switch', { name: monitor })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: notify }));
    expect(update).toHaveBeenCalledWith({ [field]: true });
  });

  it('disables a notification switch, and says why, while the master is off', () => {
    mockSettings = { diagnosticsNotificationsEnabled: false };
    render(<DiagnosticsTabSettings tab="storage" />);
    expect(screen.getByRole('switch', { name: 'diagnostics.notify.storage' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'diagnostics.monitorComponent.storage' })).not.toBeDisabled();
    expect(screen.getByText('diagnostics.notify.masterOff')).toBeInTheDocument();
  });

  it('renders nothing for a tab without switches', () => {
    mockSettings = {};
    const { container } = render(<DiagnosticsTabSettings tab="gpu" />);
    expect(container).toBeEmptyDOMElement();
  });
});
