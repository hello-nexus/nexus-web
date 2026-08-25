import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportCenter, type ImportCenterHandle } from './ImportCenter';
import { availableImportSources } from './ImportDialog';
import { applyFanControlImport, fetchFanControlStatus, previewFanControlImport } from '../../../api/fancontrol';
import type { FanControlStatusResponse } from '../../../api/fancontrol';
import { applyNexus2Import, fetchNexus2Status, previewNexus2Import } from '../../../api/migration';
import type { Nexus2PreviewResponse, Nexus2StatusResponse } from '../../../api/migration';

vi.mock('../../../api/fancontrol', () => ({
  fetchFanControlStatus: vi.fn(),
  previewFanControlImport: vi.fn(),
  applyFanControlImport: vi.fn(),
}));

vi.mock('../../../api/migration', () => ({
  fetchNexus2Status: vi.fn(),
  previewNexus2Import: vi.fn(),
  applyNexus2Import: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}));

const FAN_CONTROL_INSTALLED: FanControlStatusResponse = {
  detected: true, running: false, importAvailable: true, autostartPresent: false,
  version: '217', installLocation: 'C:\\FanControl',
  configs: [{ path: 'C:\\FanControl\\Configurations\\userConfig.json', name: 'userConfig', modifiedUnixMs: 1, isDefault: true }],
  pending: false, completed: false,
};

const FAN_CONTROL_PREVIEW = {
  available: true, configName: 'userConfig', version: 215,
  curves: [], fans: [], skipped: [],
  curveCount: 1, calibrationCount: 0, nameCount: 0, offsetCount: 0, manualCount: 0,
  error: false, msg: 'Ok',
};

const FAN_CONTROL_APPLIED = {
  error: false, msg: 'Ok',
  curvesImported: 1, calibrationsImported: 0, namesImported: 0, offsetsImported: 0, manualImported: 0,
};

const NEXUS2_INSTALLED: Nexus2StatusResponse = {
  detected: true, importAvailable: true, deviceEligible: true, version: '2.4.0',
  autostartTaskPresent: false, running: false, pending: false,
};

const NEXUS2_PREVIEW: Nexus2PreviewResponse = {
  available: true,
  profileName: 'Default',
  categories: [{ id: 'appearance', available: true, accentColor: '#ff0000', background: 'aurora' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchFanControlStatus).mockResolvedValue(FAN_CONTROL_INSTALLED);
  vi.mocked(previewFanControlImport).mockResolvedValue(FAN_CONTROL_PREVIEW);
  vi.mocked(applyFanControlImport).mockResolvedValue(FAN_CONTROL_APPLIED);
  vi.mocked(fetchNexus2Status).mockResolvedValue(NEXUS2_INSTALLED);
  vi.mocked(previewNexus2Import).mockResolvedValue(NEXUS2_PREVIEW);
  vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'appearance', status: 'applied', detail: null }] });
});

const BOTH = ['fancontrol', 'nexus2'] as const;

/** Resolves once the center reports it has something to import. */
function readyToImport() {
  const onSelectionChange = vi.fn();
  const wait = async () => waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith(true));
  return { onSelectionChange, wait };
}

describe('availableImportSources', () => {
  it('offers every source on Windows, where they can exist', () => {
    expect(availableImportSources('windows', [...BOTH])).toEqual(['fancontrol', 'nexus2']);
  });

  it('offers none elsewhere, so no entry point is a dead end', () => {
    expect(availableImportSources('macos', [...BOTH])).toEqual([]);
    expect(availableImportSources('linux', [...BOTH])).toEqual([]);
    // Empty until /ping resolves: keep the entry point hidden rather than
    // flash it in and take it away.
    expect(availableImportSources('', [...BOTH])).toEqual([]);
  });
});

