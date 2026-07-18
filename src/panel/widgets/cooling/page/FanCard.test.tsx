import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FanCard } from './FanCard';
import type { FanChannel } from '../../../../api/cooling';
import type { FanState } from '../../../../types/cooling';

// Drive the mode dropdown as a native <select> (same convention as
// ClockSettings.test.tsx / StocksSettings.test.tsx) so asserting on its
// option list doesn't depend on the real Select's portaled listbox.
vi.mock('../../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel, disabled }: {
    value: string; onChange: (v: string) => void;
    options?: { value: string; label: string; disabled?: boolean; divider?: boolean }[];
    ariaLabel?: string; disabled?: boolean;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options?.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  ),
}));

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
    onRename: () => {}, onSpeedChange, onToggleLock: () => {}, onSetRole: () => {},
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

// Fan icon repurposed as a device-role picker (2026-07-17): clicking it opens
// a Generic / CPU / GPU picker instead of toggling lock, and Lock moved into
// the mode dropdown below.
describe('FanCard device-role picker', () => {
  beforeEach(() => {
    stubBarGeometry();
  });

  function renderRolePicker(ch: FanChannel, onSetRole = vi.fn(), onToggleLock = vi.fn()) {
    const utils = render(
      <FanCard
        channel={ch}
        state={manualState}
        curves={[]}
        onSetMode={() => {}}
        onCreateCurve={() => {}}
        onRename={() => {}}
        onSpeedChange={() => {}}
        onToggleLock={onToggleLock}
        onSetRole={onSetRole}
      />,
    );
    const trigger = utils.container.querySelector('button[aria-haspopup="menu"]') as HTMLElement;
    return { ...utils, trigger, onSetRole, onToggleLock };
  }

  it('renders the plain Fan icon for an unmarked channel and the Cpu/Gpu icon once marked', () => {
    const { trigger, rerender } = renderRolePicker(makeChannel());
    expect(trigger.querySelector('svg.lucide-fan')).not.toBeNull();

    rerender(
      <FanCard channel={makeChannel({ role: 'cpu' })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} />,
    );
    expect(trigger.querySelector('svg.lucide-cpu')).not.toBeNull();
  });

  it('opens a 3-choice picker on click and calls onSetRole for the chosen device', () => {
    const { trigger, onSetRole } = renderRolePicker(makeChannel());
    fireEvent.click(trigger);

    const choices = screen.getAllByRole('menuitemradio');
    expect(choices).toHaveLength(3);

    fireEvent.click(choices[1]);
    expect(onSetRole).toHaveBeenCalledWith('fan1', 'cpu');
  });

  it('no longer toggles lock from the fan icon', () => {
    const { trigger, onToggleLock } = renderRolePicker(makeChannel({ locked: true }));
    fireEvent.click(trigger);
    expect(onToggleLock).not.toHaveBeenCalled();
  });
});

describe('FanCard mode dropdown Lock toggle', () => {
  beforeEach(() => {
    stubBarGeometry();
  });

  function optionValues(select: HTMLSelectElement) {
    return Array.from(select.querySelectorAll('option')).map(o => o.value);
  }

  it('lists Lock after the create-curve divider and toggles it', () => {
    const onToggleLock = vi.fn();
    render(
      <FanCard channel={makeChannel()} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={onToggleLock} onSetRole={() => {}} />,
    );
    const select = screen.getByLabelText('cooling.card.mode') as HTMLSelectElement;
    const values = optionValues(select);
    const createIdx = values.indexOf('__create__');
    const lockIdx = values.indexOf('__lock__');
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeGreaterThan(createIdx);
    // Unlocked: the option carries the "click to lock" label key.
    const lockOption = select.querySelector('option[value="__lock__"]')!;
    expect(lockOption.textContent).toBe('cooling.lock.unlocked');

    fireEvent.change(select, { target: { value: '__lock__' } });
    expect(onToggleLock).toHaveBeenCalledWith('fan1', true);
  });

  it('reflects the locked state in the Lock option label and toggles it off', () => {
    const onToggleLock = vi.fn();
    render(
      <FanCard channel={makeChannel({ locked: true })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={onToggleLock} onSetRole={() => {}} />,
    );
    const select = screen.getByLabelText('cooling.card.mode') as HTMLSelectElement;
    const lockOption = select.querySelector('option[value="__lock__"]')!;
    expect(lockOption.textContent).toBe('cooling.lock.locked');

    fireEvent.change(select, { target: { value: '__lock__' } });
    expect(onToggleLock).toHaveBeenCalledWith('fan1', false);
  });

  it('still lists Lock when the curve cap is reached (no create-curve entry)', () => {
    const onToggleLock = vi.fn();
    render(
      <FanCard channel={makeChannel()} state={manualState} curves={[]} canCreateCurve={false}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={onToggleLock} onSetRole={() => {}} />,
    );
    const select = screen.getByLabelText('cooling.card.mode') as HTMLSelectElement;
    expect(optionValues(select)).not.toContain('__create__');
    expect(optionValues(select)).toContain('__lock__');
  });
});
