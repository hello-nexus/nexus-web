import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessScreenTab } from './LianLiWirelessScreenTab';
import type { LianLiFlexTemplate } from '../../../api/lianli-flex';
import type { LianLiScreenApi, LianLiWirelessScreen } from '../../../api/lianli-wireless';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGetMedia = vi.fn();
vi.mock('../../../api/lighting', () => ({
  fetchScreenMonitors: () => Promise.resolve({ effects: [], selectionMode: 'app', selectedMonitor: '0', monitors: [{ id: '0', name: 'Main' }, { id: '1', name: 'Side' }] }),
  screenPreviewUrl: () => Promise.resolve('ws://localhost/preview'),
}));

vi.mock('../../common/ScreenPreviewCanvas/ScreenPreviewCanvas', () => ({ ScreenPreviewCanvas: () => null }));

vi.mock('../../../api/lianli-wireless', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-wireless')>()),
  getLianLiWirelessMedia: (...a: any[]) => mockGetMedia(...a),
  getLianLiAioScreen: () => Promise.resolve(null),
}));

const mockSyncAll = vi.fn();
const mockCapture = vi.fn();
const mockGetTemplates = vi.fn();
const mockSaveTemplate = vi.fn();
const mockApplyTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockExportTemplate = vi.fn();
const mockImportTemplate = vi.fn();
const mockSaveBlob = vi.fn();

vi.mock('../../../api/lianli-flex', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-flex')>()),
  syncLianLiFlexScreens: (...a: any[]) => mockSyncAll(...a),
  captureLianLiFlexMedia: (...a: any[]) => mockCapture(...a),
  getLianLiFlexTemplates: (...a: any[]) => mockGetTemplates(...a),
  saveLianLiFlexTemplate: (...a: any[]) => mockSaveTemplate(...a),
  applyLianLiFlexTemplate: (...a: any[]) => mockApplyTemplate(...a),
  deleteLianLiFlexTemplate: (...a: any[]) => mockDeleteTemplate(...a),
  exportLianLiFlexTemplate: (...a: any[]) => mockExportTemplate(...a),
  importLianLiFlexTemplate: (...a: any[]) => mockImportTemplate(...a),
}));

vi.mock('../../../lib/saveFile', () => ({ saveBlobToFile: (...a: any[]) => mockSaveBlob(...a) }));

const screen1: LianLiWirelessScreen = {
  serial: 'S1', position: -1, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'off', label: 'TL Flex',
};
const screen2: LianLiWirelessScreen = { ...screen1, serial: 'S2', label: 'SL-INF Flex' };

const mockGetScreens = vi.fn();
const mockSetContent = vi.fn();
const api: LianLiScreenApi = {
  getScreens: (...a) => mockGetScreens(...a),
  setSettings: () => Promise.resolve(true),
  setOrder: () => Promise.resolve(true),
  setContent: (...a) => mockSetContent(...a),
};

const media = [
  { id: 'm1', name: 'Planet', kind: 'image' },
  { id: 'm2', name: 'Spark', kind: 'gif' },
  { id: 'm3', name: 'Clip', kind: 'video' },
];

const template: LianLiFlexTemplate = { id: 't1', name: 'Neon', family: 'tlFlex', createdUnixMs: 1 };

async function renderTab(screens: LianLiWirelessScreen[] = [screen1, screen2]) {
  mockGetScreens.mockResolvedValue(screens);
  await act(async () => {
    render(<LianLiWirelessScreenTab api={api} flex />);
  });
}

async function chooseContentType(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
  await act(async () => { fireEvent.click(await screen.findByRole('option', { name: label })); });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMedia.mockResolvedValue(media);
  mockSetContent.mockResolvedValue(true);
  mockSyncAll.mockResolvedValue(true);
  mockCapture.mockResolvedValue({ id: 'm9', name: 'Capture', kind: 'image', thumb: 't' });
  mockGetTemplates.mockResolvedValue([template]);
  mockSaveTemplate.mockResolvedValue(true);
  mockApplyTemplate.mockResolvedValue(true);
  mockDeleteTemplate.mockResolvedValue(true);
  mockExportTemplate.mockResolvedValue(new Blob(['zip']));
  mockImportTemplate.mockResolvedValue({ ok: true });
});