describe('ImportCenter', () => {
  it('lists every source with what it found, and shows the first one that has something', async () => {
    render(<ImportCenter open sources={[...BOTH]} />);

    expect(await screen.findByText('importCenter.source.fancontrol')).toBeInTheDocument();
    expect(await screen.findByText('importCenter.source.nexus2')).toBeInTheDocument();
    // An app that can be imported says so by being listed and switched on;
    // the status line is only for one that cannot.
    expect(screen.queryByText('importCenter.source.fancontrol.found.one:1')).not.toBeInTheDocument();
    expect(screen.queryByText('importCenter.source.ready')).not.toBeInTheDocument();
    // The highlighted source's own flow, not just its row.
    await waitFor(() => expect(previewFanControlImport).toHaveBeenCalled());
  });

  it('still lists a source that is not installed, and says why instead of hiding it', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue({ ...NEXUS2_INSTALLED, detected: false, importAvailable: false });
    render(<ImportCenter open sources={[...BOTH]} />);

    expect(await screen.findByText('importCenter.source.nexus2')).toBeInTheDocument();
    expect(await screen.findByText('importCenter.source.missing')).toBeInTheDocument();
    expect(previewNexus2Import).not.toHaveBeenCalled();
  });

  it('highlights an installed source over an uninstalled one earlier in the list', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue({ ...FAN_CONTROL_INSTALLED, importAvailable: false, configs: [] });
    render(<ImportCenter open sources={[...BOTH]} />);

    // Nexus 2's flow is the one on the right, even though FanControl is first.
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalled());
    expect(previewFanControlImport).not.toHaveBeenCalled();
  });

  it('shows a source on the right when its row is clicked', async () => {
    render(<ImportCenter open sources={[...BOTH]} />);
    // Both flows are mounted from the start; only one is shown.
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalled());
    const panelFor = (key: string) => screen.getByText(key).closest('[class*=sourcePanel]');
    expect(panelFor('nexus2Welcome.import.group.y70Panel.label')).toHaveAttribute('hidden');
    expect(panelFor('fanControlImport.category.curves')).not.toHaveAttribute('hidden');

    fireEvent.click(screen.getByText('importCenter.source.nexus2'));

    expect(panelFor('nexus2Welcome.import.group.y70Panel.label')).not.toHaveAttribute('hidden');
    expect(panelFor('fanControlImport.category.curves')).toHaveAttribute('hidden');
  });

  it('imports every included source, in list order', async () => {
    const order: string[] = [];
    vi.mocked(applyFanControlImport).mockImplementation(async () => {
      order.push('fancontrol');
      return FAN_CONTROL_APPLIED;
    });
    vi.mocked(applyNexus2Import).mockImplementation(async () => {
      order.push('nexus2');
      return { results: [{ id: 'appearance', status: 'applied', detail: null }] };
    });
    const handle = createRef<ImportCenterHandle>();
    const ready = readyToImport();
    render(<ImportCenter open sources={[...BOTH]} showAction={false} handleRef={handle} onSelectionChange={ready.onSelectionChange} />);
    await ready.wait();
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalled());

    await act(async () => { expect(await handle.current?.runImport()).toBe('clean'); });
    expect(order).toEqual(['fancontrol', 'nexus2']);
  });

  it('leaves out a source whose switch is off', async () => {
    const handle = createRef<ImportCenterHandle>();
    const ready = readyToImport();
    render(<ImportCenter open sources={[...BOTH]} showAction={false} handleRef={handle} onSelectionChange={ready.onSelectionChange} />);
    await ready.wait();
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('importCenter.include:importCenter.source.fancontrol'));
    await act(async () => { await handle.current?.runImport(); });

    expect(applyFanControlImport).not.toHaveBeenCalled();
    expect(applyNexus2Import).toHaveBeenCalled();
  });

  it('reports failure when any included source failed, so a host can say so', async () => {
    vi.mocked(applyFanControlImport).mockResolvedValue(null);
    const handle = createRef<ImportCenterHandle>();
    const ready = readyToImport();
    render(<ImportCenter open sources={[...BOTH]} showAction={false} handleRef={handle} onSelectionChange={ready.onSelectionChange} />);
    await ready.wait();
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalled());

    await act(async () => { expect(await handle.current?.runImport()).toBe('failed'); });
    // The one that could still land, did.
    expect(applyNexus2Import).toHaveBeenCalled();
  });

  it('cannot include a source that is not installed', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue({ ...NEXUS2_INSTALLED, importAvailable: false });
    render(<ImportCenter open sources={[...BOTH]} />);

    const toggle = await screen.findByLabelText('importCenter.include:importCenter.source.nexus2');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('still includes a source that answers detection late', async () => {
    // Nexus 2 is slow to answer; the user ticks FanControl off meanwhile.
    let answerNexus2: (v: Nexus2StatusResponse) => void = () => {};
    vi.mocked(fetchNexus2Status).mockReturnValue(new Promise(resolve => { answerNexus2 = resolve; }));
    const handle = createRef<ImportCenterHandle>();
    render(<ImportCenter open sources={[...BOTH]} showAction={false} handleRef={handle} />);
    await waitFor(() => expect(previewFanControlImport).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('importCenter.include:importCenter.source.fancontrol'));

    await act(async () => { answerNexus2(NEXUS2_INSTALLED); });
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalled());
    await act(async () => { await handle.current?.runImport(); });

    // Deciding about one source must not have decided about the other.
    expect(applyNexus2Import).toHaveBeenCalled();
    expect(applyFanControlImport).not.toHaveBeenCalled();
  });

  it('trusts detection a host hands it over its own read', async () => {
    // The read disagrees; a host that opened because the app was found wins.
    vi.mocked(fetchFanControlStatus).mockResolvedValue(null);
    render(
      <ImportCenter
        open
        sources={['fancontrol']}
        detected={{ fancontrol: { importAvailable: true, configCount: 2 } }}
      />,
    );

    await waitFor(() => expect(previewFanControlImport).toHaveBeenCalled());
    expect(screen.queryByText('importCenter.source.missing')).not.toBeInTheDocument();
  });

  it('tells the host to refetch even when only part of the import landed', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({
      results: [{ id: 'appearance', status: 'failed', detail: null }],
    });
    const onImported = vi.fn();
    const handle = createRef<ImportCenterHandle>();
    const ready = readyToImport();
    render(
      <ImportCenter
        open
        sources={['nexus2']}
        showAction={false}
        handleRef={handle}
        onImported={onImported}
        onSelectionChange={ready.onSelectionChange}
      />,
    );
    await ready.wait();

    await act(async () => { expect(await handle.current?.runImport()).toBe('failed'); });
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('re-reads detection on open, so installing an app and coming back works', async () => {
    const { rerender } = render(<ImportCenter open={false} sources={['fancontrol']} />);
    await waitFor(() => expect(fetchFanControlStatus).toHaveBeenCalledTimes(1));

    rerender(<ImportCenter open sources={['fancontrol']} />);
    await waitFor(() => expect(fetchFanControlStatus).toHaveBeenCalledTimes(2));
  });
});
