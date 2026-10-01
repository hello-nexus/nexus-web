import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useReportDeviceWaiting } from './deviceDetecting';

// Turning Nexus Control on from the device page holds a "Detecting device..."
// screen until the device page's own poll reports the device, instead of
// flashing that page's not-connected state while the service opens it.

const h = vi.hoisted(() => ({
  setConnected: null as ((v: boolean) => void) | null,
  mounts: 0,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('./LianLiWirelessDevicePage', () => ({
  LianLiWirelessDevicePage: function FakeWirelessPage() {
    const [connected, setConnected] = useState(false);
    h.setConnected = setConnected;
    useEffect(() => { h.mounts += 1; }, []);
    useReportDeviceWaiting(!connected);
    return <div data-testid="wireless-page">{connected ? 'connected' : 'devices.lianli-wireless.notConnected'}</div>;
  },
}));
vi.mock('./CnvsDevicePage', () => ({
  CnvsDevicePage: () => <div data-testid="cnvs-page" />,
}));

function curated(curatedId: string, enabled: boolean): UnifiedDevice {
  return {
    key: `curated-${curatedId}`,
    shortName: curatedId,
    name: curatedId === 'lianli-wireless' ? 'Lian Li L-Wireless Controller' : 'CNVS',
    subtitle: '',
    category: 'cooler',
    iconSrc: '',
    connected: true,
    kind: 'curated',
    curatedId,
    navigable: true,
    nexusControlEnabled: enabled,
    supportsNexusControl: true,
    experimental: false,
  };
}

vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => {
  const { useState: useStateReal } = await import('react');
  return {
    ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
    useUnifiedDevices: () => {
      const [enabled, setEnabled] = useStateReal<Record<string, boolean>>({});
      return {
        unified: ['lianli-wireless', 'cnvs'].map(id => curated(id, !!enabled[id])),
        controlDevice: async (id: string, next: boolean) => { setEnabled(prev => ({ ...prev, [id]: next })); },
      };
    },
  };
});

import { DevicePage } from './DevicePage';

beforeEach(() => {
  h.setConnected = null;
  h.mounts = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DevicePage detecting after Nexus Control turns on', () => {
  it('holds the detecting screen on the same card until the page reports its device, then reveals that page instance', () => {
    render(<DevicePage deviceKey="curated-lianli-wireless" serviceOnline />);
    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });

    fireEvent.click(toggle);

    expect(screen.getByText('devices.nexusControlOff.detecting')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'devices.nexusControl' })).toBe(toggle);
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId('wireless-page').parentElement?.className).toMatch(/bodyHeld/);

    act(() => { h.setConnected?.(true); });

    expect(screen.queryByText('devices.nexusControlOff.detecting')).not.toBeInTheDocument();
    expect(screen.getByTestId('wireless-page')).toHaveTextContent('connected');
    expect(screen.getByTestId('wireless-page').parentElement?.className).toMatch(/bodyShown/);
    expect(h.mounts).toBe(1);
  });

  it('falls back to the page after the detect window when the device never reports', () => {
    vi.useFakeTimers();
    render(<DevicePage deviceKey="curated-lianli-wireless" serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));
    expect(screen.getByText('devices.nexusControlOff.detecting')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.queryByText('devices.nexusControlOff.detecting')).not.toBeInTheDocument();
    expect(screen.getByTestId('wireless-page')).toHaveTextContent('devices.lianli-wireless.notConnected');
  });

  it('drops the hold when the user leaves for another device before detection lands', () => {
    const { rerender } = render(<DevicePage deviceKey="curated-lianli-wireless" serviceOnline />);
    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));
    expect(screen.getByText('devices.nexusControlOff.detecting')).toBeInTheDocument();

    rerender(<DevicePage deviceKey="curated-elsewhere" serviceOnline />);
    rerender(<DevicePage deviceKey="curated-lianli-wireless" serviceOnline />);

    expect(screen.queryByText('devices.nexusControlOff.detecting')).not.toBeInTheDocument();
    expect(screen.getByTestId('wireless-page').parentElement?.className).toMatch(/bodyShown/);
  });

  it('reveals a page with no connection state at once', () => {
    render(<DevicePage deviceKey="curated-cnvs" serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));

    expect(screen.queryByText('devices.nexusControlOff.detecting')).not.toBeInTheDocument();
    expect(screen.getByTestId('cnvs-page').parentElement?.className).toMatch(/bodyShown/);
  });
});
