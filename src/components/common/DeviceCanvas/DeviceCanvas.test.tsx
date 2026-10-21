import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DeviceCanvas, minimizeInto } from './DeviceCanvas';
import { clearLedFrame } from '../../../lib/ledFrameStore';
import { canvasLabelName } from '../../../lib/canvasLabelName';
import styles from './DeviceCanvas.module.scss';
import type { LightingDevice } from '../../../api/lighting';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, language: 'en' }) }));
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

const LEFT = [0, 0, 0.5, 0, 0.5, 1, 0, 1];
const RIGHT = [0.5, 0, 1, 0, 1, 1, 0.5, 1];

describe('DeviceCanvas', () => {
  afterEach(() => { clearLedFrame(); });

  it('reports a gesture over when the frames hide mid-drag', () => {
    const onDragActiveChange = vi.fn();
    const props = {
      devices: [dragDevice('a', 'A')], selectedIds: new Set(['a']), primaryDeviceId: null,
      onSelectDevice: vi.fn(), onSetSelection: vi.fn(), onDragActiveChange,
    };
    const { container, rerender } = render(<DeviceCanvas {...props} />);
    fireEvent.pointerDown(container.querySelector(`.${styles.device}`)!, { button: 0, clientX: 10, clientY: 10 });
    expect(onDragActiveChange).toHaveBeenLastCalledWith(true);
    rerender(<DeviceCanvas {...props} hideFrames />);
    expect(onDragActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('dims a frame lit by another mode and draws no LED dots in it', () => {
    const leds = { a: [{ index: 0, u: 0.5, v: 0.5 }], b: [{ index: 0, u: 0.5, v: 0.5 }] } as never;
    const { container } = render(
      <DeviceCanvas
        devices={[dragDevice('a', 'A'), dragDevice('b', 'B')]}
        selectedIds={new Set(['a', 'b'])}
        foreignFrames={new Map([['b', 'Static']])}
        selectedDeviceLeds={leds}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />,
    );
    const frames = [...container.querySelectorAll<HTMLElement>(`.${styles.device}`)];
    expect(frames.map(f => f.classList.contains(styles.foreign))).toEqual([false, true]);
    expect(frames.map(f => f.querySelectorAll(`.${styles.ledDot}`).length)).toEqual([1, 0]);
    expect(frames[1].querySelector(`.${styles.foreignCaption}`)?.textContent).toBe('Static');
  });

  it('outlines each LED cell for an area-sampling device, skips empty cells, and draws dots otherwise', () => {
    const leds = { a: [{ index: 0, u: 0.5, v: 0.5 }], b: [{ index: 0, u: 0.5, v: 0.5 }] } as never;
    const a = { ...dragDevice('a', 'A'), areaSampling: true, areaCells: [LEFT, [], RIGHT] } as LightingDevice;
    const { container } = render(
      <DeviceCanvas
        devices={[a, dragDevice('b', 'B')]}
        selectedIds={new Set(['a', 'b'])}
        selectedDeviceLeds={leds}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />,
    );
    const frames = [...container.querySelectorAll<HTMLElement>(`.${styles.device}`)];
    expect(frames.map(f => f.querySelectorAll('polygon').length)).toEqual([2, 0]);
    expect(frames.map(f => f.querySelectorAll(`.${styles.ledDot}`).length)).toEqual([0, 1]);
    expect(frames[0].querySelector('polygon')!.getAttribute('points')).toBe('0,0 0.5,0 0.5,1 0,1');
  });

  it('shows no sibling dots beside an area-sampled card unless the sibling is the selected slot', () => {
    const keys = { ...dragDevice('keys', 'Keys'), areaSampling: true, areaCells: [LEFT, RIGHT] } as LightingDevice;
    const under = dragDevice('under', 'Under');
    const leds = { keys: [{ index: 0, u: 0.5, v: 0.5 }], under: [{ index: 0, u: 0.1, v: 0.1 }] } as never;
    const mount = (primary: string) => render(
      <DeviceCanvas
        devices={[keys, under]}
        selectedIds={new Set(['keys', 'under'])}
        selectedDeviceLeds={leds}
        primaryDeviceId={primary}
        stacks={[{ id: 's', name: '', members: ['keys', 'under'] }]}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />,
    );
    const first = mount('keys');
    expect(first.container.querySelectorAll('polygon').length).toBe(2);
    expect(first.container.querySelectorAll(`.${styles.ledDot}`).length).toBe(0);
    first.unmount();
    const second = mount('under');
    expect(second.container.querySelectorAll('polygon').length).toBe(2);
    expect(second.container.querySelectorAll(`.${styles.ledDot}`).length).toBe(1);
  });

  it('a locked LED cell outline wears its color', () => {
    const a = {
      ...dragDevice('a', 'A'),
      areaSampling: true, areaCells: [LEFT, RIGHT],
      ledColors: [{ index: 1, color: '#ff0000' }],
    } as unknown as LightingDevice;
    const { container } = render(
      <DeviceCanvas
        devices={[a]}
        selectedIds={new Set(['a'])}
        selectedDeviceLeds={{ a: [] }}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />,
    );
    const polys = [...container.querySelectorAll<SVGElement>('polygon')];
    expect(polys.map(p => p.style.stroke)).toEqual(['', 'rgb(255, 0, 0)']);
  });

  it('draws no frames or names when asked to hide them', () => {
    const drawn = (hideFrames: boolean) => {
      const { container, unmount } = render(
        <DeviceCanvas
          devices={[dragDevice('a', 'A'), dragDevice('b', 'B')]}
          selectedIds={new Set(['a'])}
          hideFrames={hideFrames}
          primaryDeviceId={null}
          onSelectDevice={vi.fn()}
          onSetSelection={vi.fn()}
        />,
      );
      const out = [container.querySelectorAll(`.${styles.device}`).length, container.querySelectorAll(`.${styles.deviceLabel}`).length];
      unmount();
      return out;
    };
    expect(drawn(true)).toEqual([0, 0]);
    expect(drawn(false)).toEqual([2, 2]);
  });

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

  it('keeps the name horizontal under the frame through a rotation and its undo', () => {
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
        selectedIds={new Set()}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />
    );

    // Unmeasured in jsdom, so the name sits on the frame's bottom edge plus
    // the gap: (100 + 100 + 5) / 600.
    const label = () => screen.getByText('Test Device 3');
    expect(label().style.top).toBe(`${(205 / 600) * 100}%`);
    expect(label().style.left).toBe('20%');

    // Rotate CW: the footprint swaps to 100x200 about the same centre, so the
    // bottom edge drops to 250 and the name follows it; the text itself does
    // not turn.
    fireEvent.contextMenu(label());
    fireEvent.click(screen.getByText('lighting.devices.rotateCw'));
    expect(device.canvasRotation).toBe(90);
    expect(label().style.top).toBe(`${(255 / 600) * 100}%`);
    expect(label().style.transform).toBe('translate(-50%, -50%)');

    // Simulate undo restoring the layout via new props.
    Object.assign(device, { canvasX: 100, canvasY: 100, canvasW: 200, canvasH: 100, canvasRotation: 0 });
    rerender(
      <DeviceCanvas
        devices={[device]}
        selectedIds={new Set()}
        primaryDeviceId={null}
        onSelectDevice={vi.fn()}
        onSetSelection={vi.fn()}
      />
    );

    expect(label().style.top).toBe(`${(205 / 600) * 100}%`);
    expect(label().style.transform).toBe('translate(-50%, -50%)');
  });

  it('a tap that does not move fires no onBeforeLayoutSave (no no-op undo snapshot)', () => {
    const device = dragDevice('dev4', 'Tap Device');
    const onBeforeLayoutSave = vi.fn();
    const { container } = render(
      <DeviceCanvas
        devices={[device]}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} onBeforeLayoutSave={onBeforeLayoutSave}
      />
    );
    const frame = container.querySelector(`.${styles.device}`)!;
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
    const { container } = render(
      <DeviceCanvas
        devices={[device]}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} onBeforeLayoutSave={onBeforeLayoutSave}
      />
    );
    const frame = container.querySelector(`.${styles.device}`)!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(frame, { clientX: 300, clientY: 150 });
    fireEvent.pointerMove(frame, { clientX: 320, clientY: 150 });
    fireEvent.pointerUp(frame, { clientX: 320, clientY: 150 });
    expect(onBeforeLayoutSave).toHaveBeenCalledTimes(1);
    rectSpy.mockRestore();
  });

  // Sizes every label 100x20 px inside a 1000x600 px canvas, so px map 1:1 onto
  // the CW=1000 / CH=600 canvas units the de-collision works in.
  function mockLabelRects() {
    return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const label = this.classList.contains(styles.deviceLabel);
      const w = label ? 100 : 1000;
      const h = label ? 20 : 600;
      return { left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
  }

  /** Both frames share the exact rect, the state the minimize preset produces;
   *  the bottom edge at 310 puts the name's home row at 325 (100x20 label). */
  function stackedDevice(id: string, name: string): LightingDevice {
    return {
      id, name, ledsOn: true, ledCount: 0,
      canvasX: 400, canvasY: 290, canvasW: 200, canvasH: 20, canvasRotation: 0,
    } as unknown as LightingDevice;
  }

  it('pushes co-located labels apart vertically instead of stacking them', () => {
    const rectSpy = mockLabelRects();
    render(
      <DeviceCanvas
        devices={[stackedDevice('a', 'Alpha'), stackedDevice('b', 'Bravo')]}
       
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    // Equal area, so id breaks the tie: 'a' keeps the home row under the frame
    // at cy=325, 'b' steps one row further down to 350.
    expect(screen.getByText('Alpha').style.top).toBe(`${(325 / 600) * 100}%`);
    expect(screen.getByText('Bravo').style.top).toBe(`${(350 / 600) * 100}%`);
    // Same center X: de-collision only moves labels vertically.
    expect(screen.getByText('Alpha').style.left).toBe('50%');
    expect(screen.getByText('Bravo').style.left).toBe('50%');
    rectSpy.mockRestore();
  });

  it('leaves horizontally clear labels on their home row', () => {
    const rectSpy = mockLabelRects();
    const far = stackedDevice('b', 'Bravo');
    far.canvasX = 0; // center 100, 100-wide label spans 50..150 - clear of 'a' at 450..550
    render(
      <DeviceCanvas
        devices={[stackedDevice('a', 'Alpha'), far]}
       
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    expect(screen.getByText('Alpha').style.top).toBe(`${(325 / 600) * 100}%`);
    expect(screen.getByText('Bravo').style.top).toBe(`${(325 / 600) * 100}%`);
    rectSpy.mockRestore();
  });

  // Hardware names carry their ancestry ("{board} - {port} - {product}") for
  // the rail; the frame only has room for the card's own part.
  describe('label text', () => {
    const named = (name: string, originalName?: string): LightingDevice =>
      ({ ...dragDevice('n', name), originalName }) as LightingDevice;

    it('shows a chained zone as its product, and a keeb zone as its zone', () => {
      expect(canvasLabelName(named('B850I AORUS PRO - ARGB_V2_1 - Asiahorse Matrix 360'))).toBe('Asiahorse Matrix 360');
      expect(canvasLabelName(named('HYTE Keeb TKL - Keys'))).toBe('Keys');
    });

    it('shows a renamed card verbatim, dashes included', () => {
      expect(canvasLabelName(named('Front - intake', 'B850I AORUS PRO - ARGB_V2_1'))).toBe('Front - intake');
    });

    it('leaves a name with no separator alone', () => {
      expect(canvasLabelName(named('Corsair M65 PRO'))).toBe('Corsair M65 PRO');
      expect(canvasLabelName(named('Trailing - '))).toBe('Trailing - ');
    });

    it('draws the own part on the frame', () => {
      render(
        <DeviceCanvas
          devices={[named('B850I AORUS PRO - ARGB_V2_1 - Asiahorse Matrix 360')]}
         
          selectedIds={new Set()} primaryDeviceId={null}
          onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
        />
      );
      expect(screen.getByText('Asiahorse Matrix 360')).toBeTruthy();
      expect(screen.queryByText('B850I AORUS PRO - ARGB_V2_1 - Asiahorse Matrix 360')).toBeNull();
    });
  });

  it('sits a name under its frame, centred on it', () => {
    const rectSpy = mockLabelRects();
    const d = stackedDevice('a', 'Alpha');
    d.canvasX = 100; d.canvasY = 100; d.canvasW = 200; d.canvasH = 100;
    render(
      <DeviceCanvas
        devices={[d]}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    // Bottom edge 200, gap 5, half the 20-unit label: centre at 215.
    expect(screen.getByText('Alpha').style.top).toBe(`${(215 / 600) * 100}%`);
    expect(screen.getByText('Alpha').style.left).toBe('20%');
    rectSpy.mockRestore();
  });

  it('keeps a bottom-edge frame\'s name inside the canvas', () => {
    const rectSpy = mockLabelRects();
    const low = stackedDevice('a', 'Alpha');
    low.canvasY = 560; low.canvasH = 40; // bottom edge on the canvas edge
    render(
      <DeviceCanvas
        devices={[low]}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    // Under the frame would centre at 615, off the canvas; clamped to 590 the
    // name rides the frame's bottom band instead of being clipped away.
    expect(screen.getByText('Alpha').style.top).toBe(`${(590 / 600) * 100}%`);
    rectSpy.mockRestore();
  });

  /** Fills the canvas, which is what isMaximized() geometrically tests for. */
  function maximizedDevice(id: string, name: string): LightingDevice {
    return {
      id, name, ledsOn: true, ledCount: 0,
      canvasX: 0, canvasY: 0, canvasW: 1000, canvasH: 600, canvasRotation: 0,
    } as unknown as LightingDevice;
  }

  it('minimizing a group tiles the frames into distinct slots', () => {
    const devices = [
      maximizedDevice('a', 'Alpha'), maximizedDevice('b', 'Bravo'), maximizedDevice('c', 'Charlie'),
    ];
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set(['a', 'b', 'c'])} primaryDeviceId="a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('lighting.devices.minimizeCount.other'));

    for (const d of devices) {
      expect(d.canvasW).toBe(140);
      expect(d.canvasH).toBe(120);
    }
    for (let i = 0; i < devices.length; i++)
    for (let j = i + 1; j < devices.length; j++) {
      const a = devices[i];
      const b = devices[j];
      const overlap = !(a.canvasX + a.canvasW <= b.canvasX || b.canvasX + b.canvasW <= a.canvasX
        || a.canvasY + a.canvasH <= b.canvasY || b.canvasY + b.canvasH <= a.canvasY);
      expect(overlap).toBe(false);
    }
  });

  it('leads a group menu with Customize on the right-clicked frame, identify banded above stacking', () => {
    const devices = [maximizedDevice('a', 'Alpha'), maximizedDevice('b', 'Bravo')];
    for (const d of devices) d.ledCount = 4;
    const onOpenSettings = vi.fn();
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set(['a', 'b'])} primaryDeviceId="a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} onOpenSettings={onOpenSettings}
      />
    );
    fireEvent.contextMenu(screen.getByText('Bravo'));
    const menu = document.querySelector('[class*="_menu_"]')!;
    const rows = Array.from(menu.children).map(c => c.tagName === 'BUTTON' ? c.textContent : '|');
    expect(rows).toEqual([
      'lighting.ledMap.settings', '|',
      'lighting.devices.minimizeCount.other', 'lighting.devices.rotateCwCount.other',
      'lighting.devices.rotateCcwCount.other', 'lighting.devices.menuLightsOffCount.other', '|',
      'lighting.devices.identifyCount.other',
    ]);
    fireEvent.click(screen.getByText('lighting.ledMap.settings'));
    expect(onOpenSettings).toHaveBeenCalledWith('b');
  });

  it('offers key reactions only on a right-clicked frame listed as a per-key keyboard', () => {
    const devices = [maximizedDevice('a', 'Alpha'), maximizedDevice('b', 'Bravo')];
    const onOpenKeyReactions = vi.fn();
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set(['a'])} primaryDeviceId="a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
        onOpenKeyReactions={onOpenKeyReactions} keyReactiveIds={new Set(['b'])}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(screen.queryByText('lighting.keyReactions.menu')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.contextMenu(screen.getByText('Bravo'));
    fireEvent.click(screen.getByText('lighting.keyReactions.menu'));
    expect(onOpenKeyReactions).toHaveBeenCalledWith('b');
  });

  it('offers key reactions on a keyboard frame that is part of a group selection', () => {
    const devices = [maximizedDevice('a', 'Alpha'), maximizedDevice('b', 'Bravo')];
    const onOpenKeyReactions = vi.fn();
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set(['a', 'b'])} primaryDeviceId="a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
        onOpenKeyReactions={onOpenKeyReactions} keyReactiveIds={new Set(['b'])}
      />
    );
    fireEvent.contextMenu(screen.getByText('Bravo'));
    fireEvent.click(screen.getByText('lighting.keyReactions.menu'));
    expect(onOpenKeyReactions).toHaveBeenCalledWith('b');
  });

  it('minimizing spreads frames down the canvas and staggers neighbouring columns', () => {
    const devices = [
      maximizedDevice('a', 'Alpha'), maximizedDevice('b', 'Bravo'),
      maximizedDevice('c', 'Charlie'), maximizedDevice('d', 'Delta'),
    ];
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set(['a', 'b', 'c', 'd'])} primaryDeviceId="a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('lighting.devices.minimizeCount.other'));

    // Neighbouring columns must not share a center line, or their names collide.
    expect(devices[0].canvasY).not.toBe(devices[1].canvasY);
    // The grid uses the whole canvas, not just the top strip: with 4 frames the
    // second row sits well below the first.
    const lowest = Math.max(...devices.map(d => d.canvasY));
    expect(lowest).toBeGreaterThan(300);
    // Still inside the canvas.
    for (const d of devices) {
      expect(d.canvasX).toBeGreaterThanOrEqual(12);
      expect(d.canvasY).toBeGreaterThanOrEqual(12);
      expect(d.canvasX + d.canvasW).toBeLessThanOrEqual(1000 - 12);
      expect(d.canvasY + d.canvasH).toBeLessThanOrEqual(600 - 12);
    }
  });

  it('pins the dragged card\'s name to its frame instead of shuffling it', () => {
    const rectSpy = mockLabelRects();
    // Both bottom edges at 310, so both names want the row at 325. 'Bravo' is
    // the bigger frame, so by area it normally loses that row to 'Alpha' and
    // gets pushed down.
    const small = stackedDevice('a', 'Alpha');
    const big = stackedDevice('b', 'Bravo');
    big.canvasX = 100; big.canvasY = 100; big.canvasW = 800; big.canvasH = 210;
    const { container } = render(
      <DeviceCanvas
        devices={[small, big]}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    // Undragged: the small frame owns the home row.
    expect(screen.getByText('Alpha').style.top).toBe(`${(325 / 600) * 100}%`);
    expect(screen.getByText('Bravo').style.top).toBe(`${(350 / 600) * 100}%`);

    // Grab the big frame: its name must take the home row (under its frame)
    // and 'Alpha' yields, so the dragged name tracks the cursor.
    const bigFrame = container.querySelectorAll(`.${styles.device}`)[1];
    fireEvent.pointerDown(bigFrame, { button: 0, clientX: 500, clientY: 300 });
    expect(screen.getByText('Bravo').style.top).toBe(`${(325 / 600) * 100}%`);
    expect(screen.getByText('Alpha').style.top).toBe(`${(350 / 600) * 100}%`);
    rectSpy.mockRestore();
  });

  it('keeps the selected card\'s name on its frame once a drag ends', () => {
    const rectSpy = mockLabelRects();
    // 'Bravo' is the bigger frame, so by area it loses the home row to 'Alpha'.
    // A drag selects what it grabs, so the primary has to hold the pin after the
    // drag clears, or the name hops back the instant the button releases.
    const small = stackedDevice('a', 'Alpha');
    const big = stackedDevice('b', 'Bravo');
    big.canvasX = 100; big.canvasY = 100; big.canvasW = 800; big.canvasH = 210;
    render(
      <DeviceCanvas
        devices={[small, big]}
        selectedIds={new Set(['b'])} primaryDeviceId="b"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    expect(screen.getByText('Bravo').style.top).toBe(`${(325 / 600) * 100}%`);
    expect(screen.getByText('Alpha').style.top).toBe(`${(350 / 600) * 100}%`);
    rectSpy.mockRestore();
  });

  it('keeps an edge-parked frame\'s name inside the canvas', () => {
    const rectSpy = mockLabelRects();
    const edge = stackedDevice('a', 'Alpha');
    edge.canvasX = 0; edge.canvasW = 60; // center 30, but the label is 100 wide
    render(
      <DeviceCanvas
        devices={[edge]}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    // Unclamped this centers at 30 and the canvas (overflow:hidden) eats the
    // leading 20 units of text. Clamped to halfW, the whole name stays visible.
    expect(screen.getByText('Alpha').style.left).toBe('5%');
    rectSpy.mockRestore();
  });

  it('a tap on a name selects that device without cycling the stack under it', async () => {
    const rectSpy = mockLabelRects();
    const onSelectDevice = vi.fn();
    // Three co-located frames, 'c' primary and topmost. Tapping 'a's name must
    // select 'a' and stop; the tap-cycle would step 'c' -> 'b' instead. Two
    // frames cannot prove this: the cycle lands on 'a' either way.
    render(
      <DeviceCanvas
        devices={[stackedDevice('a', 'Alpha'), stackedDevice('b', 'Bravo'), stackedDevice('c', 'Charlie')]}
       
        selectedIds={new Set(['c'])} primaryDeviceId="c"
        onSelectDevice={onSelectDevice} onSetSelection={vi.fn()}
      />
    );
    const label = screen.getByText('Alpha');
    fireEvent.pointerDown(label, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerUp(label, { clientX: 500, clientY: 300 });
    // handlePointerUp is async and reaches the tap-cycle only after an awaited
    // save; without flushing, the assertions run before the branch under test.
    await act(async () => {});
    expect(onSelectDevice).toHaveBeenCalledTimes(1);
    expect(onSelectDevice).toHaveBeenCalledWith('a');
    rectSpy.mockRestore();
  });

  it('a tap on a frame still cycles one level deeper into the stack', async () => {
    const rectSpy = mockLabelRects();
    const onSelectDevice = vi.fn();
    // Same stack, tapped on the frame body instead of a name: the cycle must
    // still step 'c' -> 'b'. Pins that viaLabel narrows the guard, not removes it.
    const { container } = render(
      <DeviceCanvas
        devices={[stackedDevice('a', 'Alpha'), stackedDevice('b', 'Bravo'), stackedDevice('c', 'Charlie')]}
       
        selectedIds={new Set(['c'])} primaryDeviceId="c"
        onSelectDevice={onSelectDevice} onSetSelection={vi.fn()}
      />
    );
    const frame = container.querySelector(`.${styles.device}`)!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerUp(frame, { clientX: 500, clientY: 300 });
    await act(async () => {});
    expect(onSelectDevice).toHaveBeenLastCalledWith('b');
    rectSpy.mockRestore();
  });

  it('fans labels down the canvas from a top-edge pile', () => {
    const rectSpy = mockLabelRects();
    // 20 frames pinned at the top edge: their names all want the row under the
    // frame at 35, only one upward step exists, and the 20th label needs 19
    // downward rows. The alternating search spends half its steps upward, so
    // the budget has to span the canvas twice over to get there. 35 + 19 * 25
    // fits CH=600, so every label should get its own row.
    const devices = Array.from({ length: 20 }, (_, i) => {
      const d = stackedDevice(`d${i}`, `Device ${i}`);
      d.canvasY = 0; d.canvasH = 20;
      return d;
    });
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()}
      />
    );
    const tops = devices.map(d => screen.getByText(d.name).style.top);
    expect(new Set(tops).size).toBe(20);
    rectSpy.mockRestore();
  });
});

// Stacked frames: one drawn for the set, edits landing on every member.
describe('DeviceCanvas stacks', () => {
  const stacks = [{ id: 'l1', name: '', members: ['dev-a', 'dev-b'] }];
  const pair = () => [dragDevice('dev-a', 'Left'), dragDevice('dev-b', 'Right'), dragDevice('dev-c', 'Loose')];

  it('draws one frame and one label for a stack, with the count under the name', () => {
    const { container } = render(
      <DeviceCanvas
        devices={pair()}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} stacks={stacks}
      />
    );
    expect(container.querySelectorAll(`.${styles.device}`)).toHaveLength(2);
    expect(screen.getByText('Left')).toBeTruthy();
    expect(screen.queryByText('Right')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByLabelText('lighting.devices.stackedCount.other')).toBeTruthy();
  });

  it('names the frame after the member whose LEDs it shows', () => {
    render(
      <DeviceCanvas
        devices={pair()}
        selectedIds={new Set(['dev-a', 'dev-b'])} primaryDeviceId="dev-b"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} stacks={stacks}
      />
    );
    expect(screen.getByText('Right')).toBeTruthy();
    expect(screen.queryByText('Left')).toBeNull();
  });

  it('keeps a named stack\'s header name while the primary is outside it', () => {
    render(
      <DeviceCanvas
        devices={pair()}
        selectedIds={new Set(['dev-c'])} primaryDeviceId="dev-c"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} stacks={[{ id: 's1', name: 'Keeb', members: ['dev-a', 'dev-b'] }]}
      />
    );
    expect(screen.getByText('Keeb')).toBeTruthy();
    expect(screen.queryByText('Left')).toBeNull();
    expect(screen.queryByText('Right')).toBeNull();
  });

  it('drags every member with the frame that stands for them', () => {
    const devices = pair();
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} } as DOMRect,
    );
    const { container } = render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set()} primaryDeviceId={null}
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} stacks={stacks}
      />
    );
    const frame = container.querySelector(`.${styles.device}`)!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(frame, { clientX: 250, clientY: 200 });
    fireEvent.pointerMove(frame, { clientX: 260, clientY: 200 });
    expect(devices[0].canvasX).toBe(devices[1].canvasX);
    expect(devices[0].canvasY).toBe(devices[1].canvasY);
    expect(devices[0].canvasX).not.toBe(100);
    expect(devices[2].canvasX).toBe(100);
    rectSpy.mockRestore();
  });

  it('rotates the whole stack from the frame menu', () => {
    const devices = pair();
    render(
      <DeviceCanvas
        devices={devices}
        selectedIds={new Set(['dev-a', 'dev-b'])} primaryDeviceId="dev-a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} stacks={stacks}
      />
    );
    fireEvent.contextMenu(screen.getByText('Left'));
    fireEvent.click(screen.getByText('lighting.devices.rotateCwCount.other'));
    expect(devices[0].canvasRotation).toBe(90);
    expect(devices[1].canvasRotation).toBe(90);
    expect(devices[2].canvasRotation).toBe(0);
  });

  it('offers unstack over a stacked frame and stack over an eligible selection', () => {
    const stack = vi.fn();
    const unstack = vi.fn();
    const stackActionsFor = (ids: string[]) => ids.includes('dev-c') ? { stack } : { unstack };
    render(
      <DeviceCanvas
        devices={pair()}
        selectedIds={new Set(['dev-a', 'dev-b'])} primaryDeviceId="dev-a"
        onSelectDevice={vi.fn()} onSetSelection={vi.fn()} stacks={stacks} stackActionsFor={stackActionsFor}
      />
    );
    fireEvent.contextMenu(screen.getByText('Left'));
    fireEvent.click(screen.getByText('lighting.devices.unstack'));
    expect(unstack).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByText('Loose'));
    fireEvent.click(screen.getByText('lighting.devices.stackCount.one'));
    expect(stack).toHaveBeenCalledTimes(1);
  });
});

