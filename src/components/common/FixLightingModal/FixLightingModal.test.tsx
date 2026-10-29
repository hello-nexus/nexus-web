import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedConflict } from '../../../api/conflicts';
import type { ConflictAppsState } from '../../../hooks/useConflictApps';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../../api/conflicts', () => ({ killConflict: vi.fn() }));
const restartServiceMock = vi.fn();
vi.mock('../../../api/lighting', () => ({ restartService: () => restartServiceMock() }));
vi.mock('../../../api/service', () => ({ pingService: vi.fn() }));
const waitMock = vi.fn();
vi.mock('./waitForRestart', () => ({ waitForServiceRestart: (...a: unknown[]) => waitMock(...a) }));
let mockState: ConflictAppsState = { conflicts: [], ready: true };
vi.mock('../../../hooks/useConflictApps', () => ({ useConflictApps: () => mockState }));
const disableMock = vi.fn();
vi.mock('../../../hooks/useConflictAutostart', () => ({
  useConflictAutostart: () => ({
    autostartByApp: new Map([['icue', [{ kind: 'startup', entryName: 'iCUE' }]]]),
    disable: disableMock,
  }),
}));

import { FixLightingModal } from './FixLightingModal';

const ICUE: DetectedConflict = { id: 'icue', displayName: 'Corsair iCUE', category: 'lighting', processName: 'iCUE.exe', pid: 10 };

beforeEach(() => {
  mockState = { conflicts: [], ready: true };
  restartServiceMock.mockReset();
  waitMock.mockReset();
  disableMock.mockReset();
});

describe('FixLightingModal', () => {
  it('renders nothing while closed', () => {
    render(<FixLightingModal open={false} onClose={() => {}} />);
    expect(screen.queryByText('lighting.fix.title')).toBeNull();
  });

  it('shows the three steps and the outside help link', () => {
    render(<FixLightingModal open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'lighting.fix.step1.title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'lighting.fix.step2.title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'lighting.fix.step3.title' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'lighting.fix.stillIssues' });
    expect(link.getAttribute('href')).toBe('https://hellonexus.com/docs/troubleshooting/lighting');
  });

  it('names the device in the intro only when opened from one', () => {
    const { rerender } = render(<FixLightingModal open onClose={() => {}} />);
    expect(screen.getByText('lighting.fix.intro')).toBeInTheDocument();
    rerender(<FixLightingModal open onClose={() => {}} deviceName="Uni Hub" />);
    expect(screen.getByText('lighting.fix.introDevice:{"device":"Uni Hub"}')).toBeInTheDocument();
  });

  it('shows the all-clear line when no conflicting app runs', () => {
    render(<FixLightingModal open onClose={() => {}} />);
    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
  });

  it('lists running apps with the standard End task and Disable auto start actions', () => {
    mockState = { conflicts: [ICUE], ready: true };
    render(<FixLightingModal open onClose={() => {}} />);
    expect(screen.getByText('Corsair iCUE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.disableAutostart' }));
    expect(disableMock).toHaveBeenCalledWith('icue');
    expect(screen.queryByText('conflicts.modal.empty')).toBeNull();
  });

  it('shows no list before the first snapshot resolves', () => {
    mockState = { conflicts: [], ready: false };
    render(<FixLightingModal open onClose={() => {}} />);
    expect(screen.queryByText('conflicts.modal.empty')).toBeNull();
  });

  it('restarts through restartService, waits for the service, then marks the step done', async () => {
    restartServiceMock.mockResolvedValue(null);
    let release: () => void = () => {};
    waitMock.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    render(<FixLightingModal open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'lighting.fix.step2.title' }));
    expect(restartServiceMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('lighting.fix.step2.restarting')).toBeInTheDocument();

    release();
    expect(await screen.findByText('lighting.fix.step2.restarted')).toBeInTheDocument();
  });

  it('treats the socket drop as expected: a rejected restart call still waits and finishes', async () => {
    restartServiceMock.mockRejectedValue(new Error('socket closed'));
    waitMock.mockResolvedValue(undefined);
    render(<FixLightingModal open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'lighting.fix.step2.title' }));
    await waitFor(() => expect(screen.getByText('lighting.fix.step2.restarted')).toBeInTheDocument());
    expect(waitMock).toHaveBeenCalledTimes(1);
  });
});
