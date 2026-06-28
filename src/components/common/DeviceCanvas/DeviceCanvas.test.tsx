import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeviceCanvas } from './DeviceCanvas';
import type { LightingDevice } from '../../../api/lighting';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../lib/platform', () => ({ isMultiSelectModifier: () => false }));
vi.mock('../../../api/lighting', () => ({ saveDeviceLayout: vi.fn(() => Promise.resolve()), identifyLightingDevice: vi.fn() }));
vi.mock('../../../hooks/useShaderRenderer', () => ({ useShaderRenderer: () => ({ ready: false }) }));
vi.mock('../../../lib/ledFrame', () => ({ paintLedFrame: vi.fn() }));

beforeAll(() => {
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  HTMLCanvasElement.prototype.getContext = () => null as unknown as CanvasRenderingContext2D;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
});

function dragDevice(id: string, name: string): LightingDevice {
  return {
    id, name, ledsOn: true, ledCount: 0,
    canvasX: 100, canvasY: 100, canvasW: 200, canvasH: 100, canvasRotation: 0,
  } as unknown as LightingDevice;
}

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

  it('fires onLayoutCommit after rotate completes', async () => {
    const device = {
      id: 'dev2',
      name: 'Test Device 2',
      ledsOn: true,
      ledCount: 0,
      canvasX: 100,
      canvasY: 100,
      canvasW: 200,
      canvasH: 100,
      canvasRotation: 0,
    } as unknown as LightingDevice;

    const onLayoutCommit = vi.fn();

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
        onLayoutCommit={onLayoutCommit}
      />
    );

    fireEvent.contextMenu(screen.getByText('Test Device 2'));
    fireEvent.click(screen.getByText('lighting.devices.rotateCw'));

    // onLayoutCommit is called after the async saveDeviceLayout resolves
    await new Promise(r => setTimeout(r, 0));
    expect(onLayoutCommit).toHaveBeenCalled();
  });

  it('label transform uses canvasRotation so undo/redo restores the correct angle', () => {
    const device = {
      id: 'dev3',
      name: 'Test Device 3',
      ledsOn: true,
      ledCount: 0,
      canvasX: 100,
      canvasY: 100,
      canvasW: 200,
      canvasH: 100,
      canvasRotation: 0,
    } as unknown as LightingDevice;

    const { rerender } = render(
      <DeviceCanvas
        devices={[device]}
        canvasPixels={null}
        canvasW={1000}
        canvasH={500}
        selectedIds={new Set()}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />
    );

    // Rotate CW: device.canvasRotation becomes 90.
    fireEvent.contextMenu(screen.getByText('Test Device 3'));
    fireEvent.click(screen.getByText('lighting.devices.rotateCw'));

    // Simulate undo restoring the layout: canvasRotation reset to 0 via new props.
    device.canvasRotation = 0;
    rerender(
      <DeviceCanvas
        devices={[device]}
        canvasPixels={null}
        canvasW={1000}
        canvasH={500}
        selectedIds={new Set()}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />
    );

    const label = screen.getByText('Test Device 3');
    expect(label.style.transform).toBe('rotate(0deg)');
  });

  it('a tap that does not move fires no onBeforeLayoutSave (no no-op undo snapshot)', () => {
    const device = dragDevice('dev4', 'Tap Device');
    const onBeforeLayoutSave = vi.fn();
    render(
      <DeviceCanvas
        devices={[device]} canvasPixels={null} canvasW={1000} canvasH={500}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} onBeforeLayoutSave={onBeforeLayoutSave}
      />
    );
    const frame = screen.getByText('Tap Device').parentElement!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 150, clientY: 150 });
    fireEvent.pointerUp(frame, { clientX: 150, clientY: 150 });
    expect(onBeforeLayoutSave).not.toHaveBeenCalled();
  });

  it('a drag past the threshold fires onBeforeLayoutSave once', () => {
    const device = dragDevice('dev5', 'Drag Device');
    const onBeforeLayoutSave = vi.fn();
    // jsdom returns a zero rect; map client px 1:1 to canvas px so a move registers.
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} } as DOMRect,
    );
    render(
      <DeviceCanvas
        devices={[device]} canvasPixels={null} canvasW={1000} canvasH={500}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} onBeforeLayoutSave={onBeforeLayoutSave}
      />
    );
    const frame = screen.getByText('Drag Device').parentElement!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(frame, { clientX: 300, clientY: 150 });
    fireEvent.pointerMove(frame, { clientX: 320, clientY: 150 });
    fireEvent.pointerUp(frame, { clientX: 320, clientY: 150 });
    expect(onBeforeLayoutSave).toHaveBeenCalledTimes(1);
    rectSpy.mockRestore();
  });
});