describe('Flex screens content types', () => {
  it('offers Screen and 2D animation only for the Flex screens', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    const options = (await screen.findAllByRole('option')).map(o => o.textContent);
    expect(options).toContain('devices.lianli-flex.contentTypeScreen');
    expect(options).toContain('devices.lianli-flex.contentTypeAnimation2d');
  });

  it('does not offer them on the wireless tab', async () => {
    mockGetScreens.mockResolvedValue([screen1]);
    await act(async () => { render(<LianLiWirelessScreenTab api={api} />); });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    const options = (await screen.findAllByRole('option')).map(o => o.textContent);
    expect(options).not.toContain('devices.lianli-flex.contentTypeScreen');
    expect(screen.queryByText('devices.lianli-flex.screenSyncAll')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-flex.templatesSection')).not.toBeInTheDocument();
  });

  it('Screen posts the live screen type and explains it', async () => {
    await renderTab();
    await chooseContentType('devices.lianli-flex.contentTypeScreen');
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'screen');
    expect(await screen.findByText('devices.lianli-flex.screenMirrorHint')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.screenSourceRegionAria' })).toBeInTheDocument();
  });

  it('saves the display and region of the live screen with the content', async () => {
    await renderTab([{ ...screen1, contentType: 'screen' }, screen2]);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'devices.lianli-flex.screenSourceRegionAria' }), { key: 'ArrowLeft' });
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'screen', undefined, {
      screenSource: expect.objectContaining({ displayId: '', cropSize: 1 }),
    });
  });

  it('captures from the region chosen next to the capture buttons', async () => {
    await renderTab();
    await chooseContentType('devices.lianli-wireless.contentTypeMedia');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'devices.lianli-flex.captureRegionAria' }), { key: 'ArrowLeft' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.captureScreenshot' })); });
    expect(mockCapture).toHaveBeenCalledWith({
      screenSource: expect.objectContaining({ cropSize: 1, displayId: '' }),
    });
  });
});

describe('Flex screens 2D animation', () => {
  it('posts nothing until a sprite is chosen, then posts the overlay with the background', async () => {
    await renderTab();
    await chooseContentType('devices.lianli-flex.contentTypeAnimation2d');
    expect(mockSetContent).not.toHaveBeenCalled();
    expect(screen.getByText('devices.lianli-flex.anim2dType')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('devices.lianli-flex.anim2dSprite'));
    const options = (await screen.findAllByRole('option')).map(o => o.textContent);
    expect(options).toEqual(['Planet', 'Spark']);
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Spark' })); });
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'animation2d', undefined, {
      overlay: expect.objectContaining({ type: 'circular', spriteMediaId: 'm2', speed: 5, zoom: 100, loop: true, direction: 0, centerX: 200, centerY: 200 }),
    });

    fireEvent.click(screen.getByLabelText('devices.lianli-flex.anim2dBackground'));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'Planet' })); });
    expect(mockSetContent).toHaveBeenLastCalledWith('S1', 'animation2d', 'm1', {
      overlay: expect.objectContaining({ spriteMediaId: 'm2' }),
    });
  });

  it('shows the parameters of the chosen motion', async () => {
    const overlay = {
      type: 'bounce', spriteMediaId: 'm1', speed: 3, loop: true, zoom: 120, direction: 0, centerX: 100, centerY: 90, params: { upHeight: 50 },
    };
    await renderTab([{ ...screen1, contentType: 'animation2d', overlay } as LianLiWirelessScreen, screen2]);
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.anim2dHeight' })).toHaveValue('50');
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.anim2dBounciness' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.anim2dPause' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'devices.lianli-flex.anim2dRadius' })).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.anim2dZoom' })).toHaveValue('120');
  });

  it('changing the motion type saves the overlay with the new type', async () => {
    const overlay = {
      type: 'circular', spriteMediaId: 'm1', speed: 3, loop: true, zoom: 100, direction: 0, centerX: 200, centerY: 200, params: {},
    };
    await renderTab([{ ...screen1, contentType: 'animation2d', overlay } as LianLiWirelessScreen, screen2]);
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.anim2dRadius' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-flex.anim2dCollision' })); });
    expect(mockSetContent).toHaveBeenLastCalledWith('S1', 'animation2d', undefined, {
      overlay: expect.objectContaining({ type: 'collision', spriteMediaId: 'm1' }),
    });
    expect(screen.getByRole('radio', { name: 'devices.lianli-flex.anim2dSpinMedium' })).toBeInTheDocument();
  });

  it('loop and spin are toggles that save at once', async () => {
    const overlay = {
      type: 'circular', spriteMediaId: 'm1', speed: 3, loop: true, zoom: 100, direction: 0, centerX: 200, centerY: 200, params: {},
    };
    await renderTab([{ ...screen1, contentType: 'animation2d', overlay } as LianLiWirelessScreen, screen2]);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.anim2dLoop' })); });
    expect(mockSetContent).toHaveBeenLastCalledWith('S1', 'animation2d', undefined, { overlay: expect.objectContaining({ loop: false }) });
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.anim2dSelfRotate' })); });
    expect(mockSetContent).toHaveBeenLastCalledWith('S1', 'animation2d', undefined, {
      overlay: expect.objectContaining({ params: { selfRotate: true } }),
    });
  });
});

