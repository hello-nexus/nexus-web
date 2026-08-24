import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FanControlImportScreen } from './FanControlImportScreen';
import {
  applyFanControlImport, closeFanControlApp, disableFanControlAutostart,
  dismissFanControlImport, previewFanControlImport,
} from '../../../api/fancontrol';
import type { FanControlStatusResponse } from '../../../api/fancontrol';

vi.mock('../../../api/fancontrol', () => ({
  previewFanControlImport: vi.fn(),
  applyFanControlImport: vi.fn(),
  dismissFanControlImport: vi.fn(),
  closeFanControlApp: vi.fn(),
  disableFanControlAutostart: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}));

const IMPORT = 'fanControlImport.screen.importAndContinue';
const SKIP = 'fanControlImport.screen.skipImport';
const CONTINUE = 'fanControlImport.screen.continue';

const PAYLOAD: FanControlStatusResponse = {
  detected: true, running: true, importAvailable: true, autostartPresent: true,
  version: '217', installLocation: 'C:\\FanControl',
  configs: [{ path: 'C:\\FanControl\\Configurations\\userConfig.json', name: 'userConfig', modifiedUnixMs: 1, isDefault: true }],
  pending: true, completed: false,
};

const PREVIEW = {
  available: true, configName: 'userConfig', version: 215,
  curves: [], fans: [], skipped: [],
  curveCount: 2, calibrationCount: 3, nameCount: 0, offsetCount: 0, manualCount: 0,
  error: false, msg: 'Ok',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewFanControlImport).mockResolvedValue(PREVIEW);
  vi.mocked(applyFanControlImport).mockResolvedValue({
    error: false, msg: 'Ok', curvesImported: 2, calibrationsImported: 3, namesImported: 0, offsetsImported: 0, manualImported: 0,
  });
  vi.mocked(dismissFanControlImport).mockResolvedValue({ dismissed: true });
  vi.mocked(closeFanControlApp).mockResolvedValue({ error: false, msg: 'Ok' });
  vi.mocked(disableFanControlAutostart).mockResolvedValue({ error: false, msg: 'Ok' });
});

describe('FanControlImportScreen', () => {
  it('offers importing and skipping as two explicit choices', async () => {
    render(<FanControlImportScreen open payload={PAYLOAD} onComplete={() => {}} />);
    // Skipping is available immediately; importing waits for the preview to
    // say there is something to import.
    expect(screen.getByRole('button', { name: SKIP })).toBeEnabled();
    expect(screen.getByRole('button', { name: IMPORT })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: IMPORT })).toBeEnabled());
  });

  it('imports and then closes FanControl', async () => {
    const onComplete = vi.fn();
    render(<FanControlImportScreen open payload={PAYLOAD} onComplete={onComplete} />);
    await waitFor(() => expect(screen.getByRole('button', { name: IMPORT })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: IMPORT }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyFanControlImport).toHaveBeenCalledTimes(1);
    expect(closeFanControlApp).toHaveBeenCalledTimes(1);
    expect(disableFanControlAutostart).toHaveBeenCalledTimes(1);
  });

  it('skips the import but still closes FanControl, since the two cannot share the fans', async () => {
    const onComplete = vi.fn();
    render(<FanControlImportScreen open payload={PAYLOAD} onComplete={onComplete} />);
    fireEvent.click(await screen.findByRole('button', { name: SKIP }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyFanControlImport).not.toHaveBeenCalled();
    expect(closeFanControlApp).toHaveBeenCalledTimes(1);
    expect(disableFanControlAutostart).toHaveBeenCalledTimes(1);
  });

  it('shows one plain Continue when there is nothing to import', async () => {
    render(<FanControlImportScreen open payload={{ ...PAYLOAD, importAvailable: false }} onComplete={() => {}} />);
    expect(await screen.findByRole('button', { name: CONTINUE })).toBeEnabled();
    expect(screen.queryByRole('button', { name: SKIP })).not.toBeInTheDocument();
  });

  it('keeps the user moving when closing FanControl fails', async () => {
    vi.mocked(closeFanControlApp).mockResolvedValue({ error: true, msg: 'nope' });
    const onComplete = vi.fn();
    render(<FanControlImportScreen open payload={PAYLOAD} onComplete={onComplete} />);

    fireEvent.click(await screen.findByRole('button', { name: SKIP }));
    // First click reports the failure and holds the screen...
    expect(await screen.findByRole('button', { name: 'fanControlImport.screen.continueAnyway' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    // ...a second click always leaves, never retries.
    fireEvent.click(screen.getByRole('button', { name: 'fanControlImport.screen.continueAnyway' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('renders nothing while closed', () => {
    const { container } = render(<FanControlImportScreen open={false} payload={PAYLOAD} onComplete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
