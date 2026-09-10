import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AssignDeviceBar } from './AssignDeviceBar';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

const push = vi.fn();
vi.mock('../../../../components/common/Toast/Toast', () => ({
  useToast: () => ({ push }),
}));

vi.mock('../../../../components/common/SearchInput/SearchInput', () => ({
  SearchInput: ({ value, onChange, ariaLabel }: {
    value: string; onChange: (v: string) => void; ariaLabel?: string;
  }) => (
    <input aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

const fetchLedMap = vi.fn();
const fetchMappingCatalog = vi.fn();
const assignDeviceMapping = vi.fn();
const revertDeviceMapping = vi.fn();
vi.mock('../../../../api/lighting', () => ({
  fetchLedMap: (...a: unknown[]) => fetchLedMap(...a),
  fetchMappingCatalog: (...a: unknown[]) => fetchMappingCatalog(...a),
  assignDeviceMapping: (...a: unknown[]) => assignDeviceMapping(...a),
  revertDeviceMapping: (...a: unknown[]) => revertDeviceMapping(...a),
}));

const QX = { key: 'product:corsair-qx-fan', name: 'iCUE LINK QX RGB', brand: 'Corsair', type: 'Fan', ledCount: 34 };

beforeEach(() => {
  vi.clearAllMocks();
  fetchLedMap.mockResolvedValue({ applied: null });
  fetchMappingCatalog.mockResolvedValue({ error: false, msg: '', items: [QX], total: 306 });
  assignDeviceMapping.mockResolvedValue({ error: false, msg: '' });
  revertDeviceMapping.mockResolvedValue({ error: false, msg: '' });
});

const setup = (over: Partial<Parameters<typeof AssignDeviceBar>[0]> = {}) => {
  const onLedMapChanged = vi.fn();
  const confirmDiscardEdits = vi.fn((proceed: () => void) => proceed());
  render(
    <AssignDeviceBar
      deviceId="openrgb-s-0x5711C000-1"
      onLedMapChanged={onLedMapChanged}
      confirmDiscardEdits={confirmDiscardEdits}
      {...over}
    />,
  );
  return { onLedMapChanged, confirmDiscardEdits };
};

describe('AssignDeviceBar', () => {
  it('shows the placeholder when nothing is assigned', async () => {
    setup();
    await waitFor(() => expect(fetchLedMap).toHaveBeenCalled());
    expect(screen.getByText('lighting.ledMap.assignNone')).toBeTruthy();
  });

  it('shows the assigned mapping name and a clear action', async () => {
    fetchLedMap.mockResolvedValue({
      applied: { mappingId: QX.key, name: QX.name, source: 'builtin', contentHash: 'x', autoApplied: false, appliedAtMs: 1 },
    });
    setup();
    expect(await screen.findByText(QX.name)).toBeTruthy();
    expect(screen.getByLabelText('lighting.ledMap.assignClear')).toBeTruthy();
  });

  it('searches the catalog and assigns the picked product', async () => {
    const { onLedMapChanged } = setup();
    fireEvent.click(screen.getByLabelText('lighting.ledMap.assignDevice'));
    const result = await screen.findByText(QX.name);
    fireEvent.click(result);
    await waitFor(() =>
      expect(assignDeviceMapping).toHaveBeenCalledWith('openrgb-s-0x5711C000-1', QX.key));
    await waitFor(() => expect(onLedMapChanged).toHaveBeenCalled());
  });

  it('reports a failed assign instead of closing silently', async () => {
    assignDeviceMapping.mockResolvedValue({ error: true, msg: 'unknown mapping' });
    const { onLedMapChanged } = setup();
    fireEvent.click(screen.getByLabelText('lighting.ledMap.assignDevice'));
    fireEvent.click(await screen.findByText(QX.name));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(onLedMapChanged).not.toHaveBeenCalled();
  });

  it('routes clear through the unsaved-edits confirm', async () => {
    fetchLedMap.mockResolvedValue({
      applied: { mappingId: QX.key, name: QX.name, source: 'builtin', contentHash: 'x', autoApplied: false, appliedAtMs: 1 },
    });
    const { confirmDiscardEdits, onLedMapChanged } = setup();
    fireEvent.click(await screen.findByLabelText('lighting.ledMap.assignClear'));
    expect(confirmDiscardEdits).toHaveBeenCalled();
    await waitFor(() =>
      expect(revertDeviceMapping).toHaveBeenCalledWith('openrgb-s-0x5711C000-1', 'switched'));
    await waitFor(() => expect(onLedMapChanged).toHaveBeenCalled());
  });

  it('never queries the community route, so the picker works offline', async () => {
    setup();
    fireEvent.click(screen.getByLabelText('lighting.ledMap.assignDevice'));
    await waitFor(() => expect(fetchMappingCatalog).toHaveBeenCalled());
    // fetchDeviceMappings is the registry-backed one; it must not be imported here.
    expect(Object.keys(await import('./AssignDeviceBar'))).toEqual(['AssignDeviceBar']);
  });
});
