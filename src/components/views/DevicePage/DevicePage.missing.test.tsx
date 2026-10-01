import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DevicePage } from './DevicePage';

const unifiedState = { turnedOffMonitorKeys: new Set<string>() };
vi.mock('../../../hooks/useUnifiedDevices', () => ({
  useUnifiedDevices: () => ({ unified: [], controlDevice: vi.fn(), turnedOffMonitorKeys: unifiedState.turnedOffMonitorKeys }),
}));

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));

const t = (key: string) => key;
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t }),
}));

describe('DevicePage for a device that is not listed', () => {
  beforeEach(() => {
    unifiedState.turnedOffMonitorKeys = new Set();
  });

  it('returns to Devices when the monitor was turned off', async () => {
    unifiedState.turnedOffMonitorKeys = new Set(['panel-display:rec-1']);
    const onSectionNavigate = vi.fn();
    render(
      <DevicePage deviceKey="panel-display:rec-1" serviceOnline connectionState="online" onSectionNavigate={onSectionNavigate} />,
    );
    await waitFor(() => expect(onSectionNavigate).toHaveBeenCalledWith('devices'));
  });

  it('stays put while a monitor row is merely absent (still loading, failed refresh, unplugged)', async () => {
    const onSectionNavigate = vi.fn();
    const { findByText } = render(
      <DevicePage deviceKey="panel-display:rec-1" serviceOnline connectionState="online" onSectionNavigate={onSectionNavigate} />,
    );
    expect(await findByText('devices.page.notConnected', undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(onSectionNavigate).not.toHaveBeenCalled();
  });
});
