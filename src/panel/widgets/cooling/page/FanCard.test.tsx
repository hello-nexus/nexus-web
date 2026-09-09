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

  it('names the role picker in its tooltip whether or not the fan is locked', () => {
    // Lock moved into the mode dropdown's value, so the icon carries no lock
    // meaning any more and its tooltip is the same in both states.
    const { trigger, rerender } = renderRolePicker(makeChannel({ locked: true }));
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('cooling.fanRole.picker');
    fireEvent.blur(trigger);

    rerender(
      <FanCard channel={makeChannel()} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} />,
    );
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('cooling.fanRole.picker');
  });
});

describe('FanCard overflow menu', () => {
  beforeEach(() => {
    stubBarGeometry();
  });

  function openMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));
  }

  function renderMenuCard(ch: FanChannel, extra: Record<string, unknown> = {}) {
    return render(
      <FanCard channel={ch} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} {...extra} />,
    );
  }

  it('moves Lock out of the mode dropdown and into the menu', () => {
    const onToggleLock = vi.fn();
    renderMenuCard(makeChannel(), { onToggleLock });
    const select = screen.getByLabelText('cooling.card.mode') as HTMLSelectElement;
    // The dropdown is modes only now - that is what keeps it narrow.
    const values = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(values).not.toContain('__lock__');

    openMenu();
    // The row names the action, not the state.
    fireEvent.click(screen.getByText('cooling.lock.lock'));
    expect(onToggleLock).toHaveBeenCalledWith('fan1', true);
  });

  it('offers Unlock when the fan is locked and toggles it off', () => {
    const onToggleLock = vi.fn();
    renderMenuCard(makeChannel({ locked: true }), { onToggleLock });
    openMenu();
    fireEvent.click(screen.getByText('cooling.lock.unlock'));
    expect(onToggleLock).toHaveBeenCalledWith('fan1', false);
  });

  it('opens from a right-click on the card as well as the button', () => {
    const { container } = renderMenuCard(makeChannel());
    expect(screen.queryByText('cooling.lock.lock')).toBeNull();
    fireEvent.contextMenu(container.firstElementChild!);
    expect(screen.getByText('cooling.lock.lock')).toBeTruthy();
  });

  it('toggles Nexus Control from the menu when the page offers it', () => {
    const onToggleControlled = vi.fn();
    renderMenuCard(makeChannel(), { onToggleControlled });
    openMenu();
    fireEvent.click(screen.getByText('cooling.fan.menuControlOff'));
    expect(onToggleControlled).toHaveBeenCalledWith('fan1', false);
  });

  it('omits the Nexus Control row on a surface that cannot set it', () => {
    renderMenuCard(makeChannel());
    openMenu();
    expect(screen.queryByText('cooling.fan.menuControlOff')).toBeNull();
  });
});

describe('FanCard menu in a multi-selection', () => {
  beforeEach(() => {
    stubBarGeometry();
  });

  const bulk = (over = {}) => ({
    count: 3, locked: false, controlled: true,
    setLocked: vi.fn(), setControlled: vi.fn(), ...over,
  });

  function renderBulkCard(b, extra = {}) {
    return render(
      <FanCard channel={makeChannel()} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}} bulk={b} {...extra} />,
    );
  }
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));

  it('locks the whole selection, counting it in the row', () => {
    const b = bulk();
    renderBulkCard(b);
    openMenu();
    fireEvent.click(screen.getByText('cooling.lock.lockCount.other'));
    expect(b.setLocked).toHaveBeenCalledWith(true);
  });

  it('turns Nexus Control off for the whole selection, counting it in the row', () => {
    const b = bulk();
    renderBulkCard(b);
    openMenu();
    fireEvent.click(screen.getByText('cooling.fan.menuControlOffCount.other'));
    expect(b.setControlled).toHaveBeenCalledWith(false);
  });

  it('reads the aggregate, not this card, so one press lands the whole selection', () => {
    // This card is unlocked, but a member is locked - the row offers Unlock.
    const b = bulk({ locked: true });
    renderBulkCard(b);
    openMenu();
    fireEvent.click(screen.getByText('cooling.lock.unlockCount.other'));
    expect(b.setLocked).toHaveBeenCalledWith(false);
  });

  it('drops the per-fan offset row, which a selection cannot act on', () => {
    renderBulkCard(bulk(), { channel: makeChannel({ offset: 5 }), onClearOffset: vi.fn() });
    openMenu();
    expect(screen.queryByText('cooling.card.clearOffset')).toBeNull();
  });

  it('leads with a row that narrows the selection to this fan', () => {
    const onSelectOnly = vi.fn();
    renderBulkCard(bulk(), { onSelectOnly });
    openMenu();
    fireEvent.click(screen.getByText('cooling.fan.selectOnly'));
    expect(onSelectOnly).toHaveBeenCalled();
  });

  it('offers no narrow-to-this row on a fan that cannot be selected at all', () => {
    render(
      <FanCard channel={makeChannel({ classification: 'Fixed' })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}} onSelectOnly={vi.fn()} />,
    );
    openMenu();
    expect(screen.queryByText('cooling.fan.selectOnly')).toBeNull();
  });
});

