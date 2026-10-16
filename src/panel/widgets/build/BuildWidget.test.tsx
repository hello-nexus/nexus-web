import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget, PanelWidgetSize } from '../../types';
import { isDashboardClickthroughType } from '../../engine/panelLayoutHelpers';
import { BuildWidget } from './BuildWidget';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const h = vi.hoisted(() => ({
  macShell: false,
  ping: vi.fn(),
  caseId: vi.fn(),
  preview: vi.fn(),
  openBuild: vi.fn(),
}));

vi.mock('../../../app/windowActions', () => ({ isMacAppShell: () => h.macShell }));
vi.mock('../../../api/service', () => ({ pingService: () => h.ping() }));
vi.mock('../../../api/systemPreview', () => ({
  SYSTEM_PREVIEW_CHANGED_EVENT: 'nexus-system-preview-changed',
  fetchSystemCaseId: () => h.caseId(),
  fetchSystemPreview: () => h.preview(),
}));
vi.mock('../../../components/views/BuildPage/buildNav', () => ({ requestOpenBuild: (p: string) => h.openBuild(p) }));

const widget = (size: PanelWidgetSize): PanelWidget => ({ id: 'w', type: 'build', size, col: 0, row: 0 });

async function renderWidget(size: PanelWidgetSize) {
  const view = render(<BuildWidget widget={widget(size)} />);
  await act(async () => { await Promise.resolve(); });
  return view;
}

describe('BuildWidget', () => {
  beforeEach(() => {
    h.macShell = false;
    h.ping.mockReset().mockResolvedValue({ platform: 'windows' });
    h.caseId.mockReset().mockResolvedValue(null);
    h.preview.mockReset().mockResolvedValue(null);
    h.openBuild.mockReset();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('2x2 without a case shows the silhouette and no text', async () => {
    const { container } = await renderWidget('2x2');
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('4x4 without a case tells the user to set the case in Build', async () => {
    await renderWidget('4x4');
    expect(screen.getByText('panel.widget.build.setCase')).toBeTruthy();
  });

  it('a case with no preview: 4x4 says to open Build, 2x2 stays silent', async () => {
    h.caseId.mockResolvedValue('hyte-y70');
    const big = await renderWidget('4x4');
    expect(screen.getByText('panel.widget.build.openBuild')).toBeTruthy();
    big.unmount();
    await renderWidget('2x2');
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('shows only the preview image when one is stored', async () => {
    h.caseId.mockResolvedValue('hyte-y70');
    h.preview.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview');
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('refetches on the preview-changed event', async () => {
    await renderWidget('2x2');
    expect(h.preview).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); });
    expect(h.preview).toHaveBeenCalledTimes(2);
  });

  it('macOS shows the Apple logo and makes no case or preview fetch', async () => {
    h.macShell = true;
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('svg path')).not.toBeNull();
    expect(h.caseId).not.toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('macOS reported by the service behaves the same', async () => {
    h.ping.mockResolvedValue({ platform: 'macos' });
    await renderWidget('2x2');
    expect(h.caseId).not.toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
  });

  it('a click opens the Build tab in every state', async () => {
    await renderWidget('2x2');
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.build' }));
    expect(h.openBuild).toHaveBeenCalledWith('/builder');
  });

  it('stays out of dashboard click-through, which rejects page-only keys', () => {
    expect(isDashboardClickthroughType('build')).toBe(false);
  });
});
