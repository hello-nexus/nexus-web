import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingSettingsModal } from './LightingSettingsModal';
import { setRenderGpu, restartService } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../../api/lighting', () => ({
  resetDeviceLayouts: vi.fn(() => Promise.resolve()),
  fetchRenderGpu: vi.fn(() => Promise.resolve({ value: 'auto' })),
  setRenderGpu: vi.fn(() => Promise.resolve()),
  restartService: vi.fn(() => Promise.resolve()),
}));
vi.mock('./GlobalBrightnessSlider', () => ({ GlobalBrightnessSlider: () => <div /> }));
vi.mock('../../../../components/common/Overlay/Overlay', () => ({
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../../components/common/Button/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <button onClick={onClick}>{children}</button>,
}));
vi.mock('../../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void;
    options: { value: string; label: string }[]; ariaLabel: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));
vi.mock('../../../../components/common/ConfirmModal/ConfirmModal', () => ({
  ConfirmModal: ({ open, confirmLabel, onConfirm }: {
    open: boolean; confirmLabel: string; onConfirm: () => void;
  }) => open ? <button onClick={onConfirm}>{confirmLabel}</button> : null,
}));

const GPUS = [
  { id: 'gpu/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [] },
  { id: 'gpu/1', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [] },
];

describe('LightingSettingsModal render-GPU picker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the picker on Windows with 2 GPUs and persists + restarts on change', async () => {
    render(<LightingSettingsModal open onClose={() => {}} serviceOnline platform="windows" gpus={GPUS} />);
    const select = await screen.findByLabelText('lighting.renderGpu.label');
    // The integrated GPU is suffixed; both cards + Automatic are options.
    expect(within(select).getByText('NVIDIA GeForce RTX 5080')).toBeTruthy();
    expect(within(select).getByText('AMD Radeon(TM) Graphics (monitoring.gpuSelect.integrated)')).toBeTruthy();

    fireEvent.change(select, { target: { value: 'NVIDIA GeForce RTX 5080' } });
    await waitFor(() => expect(setRenderGpu).toHaveBeenCalledWith('NVIDIA GeForce RTX 5080'));

    fireEvent.click(await screen.findByText('lighting.renderGpu.confirmButton'));
    await waitFor(() => expect(restartService).toHaveBeenCalledTimes(1));
  });

  it('hides the picker on macOS', () => {
    render(<LightingSettingsModal open onClose={() => {}} serviceOnline platform="macos" gpus={GPUS} />);
    expect(screen.queryByLabelText('lighting.renderGpu.label')).toBeNull();
  });

  it('hides the picker with a single GPU', () => {
    render(<LightingSettingsModal open onClose={() => {}} serviceOnline platform="windows" gpus={[GPUS[0]]} />);
    expect(screen.queryByLabelText('lighting.renderGpu.label')).toBeNull();
  });
});
