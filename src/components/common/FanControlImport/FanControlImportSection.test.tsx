import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FanControlImportSection } from './FanControlImportSection';
import { applyFanControlImport, previewFanControlImport } from '../../../api/fancontrol';
import type { FanControlConfigFile, FanControlPreviewResponse } from '../../../api/fancontrol';

vi.mock('../../../api/fancontrol', () => ({
  previewFanControlImport: vi.fn(),
  applyFanControlImport: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return `${key}:${Object.values(params).join(',')}`;
    },
  }),
}));

const CONFIGS: FanControlConfigFile[] = [
  { path: 'C:\\FanControl\\Configurations\\userConfig.json', name: 'userConfig', modifiedUnixMs: 2, isDefault: true },
  { path: 'C:\\FanControl\\Configurations\\quiet.json', name: 'quiet', modifiedUnixMs: 1, isDefault: false },
];

const PREVIEW: FanControlPreviewResponse = {
  available: true,
  configName: 'userConfig',
  version: 215,
  curves: [
    { name: 'CPU Graph', sourceKind: 'graph', targetType: 'Graph', supported: true, sensorName: 'Core', fanNames: ['CPU Fan'] },
    { name: 'RPM Target', sourceKind: 'flat', targetType: '', supported: false, reasonCode: 'rpmMode' as const, fanNames: [] },
  ],
  fans: [
    { identifier: '/lpc/it8696e/control/0', sourceName: 'CPU Fan', channelId: '/lpc/it8696e/0/control/0', channelName: 'CPU', match: 'normalized', hasCalibration: true, offset: 0 },
    { identifier: '/lpc/it8696e/control/3', sourceName: 'Fan #4', channelId: null, channelName: null, match: 'none', hasCalibration: false, offset: 0 },
  ],
  skipped: [{ code: 'fansMissing' as const, count: 1 }],
  curveCount: 1,
  calibrationCount: 3,
  nameCount: 2,
  offsetCount: 0,
  manualCount: 0,
  error: false,
  msg: 'Ok',
};

const APPLY_BUTTON = 'fanControlImport.action';

function renderSection(props: Partial<Parameters<typeof FanControlImportSection>[0]> = {}) {
  return render(<FanControlImportSection open configs={CONFIGS} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewFanControlImport).mockResolvedValue(PREVIEW);
  vi.mocked(applyFanControlImport).mockResolvedValue({
    error: false, msg: 'Ok', curvesImported: 1, calibrationsImported: 3, namesImported: 2, offsetsImported: 0, manualImported: 0,
  });
});

describe('FanControlImportSection', () => {
  it('previews the default config on open, once', async () => {
    renderSection();
    await waitFor(() => expect(previewFanControlImport).toHaveBeenCalledWith(CONFIGS[0].path));
    expect(previewFanControlImport).toHaveBeenCalledTimes(1);
  });

  it('translates every note about what is being left behind', async () => {
    renderSection();
    expect(await screen.findByText('fanControlImport.skip.fansMissing.one:1')).toBeInTheDocument();
  });

  it('offers only the categories that have something to import', async () => {
    renderSection();
    await screen.findByText('fanControlImport.category.curves');
    expect(screen.getByText('fanControlImport.category.calibration')).toBeInTheDocument();
    expect(screen.getByText('fanControlImport.category.names')).toBeInTheDocument();
    // Offsets and fixed speeds are zero in this preview.
    expect(screen.queryByText('fanControlImport.category.offsets')).not.toBeInTheDocument();
    expect(screen.queryByText('fanControlImport.category.manual')).not.toBeInTheDocument();
  });

  it('lists curves with what they map to, and why one cannot come over', async () => {
    renderSection();
    await screen.findByText('CPU Graph');
    expect(screen.getByText('fanControlImport.curveType.graph')).toBeInTheDocument();
    // The service sends a code; the wording comes from the locale file.
    expect(screen.getByText('fanControlImport.reason.rpmMode:')).toBeInTheDocument();
  });

  it('shows how each fan matched, including the ones this PC does not have', async () => {
    renderSection();
    // "CPU Fan" shows twice: once as the curve's fan, once as its own row.
    await screen.findAllByText('CPU Fan');
    // The matched channel and how it was matched read as one line.
    expect(screen.getByText('CPU (fanControlImport.match.normalized)')).toBeInTheDocument();
    expect(screen.getAllByText('fanControlImport.match.none').length).toBeGreaterThan(0);
  });

  it('applies every available category by default', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: APPLY_BUTTON }));
    await waitFor(() => expect(applyFanControlImport).toHaveBeenCalledTimes(1));
    const [path, categories] = vi.mocked(applyFanControlImport).mock.calls[0];
    expect(path).toBe(CONFIGS[0].path);
    expect([...categories].sort()).toEqual(['calibration', 'curves', 'names']);
  });

  it('drops a category the user switches off', async () => {
    renderSection();
    const toggle = await screen.findByRole('switch', { name: /fanControlImport.category.calibration/ });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: APPLY_BUTTON }));
    await waitFor(() => expect(applyFanControlImport).toHaveBeenCalledTimes(1));
    const [, categories] = vi.mocked(applyFanControlImport).mock.calls[0];
    expect(categories).not.toContain('calibration');
  });

  it('re-previews when another configuration is picked', async () => {
    renderSection();
    await screen.findByText('CPU Graph');
    // Select is the app's own popup control, not a native <select>.
    fireEvent.click(screen.getByRole('button', { name: 'fanControlImport.config' }));
    fireEvent.click(await screen.findByRole('option', { name: 'quiet' }));
    await waitFor(() => expect(previewFanControlImport).toHaveBeenCalledWith(CONFIGS[1].path));
  });

  it('reports a preview the service could not read', async () => {
    vi.mocked(previewFanControlImport).mockResolvedValue({ ...PREVIEW, available: false, error: true, msg: 'nope' });
    renderSection();
    expect(await screen.findByText('fanControlImport.error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: APPLY_BUTTON })).not.toBeInTheDocument();
  });

  it('reports a failed apply and leaves the button live', async () => {
    vi.mocked(applyFanControlImport).mockResolvedValue({
      error: true, msg: 'nope', curvesImported: 0, calibrationsImported: 0, namesImported: 0, offsetsImported: 0, manualImported: 0,
    });
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: APPLY_BUTTON }));
    expect(await screen.findByText('fanControlImport.error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: APPLY_BUTTON })).toBeEnabled();
  });

  it('tells the host when a successful import lands', async () => {
    const onImported = vi.fn();
    renderSection({ onImported });
    fireEvent.click(await screen.findByRole('button', { name: APPLY_BUTTON }));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  });

  it('says so when a config maps onto nothing here', async () => {
    vi.mocked(previewFanControlImport).mockResolvedValue({
      ...PREVIEW, curves: [], fans: [], skipped: [], curveCount: 0, calibrationCount: 0, nameCount: 0, offsetCount: 0,
    });
    renderSection();
    expect(await screen.findByText('fanControlImport.nothingToImport')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    const { container } = render(<FanControlImportSection open={false} configs={CONFIGS} />);
    expect(container).toBeEmptyDOMElement();
    expect(previewFanControlImport).not.toHaveBeenCalled();
  });
});