describe('Flex screens capture', () => {
  async function openMedia() {
    await renderTab();
    await chooseContentType('devices.lianli-wireless.contentTypeMedia');
  }

  it('captures a screenshot into the library and shows it on the screen', async () => {
    await openMedia();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.captureScreenshot' })); });
    expect(mockCapture).toHaveBeenCalledWith({ screenSource: { displayId: '', cropX: 0, cropY: 0, cropSize: 0 } });
    await waitFor(() => expect(mockSetContent).toHaveBeenCalledWith('S1', 'image', 'm9'));
  });

  it('records for the chosen number of seconds', async () => {
    await openMedia();
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.captureSeconds' })).toHaveAttribute('min', '1');
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.captureSeconds' })).toHaveAttribute('max', '30');
    fireEvent.change(screen.getByRole('slider', { name: 'devices.lianli-flex.captureSeconds' }), { target: { value: '12' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.captureRecording' })); });
    expect(mockCapture).toHaveBeenCalledWith({ durationSeconds: 12, screenSource: { displayId: '', cropX: 0, cropY: 0, cropSize: 0 } });
  });

  it('reports a failed capture and leaves the content alone', async () => {
    mockCapture.mockResolvedValue(null);
    await openMedia();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.captureScreenshot' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.lianli-flex.captureFailed');
    expect(mockSetContent).not.toHaveBeenCalled();
  });
});

describe('Flex screens sync to all', () => {
  it('copies the selected screen to the others', async () => {
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.screenSyncAllButton' })); });
    expect(mockSyncAll).toHaveBeenCalledWith('S1');
  });

  it('is unavailable with several screens selected or only one screen', async () => {
    await renderTab([screen1]);
    expect(screen.getByRole('button', { name: 'devices.lianli-flex.screenSyncAllButton' })).toBeDisabled();
  });

  it('shows an error when the service refuses', async () => {
    mockSyncAll.mockResolvedValue(false);
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.screenSyncAllButton' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.lianli-flex.screenSyncAllFailed');
  });
});

describe('Flex screens templates', () => {
  it('lists saved templates and applies one to the selected screens', async () => {
    await renderTab();
    const row = screen.getByText('Neon').closest('div')!.parentElement!;
    await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'devices.lianli-flex.templateApply' })); });
    expect(mockApplyTemplate).toHaveBeenCalledWith('t1', ['S1']);
  });

  it('has no section on a service without template routes', async () => {
    mockGetTemplates.mockResolvedValue(null);
    await renderTab();
    expect(screen.queryByText('devices.lianli-flex.templatesSection')).not.toBeInTheDocument();
  });

  it('saves the current screen under a name', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.templateSave' }));
    const input = await screen.findByPlaceholderText('devices.lianli-flex.templateNamePlaceholder');
    fireEvent.change(input, { target: { value: ' Calm ' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-flex.templateSave' }).pop()!);
    });
    expect(mockSaveTemplate).toHaveBeenCalledWith('Calm', 'S1');
  });

  it('exports a template as a ZIP through the save dialog', async () => {
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.templateExport' })); });
    expect(mockExportTemplate).toHaveBeenCalledWith('t1');
    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Neon.zip', expect.anything());
  });

  it('tells the user when an export fails', async () => {
    mockExportTemplate.mockResolvedValue(null);
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.templateExport' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.lianli-flex.templateExportFailed');
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });

  it('deletes a template only after confirming', async () => {
    await renderTab();
    const row = screen.getByText('Neon').closest('div')!.parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: 'common.delete' }));
    expect(mockDeleteTemplate).not.toHaveBeenCalled();
    expect(await screen.findByText('devices.lianli-flex.templateDeleteTitle')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' }).pop()!); });
    expect(mockDeleteTemplate).toHaveBeenCalledWith('t1');
  });

  function pickFile(name: string) {
    const input = document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement;
    const file = new File(['x'], name);
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('imports a ZIP and reloads the list', async () => {
    await renderTab();
    await act(async () => { pickFile('look.zip'); });
    expect(mockImportTemplate).toHaveBeenCalledTimes(1);
    expect(mockGetTemplates.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses another app\'s template files without sending them', async () => {
    await renderTab();
    await act(async () => { pickFile('theme.template'); });
    expect(mockImportTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('devices.lianli-flex.templateImportForeign');
  });

  it('shows the service message when it refuses a file', async () => {
    mockImportTemplate.mockResolvedValue({ ok: false, msg: 'The template is too large' });
    await renderTab();
    await act(async () => { pickFile('big.zip'); });
    expect(screen.getByRole('alert')).toHaveTextContent('The template is too large');
  });
});
