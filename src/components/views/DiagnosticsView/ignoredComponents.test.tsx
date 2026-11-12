import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StorageSection } from './StorageSection';
import type { DiagnosticsSmartResponse } from '../../../api/diagnostics';

// The hook itself is covered through the real provider in
// useUiSettings.test.tsx; here it is stubbed so each section's wiring - which
// id it toggles and what it shows while ignored - is what's under test.
const h = vi.hoisted(() => ({
  ignored: new Set<string>(),
  toggle: vi.fn(),
}));

vi.mock('../../../hooks/useUiSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useUiSettings')>();
  return {
    ...actual,
    useUiSettings: () => ({ settings: { smartPollSeconds: {}, smartPollDefaultSeconds: 30, smartPollPerDrive: false }, update: vi.fn() }),
    useIgnoredComponents: () => ({ isIgnored: (id: string) => h.ignored.has(id), toggle: h.toggle }),
  };
});

vi.mock('../../../api/smartPoll', async importActual => ({
  ...(await importActual<typeof import('../../../api/smartPoll')>()),
  fetchSmartPoll: () => Promise.resolve(null),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const smart: DiagnosticsSmartResponse = {
  supported: true,
  drives: [{
    id: 'storage:Z52AFCNF', name: 'ST2000VX008-2E3164', serial: 'Z52AFCNF', bus: 'sata', sizeBytes: null, temperatureC: null,
    powerOnHours: null, powerCycles: null, healthPercent: null, status: 'caution', statusReasons: ['smart.commandTimeout'],
    attributes: [], nvme: null,
  }],
};

beforeEach(() => {
  h.ignored.clear();
  h.toggle.mockClear();
});

describe('per-device ignore wiring', () => {
  it("a drive card's Monitor switch toggles its own health id and swaps its status badge for Not monitored", () => {
    const { rerender } = render(<StorageSection data={smart} loading={false} error={false} onRefresh={() => {}} />);
    expect(screen.getByText('diagnostics.status.watch')).toBeInTheDocument();
    const monitor = screen.getByRole('switch', { name: 'diagnostics.monitor.label' });
    expect(monitor).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(monitor);
    expect(h.toggle).toHaveBeenCalledWith('storage:Z52AFCNF');

    h.ignored.add('storage:Z52AFCNF');
    rerender(<StorageSection data={smart} loading={false} error={false} onRefresh={() => {}} />);
    expect(screen.queryByText('diagnostics.status.watch')).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.monitor.off')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'diagnostics.monitor.label' })).toHaveAttribute('aria-checked', 'false');
  });
});