describe('minimizeInto grid slots', () => {
  // The origin/main rule, one slot per device, kept here as the reference.
  function referenceSlot(index: number, n: number) {
    const GRID_PAD = 12, MIN_W = 140, MIN_H = 120, STAGGER = 24;
    const availW = 1000 - 2 * GRID_PAD, availH = 600 - 2 * GRID_PAD;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (availW / availH))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = availW / cols, cellH = availH / rows;
    const fit = Math.min(Math.min(MIN_W, cellW * 0.92) / MIN_W, Math.min(MIN_H, cellH * 0.7) / MIN_H);
    const w = MIN_W * fit, h = MIN_H * fit;
    const total = cols * rows;
    const sl = ((index % total) + total) % total;
    const col = sl % cols, row = Math.floor(sl / cols);
    const slack = (cellH - h) * 0.5;
    const stagger = Math.min(STAGGER, slack);
    let x = GRID_PAD + col * cellW + (cellW - w) * 0.5;
    let y = GRID_PAD + row * cellH + slack + (col % 2 === 0 ? -stagger : stagger);
    if (x > 1000 - GRID_PAD - w) x = 1000 - GRID_PAD - w;
    if (y > 600 - GRID_PAD - h) y = 600 - GRID_PAD - h;
    if (x < GRID_PAD) x = GRID_PAD;
    if (y < GRID_PAD) y = GRID_PAD;
    return { canvasX: x, canvasY: y, canvasW: w, canvasH: h };
  }
  const rect = (d: LightingDevice) => ({ canvasX: d.canvasX, canvasY: d.canvasY, canvasW: d.canvasW, canvasH: d.canvasH });
  const make = (ids: string[]) => ids.map(id => dragDevice(id, id));

  it('matches the one-slot-per-device rule when no device is a Flex zone', () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const devices = make(Array.from({ length: n }, (_, i) => `rgb:${i}`));
      minimizeInto(devices, devices);
      devices.forEach((d, i) => expect(rect(d)).toEqual(referenceSlot(i, n)));
    }
  });

  it('puts the zones of one Flex fan into one shared rect', () => {
    const devices = make(['lianli-flex:AA11:up', 'lianli-flex:AA11:down']);
    minimizeInto(devices, devices);
    expect(rect(devices[0])).toEqual(rect(devices[1]));
    expect(rect(devices[0])).toEqual(referenceSlot(0, 1));
  });

  it('numbers slots like the service: a slot per non-Flex device and per fan, in list order', () => {
    const devices = make(['rgb:a', 'lianli-flex:AA11:up', 'lianli-flex:AA11:down', 'rgb:b', 'lianli-flex:BB22:center', 'lianli-flex:AA11:extra', 'lianli-flex:CC33']);
    minimizeInto(devices, devices);
    const slots = [0, 1, 1, 2, 3, 1, 4];
    devices.forEach((d, i) => expect(rect(d)).toEqual(referenceSlot(slots[i], 5)));
  });
});
