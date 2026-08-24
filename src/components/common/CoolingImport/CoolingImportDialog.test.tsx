import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoolingImportDialog } from './CoolingImportDialog';
import { fetchFanControlStatus, previewFanControlImport } from '../../../api/fancontrol';
import type { FanControlStatusResponse } from '../../../api/fancontrol';

vi.mock('../../../api/fancontrol', () => ({
  fetchFanControlStatus: vi.fn(),
  previewFanControlImport: vi.fn(),
  applyFanControlImport: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}));

const INSTALLED: FanControlStatusResponse = {
  detected: true, running: false, importAvailable: true, autostartPresent: false,
  version: '217', installLocation: 'C:\\FanControl',
  configs: [{ path: 'C:\\FanControl\\Configurations\\userConfig.json', name: 'userConfig', modifiedUnixMs: 1, isDefault: true }],
  pending: false, completed: false,
};

const PREVIEW = {
  available: true, configName: 'userConfig', version: 215,
  curves: [], fans: [], skipped: [],
  curveCount: 1, calibrationCount: 0, nameCount: 0, offsetCount: 0, manualCount: 0,
  error: false, msg: 'Ok',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewFanControlImport).mockResolvedValue(PREVIEW);
});

describe('CoolingImportDialog', () => {
  it('lists FanControl as a source and shows its import flow when it is installed', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue(INSTALLED);
    render(<CoolingImportDialog open onClose={() => {}} />);

    expect(await screen.findByText('coolingImport.source.fancontrol')).toBeInTheDocument();
    expect(await screen.findByText('coolingImport.source.fancontrol.found.one:1')).toBeInTheDocument();
    // The flow itself, not just the row.
    await waitFor(() => expect(previewFanControlImport).toHaveBeenCalled());
  });

  it('still lists a source that is not installed, and says so instead of hiding it', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue({ ...INSTALLED, detected: false, importAvailable: false, configs: [] });
    render(<CoolingImportDialog open onClose={() => {}} />);

    expect(await screen.findByText('coolingImport.source.fancontrol')).toBeInTheDocument();
    expect(screen.getByText('coolingImport.source.fancontrol.missing')).toBeInTheDocument();
    expect(await screen.findByText(/coolingImport.notFound.title/)).toBeInTheDocument();
    expect(previewFanControlImport).not.toHaveBeenCalled();
  });

  it('says so too when the service cannot be reached at all', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue(null);
    render(<CoolingImportDialog open onClose={() => {}} />);

    expect(await screen.findByText('coolingImport.source.fancontrol.missing')).toBeInTheDocument();
  });

  it('re-reads detection on open, so installing the app and coming back works', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue(INSTALLED);
    const { rerender } = render(<CoolingImportDialog open={false} onClose={() => {}} />);
    await waitFor(() => expect(fetchFanControlStatus).toHaveBeenCalledTimes(1));

    rerender(<CoolingImportDialog open onClose={() => {}} />);
    await waitFor(() => expect(fetchFanControlStatus).toHaveBeenCalledTimes(2));
  });

  it('renders nothing while closed', () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue(INSTALLED);
    const { container } = render(<CoolingImportDialog open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