describe('FanCard with Nexus Control off', () => {
  beforeEach(() => {
    stubBarGeometry();
  });

  it('replaces the mode dropdown with the not-controlled badge', () => {
    render(
      <FanCard channel={makeChannel({ controlled: false })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}} />,
    );
    expect(screen.queryByLabelText('cooling.card.mode')).toBeNull();
    expect(screen.getByText('cooling.fan.notControlled')).toBeTruthy();
  });

  it('still takes a card selection while control is off', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FanCard channel={makeChannel({ controlled: false })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onSelect={onSelect} onToggleControlled={() => {}} />,
    );
    fireEvent.click(container.firstElementChild!);
    // Selecting is how the user reaches the row that turns control back on.
    expect(onSelect).toHaveBeenCalled();
  });

  it('keeps the lock visible where there is no dropdown to carry it', () => {
    // The lock normally rides the mode option's icon; a card with no dropdown
    // would otherwise show no lock while the menu still offered Unlock.
    const { container } = render(
      <FanCard channel={makeChannel({ controlled: false, locked: true })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}} />,
    );
    expect(container.querySelector('[class*="fanLockGlyph"]')).toBeTruthy();
  });

  it('offers only the turn-on row, so the state is always reversible', () => {
    render(
      <FanCard channel={makeChannel({ controlled: false, locked: true })} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));
    expect(screen.getByText('cooling.fan.menuControlOn')).toBeTruthy();
    // Lock is meaningless while nothing drives the channel.
    expect(screen.queryByText('cooling.lock.unlock')).toBeNull();
  });
});

describe('FanCard move-to-group flyout', () => {
  function openMenu(move: NonNullable<Parameters<typeof FanCard>[0]['groupMove']>) {
    render(
      <FanCard channel={makeChannel()} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}} groupMove={move} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));
  }

  it('lists every group behind one row, and moves the fan into the one picked', () => {
    const onMove = vi.fn();
    openMenu({ targets: [{ id: 'g1', name: 'Front' }, { id: 'g2', name: 'Top' }], onMove });
    expect(screen.queryByText('Front')).toBeNull();
    fireEvent.click(screen.getByText('cooling.fan.moveToGroup'));
    fireEvent.click(screen.getByText('Top'));
    expect(onMove).toHaveBeenCalledWith('g2');
  });

  it('carries no row at all when there is nowhere to move the fan', () => {
    openMenu({ targets: [], onMove: vi.fn() });
    expect(screen.queryByText('cooling.fan.moveToGroup')).toBeNull();
  });
});

describe('FanCard menu bands', () => {
  it('splits naming and grouping off from the actions below', () => {
    render(
      <FanCard channel={makeChannel()} state={manualState} curves={[]}
        onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={() => {}}
        onToggleLock={() => {}} onSetRole={() => {}} onToggleControlled={() => {}}
        onSelectOnly={() => {}}
        groupMove={{ targets: [{ id: 'g1', name: 'Front' }], onMove: () => {} }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));
    const menu = document.querySelector('[class*="_menu_"]')!;
    const rows = Array.from(menu.children).map(c => c.tagName === 'BUTTON' ? c.textContent?.trim() : '|');
    expect(rows[0]).toMatch(/^cooling\.fan\.selectOnly/);
    expect(rows[1]).toBe('|');
    // Naming and grouping close the menu, behind a rule of their own.
    expect(rows.slice(-3)).toEqual(['|', 'cooling.fan.rename', 'cooling.fan.moveToGroup']);
  });
});
