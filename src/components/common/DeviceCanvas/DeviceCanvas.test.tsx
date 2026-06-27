import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeviceCanvas } from './DeviceCanvas';
import type { LightingDevice } from '../../../api/lighting';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../lib/platform', () => ({ isMultiSelectModifier: () => false }));
vi.mock('../../../api/lighting', () => ({ saveDeviceLayout: vi.fn(), identifyLightingDevice: vi.fn() }));
vi.mock('../../../hooks/useShaderRenderer', () => ({ useShaderRenderer: () => ({ ready: false }) }));
vi.mock('../../../lib/ledFrame', () => ({ paintLedFrame: vi.fn() }));

beforeAll(() => {
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  HTMLCanvasElement.prototype.getContext = () => null as unknown as CanvasRenderingContext2D;
});

describe('DeviceCanvas', () => {
  it('fires onBeforeLayoutSave with pre-rotation canvasRotation on rotate', () => {
    const device = {
      id: 'dev1',
      name: 'Test Device',
      ledsOn: true,
      ledCount: 0,
      canvasX: 100,
      canvasY: 100,
      canvasW: 200,
      canvasH: 100,
      canvasRotation: 0,
    } as unknown as LightingDevice;

    let capturedRotation: number | undefined;
    const onBeforeLayoutSave = vi.fn(() => {
      capturedRotation = device.canvasRotation;
    });

    render(
      <DeviceCanvas
        devices={[device]}
        canvasPixels={null}
        canvasW={1000}
        canvasH={500}
        selectedIds={new Set()}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
        onBeforeLayoutSave={onBeforeLayoutSave}
      />
    );

    fireEvent.contextMenu(screen.getByText('Test Device'));
    fireEvent.click(screen.getByText('lighting.devices.rotateCw'));

    expect(onBeforeLayoutSave).toHaveBeenCalled();
    expect(capturedRotation).toBe(0);
  });
});
