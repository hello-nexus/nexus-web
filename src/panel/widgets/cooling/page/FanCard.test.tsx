import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FanCard } from './FanCard';
import type { FanChannel } from '../../../../api/cooling';
import type { FanState } from '../../../../types/cooling';

// Regression guard for manual-level persistence (2026-07-13): the manual knob
// tracks the live server duty unless the user has un-acknowledged drag input.
// A manual duty restored server-side (leaving a preset for Custom) must render
// without a remount, and a preset phase must clear stale local drag intent.

// jsdom has no layout engine: give the duty bar a fixed box so pointer x maps
// 1:1 to a duty percent, and no-op pointer capture so onPointerDown runs.
function stubBarGeometry() {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 10, width: 100, height: 10,
    toJSON: () => ({}),
  } as DOMRect);
}

function makeChannel(overrides: Partial<FanChannel> = {}): FanChannel {
  return {
    id: 'fan1', name: 'Fan 1', dutyPercent: 37, rpm: 900, mode: 'Manual',
    classification: 'Controllable',
    ...overrides,
  };
}

const manualState: FanState = { softwareControl: true, curveId: null };

function renderCard(ch: FanChannel, state: FanState | undefined, onSpeedChange = vi.fn()) {
  const fixed = {
    curves: [],
    onSetMode: () => {}, onCreateCurve: () => {},
    onRename: () => {}, onSpeedChange, onToggleLock: () => {},
  };
  const utils = render(<FanCard channel={ch} state={state} {...fixed} />);
  const rerenderCard = (nextCh: FanChannel, nextState: FanState | undefined) =>
    utils.rerender(<FanCard channel={nextCh} state={nextState} {...fixed} />);
  return { ...utils, rerenderCard };
}

const knobLeft = (container: HTMLElement) =>
  (container.querySelector('[class*="fanDutyKnob"]') as HTMLElement | null)?.style.left;

describe('FanCard manual level display', () => {
  beforeEach(() => {
    stubBarGeometry();
  });

  it('knob follows the live server duty when there is no local drag intent', () => {
    const { container, rerenderCard } = renderCard(makeChannel(), manualState);
    expect(knobLeft(container)).toBe('37%');

    rerenderCard(makeChannel({ dutyPercent: 42 }), manualState);
    expect(knobLeft(container)).toBe('42%');
  });

  it('local drag intent wins over a lagging server duty and commits the speed', () => {
    const onSpeedChange = vi.fn();
    const { container, rerenderCard } = renderCard(makeChannel(), manualState, onSpeedChange);
    const bar = container.querySelector('[class*="fanDutyBarManual"]')!;
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 80, clientY: 5 });
    fireEvent.pointerUp(bar, { pointerId: 1 });

    expect(onSpeedChange).toHaveBeenCalledWith('fan1', 80);
    expect(knobLeft(container)).toBe('80%');

    // Realtime duty still shows the old value for a beat; the knob must not
    // snap back to it.
    rerenderCard(makeChannel({ dutyPercent: 37 }), manualState);
    expect(knobLeft(container)).toBe('80%');
  });

  it('a preset phase clears local intent so the restored manual duty shows on return', async () => {
    const { container, rerenderCard } = renderCard(makeChannel(), manualState);
    const bar = container.querySelector('[class*="fanDutyBarManual"]')!;
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 80, clientY: 5 });
    fireEvent.pointerUp(bar, { pointerId: 1 });
    expect(knobLeft(container)).toBe('80%');

    // "All Silent" applied: the fan moves onto the preset curve.
    await act(async () => {
      rerenderCard(
        makeChannel({ mode: 'Curve', dutyPercent: 25 }),
        { softwareControl: true, curveId: 'preset-silent' },
      );
    });
    expect(knobLeft(container)).toBeUndefined();

    // Back to Custom: the service restored the persisted manual duty. The
    // knob must show the server value, not the stale pre-preset drag.
    await act(async () => {
      rerenderCard(makeChannel({ dutyPercent: 55 }), manualState);
    });
    expect(knobLeft(container)).toBe('55%');
  });

  it('hub fans clear local intent on a preset phase even though mode stays Manual', async () => {
    // Hub providers derive mode from their software-controlled flag, which
    // curve driving also sets - channel.mode never leaves 'Manual' on a hub
    // fan. The reset must key on the state-derived regime instead.
    const hubChannel = makeChannel({ deviceId: 'np50:ABC' });
    const { container, rerenderCard } = renderCard(hubChannel, manualState);
    const bar = container.querySelector('[class*="fanDutyBarManual"]')!;
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 80, clientY: 5 });
    fireEvent.pointerUp(bar, { pointerId: 1 });
    expect(knobLeft(container)).toBe('80%');

    await act(async () => {
      rerenderCard(
        makeChannel({ deviceId: 'np50:ABC', dutyPercent: 25 }),
        { softwareControl: true, curveId: 'preset-silent' },
      );
    });
    expect(knobLeft(container)).toBeUndefined();

    await act(async () => {
      rerenderCard(makeChannel({ deviceId: 'np50:ABC', dutyPercent: 55 }), manualState);
    });
    expect(knobLeft(container)).toBe('55%');
  });

  it('hands the knob back to the server once the live duty confirms the drag', async () => {
    const { container, rerenderCard } = renderCard(makeChannel(), manualState);
    const bar = container.querySelector('[class*="fanDutyBarManual"]')!;
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 80, clientY: 5 });
    fireEvent.pointerUp(bar, { pointerId: 1 });
    expect(knobLeft(container)).toBe('80%');

    // The realtime stream reports the committed duty: intent is confirmed,
    // so a later change from another window must move the knob.
    await act(async () => {
      rerenderCard(makeChannel({ dutyPercent: 80 }), manualState);
    });
    await act(async () => {
      rerenderCard(makeChannel({ dutyPercent: 33 }), manualState);
    });
    expect(knobLeft(container)).toBe('33%');
  });
});
