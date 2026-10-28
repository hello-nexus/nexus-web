import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoneCard, zoneCardSelectable, zoneCardSelectionHoldable, type BulkSelection } from './ZoneCard';
import type { LightingDevice } from '../../../../api/lighting';
import type { SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../LightingPage.module.scss';

// Params are appended so assertions can pin what actually reaches a label -
// a bare `key` mock would pass even if the interpolation object were dropped.
// The language is mutable so a test can check which plural form a call site
// asks for.
const i18n = vi.hoisted(() => ({ language: 'en' }));
vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: i18n.language,
  }),
}));

afterEach(() => { i18n.language = 'en'; });

const baseDevice: LightingDevice = {
  id: 'openrgb-0',
  name: 'Test Strip',
  ledsOn: true,
  ledCount: 10,
  canvasX: 0,
  canvasY: 0,
  canvasW: 1,
  canvasH: 1,
  canvasRotation: 0,
};

function renderCard(device: LightingDevice) {
  return render(
    <ZoneCard
      device={device}
      selected={false}
      indent={false}
      onSelect={() => {}}
      onTogglePower={() => {}}
      onToggleControlled={() => {}}
      onOpenSettings={() => {}}
    />,
  );
}

describe('ZoneCard state chip', () => {
  it('shows no chip and does not dim the card in the default state', () => {
    renderCard(baseDevice);
    expect(screen.queryByText('lighting.devices.stateNotControlled')).toBeNull();
    expect(screen.queryByText('lighting.devices.stateLightsOff')).toBeNull();
    const card = document.querySelector(`.${styles.deviceCard}`);
    expect(card?.className).not.toContain(styles.deviceCardPoweredOff);
  });

  it('names the ignored state persistently, in place of the LED count', () => {
    renderCard({ ...baseDevice, controlled: false });
    expect(screen.getByText('lighting.devices.stateNotControlled')).toBeTruthy();
    // An un-driven device has nothing to read out, so the badge stands in.
    expect(document.querySelector(`.${styles.deviceMetaCount}`)).toBeNull();
    const card = document.querySelector(`.${styles.deviceCard}`);
    expect(card?.className).toContain(styles.deviceCardPoweredOff);
  });

  it('keeps the LED count on a card in its default state', () => {
    renderCard(baseDevice);
    expect(document.querySelector(`.${styles.deviceMetaCount}`)?.textContent).toBe('10');
  });

  it('names the lights-off state, which the ignored chip would otherwise mask', () => {
    renderCard({ ...baseDevice, ledsOn: false });
    expect(screen.getByText('lighting.devices.stateLightsOff')).toBeTruthy();
  });

  it('shows only the ignored chip when the device is both ignored and off', () => {
    renderCard({ ...baseDevice, ledsOn: false, controlled: false });
    expect(screen.getByText('lighting.devices.stateNotControlled')).toBeTruthy();
    expect(screen.queryByText('lighting.devices.stateLightsOff')).toBeNull();
  });

  it('treats an undefined controlled field as controlled (older service)', () => {
    renderCard(baseDevice);
    expect(screen.queryByText('lighting.devices.stateNotControlled')).toBeNull();
  });
});

describe('ZoneCard actions menu', () => {
  // Icon assertions are load-bearing: an inverted glyph reads fine in the
  // source and every label-only test stays green.
  const rowIcon = (namePattern: RegExp) =>
    screen.getByRole('button', { name: namePattern }).querySelector('svg')?.getAttribute('class');

  it('labels both rows with the action they perform, not the state they are in', () => {
    renderCard({ ...baseDevice, controlled: false, ledsOn: true });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(rowIcon(/menuControlOn/)?.split(' ')).toContain('lucide-link-2');
    expect(rowIcon(/menuLightsOff/)).toContain('lucide-power-off');
  });

  it('flips both labels and icons when the state flips', () => {
    renderCard({ ...baseDevice, controlled: true, ledsOn: false });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(rowIcon(/menuControlOff/)?.split(' ')).toContain('lucide-link-2-off');
    // lucide-power-off also contains "lucide-power", so pin the exact class.
    expect(rowIcon(/menuLightsOn/)?.split(' ')).toContain('lucide-power');
  });

  it('fires the controlled toggle from its menu row', () => {
    const onToggleControlled = vi.fn();
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={onToggleControlled}
        onOpenSettings={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    fireEvent.click(screen.getByRole('button', { name: /menuControlOff/ }));
    expect(onToggleControlled).toHaveBeenCalledTimes(1);
  });

  it('closes on a second press of the button that opened it', () => {
    renderCard(baseDevice);
    const btn = screen.getByRole('button', { name: 'lighting.devices.moreActions' });
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /menuLightsOff/ })).toBeTruthy();
    // jsdom fires no pointerdown, so this exercises the explicit toggle only -
    // in a browser the menu's outside-pointerdown close runs first and lands
    // on the same closed state.
    fireEvent.click(btn);
    expect(screen.queryByRole('button', { name: /menuLights/ })).toBeNull();
  });

  it('reopens at a new position after a right-click elsewhere', () => {
    renderCard(baseDevice);
    const card = document.querySelector(`.${styles.deviceCard}`)!;
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    fireEvent.contextMenu(card, { clientX: 400, clientY: 300 });
    expect(screen.getByRole('button', { name: /menuLightsOff/ })).toBeTruthy();
  });

  it('opens on right-click and suppresses the browser menu', () => {
    renderCard(baseDevice);
    const card = document.querySelector(`.${styles.deviceCard}`)!;
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.contextMenu(card)).toBe(false);
    expect(screen.getByRole('button', { name: /menuLightsOff/ })).toBeTruthy();
  });

  it('drops the stateful rows for a detection-failed card', () => {
    renderCard({ ...baseDevice, ledCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(screen.getByRole('button', { name: /ledMap.settings/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /menuControl/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /menuLights/ })).toBeNull();
  });

  it('is the card\'s only action affordance: identify and settings live in it', () => {
    renderCard(baseDevice);
    expect(screen.queryByRole('button', { name: 'lighting.devices.identify' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.settings' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(screen.getByRole('button', { name: /devices.identify/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ledMap.settings/ })).toBeTruthy();
  });
});

describe('ZoneCard bulk selection', () => {
  function bulkProps(over: Partial<BulkSelection> = {}): BulkSelection {
    return {
      count: 3,
      identifyCount: 3,
      controlled: true,
      ledsOn: true,
      setControlled: vi.fn(),
      setPower: vi.fn(),
      identify: vi.fn(),
      ...over,
    };
  }

  function renderBulk(bulk: BulkSelection, device: LightingDevice = baseDevice) {
    render(
      <ZoneCard
        device={device}
        selected
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
        bulk={bulk}
      />,
    );
  }

  function renderBulkAndOpen(bulk: BulkSelection, device: LightingDevice = baseDevice) {
    renderBulk(bulk, device);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
  }

  it('labels every row with the selection count', () => {
    renderBulkAndOpen(bulkProps());
    // The count must reach the label, not just the key.
    expect(screen.getByRole('button', { name: /menuControlOffCount.*"count":3/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /menuLightsOffCount.*"count":3/ })).toBeTruthy();
  });

  it('leads with Customize even when the selection spans devices, opening this card', () => {
    const onOpenSettings = vi.fn();
    render(
      <ZoneCard
        device={baseDevice}
        selected
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={onOpenSettings}
        bulk={bulkProps()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    const first = document.querySelector('[class*="_menu_"]')!.children[0];
    expect(first.textContent).toBe('lighting.ledMap.settings');
    fireEvent.click(first);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('drives the whole selection to one state, not per-device toggles', () => {
    const bulk = bulkProps({ controlled: true, ledsOn: false });
    const onToggleControlled = vi.fn();
    render(
      <ZoneCard
        device={baseDevice}
        selected
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={onToggleControlled}
        onOpenSettings={() => {}}
        bulk={bulk}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    fireEvent.click(screen.getByRole('button', { name: /menuControlOffCount/ }));
    expect(bulk.setControlled).toHaveBeenCalledWith(false);
    // The per-card handler must not also fire, or the card would flip back.
    expect(onToggleControlled).not.toHaveBeenCalled();
  });

  it('still offers Customize when the selection leaves this card nothing else', () => {
    // Detection-failed card: no identify and no state rows.
    renderBulkAndOpen(bulkProps({ identifyCount: 0 }), { ...baseDevice, ledCount: 0 });
    const rows = Array.from(document.querySelector('[class*="_menu_"]')!.children).map(c => c.textContent);
    expect(rows).toEqual(['lighting.ledMap.settings']);
  });

  it.each(['pl', 'ru', 'cs'])('asks %s for the CLDR few form at 3', (language) => {
    i18n.language = language;
    renderBulkAndOpen(bulkProps({ count: 3, identifyCount: 3 }));
    expect(screen.getByRole('button', { name: /menuControlOffCount\.few/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /identifyCount\.few/ })).toBeTruthy();
  });

  it('asks a language with no few category for the plain plural', () => {
    i18n.language = 'en';
    renderBulkAndOpen(bulkProps({ count: 3, identifyCount: 3 }));
    expect(screen.getByRole('button', { name: /menuControlOffCount\.other/ })).toBeTruthy();
  });

  it('counts only the members that can actually flash', () => {
    renderBulkAndOpen(bulkProps({ count: 5, identifyCount: 3 }));
    expect(screen.getByRole('button', { name: /identifyCount.*"count":3/ })).toBeTruthy();
  });

  it('reads the aggregate state, not this card\'s own', () => {
    // This card is lit, but nothing else in the selection is: the row offers
    // to turn the selection on.
    renderBulkAndOpen(bulkProps({ ledsOn: false }), { ...baseDevice, ledsOn: true });
    expect(screen.getByRole('button', { name: /menuLightsOnCount/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /menuLightsOffCount/ })).toBeNull();
  });
});

describe('ZoneCard drag wiring', () => {
  it('keeps dnd-kit keyboard attributes and listeners in normal mode', () => {
    const dragKeyDown = vi.fn();
    const drag = {
      ref: () => {},
      style: {},
      attributes: { role: 'button', tabIndex: 0 },
      listeners: { onKeyDown: dragKeyDown },
      isDragging: false,
      placeholderClassName: '',
    } as unknown as SortableRowArgs;
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
        drag={drag}
      />,
    );
    const card = document.querySelector(`.${styles.deviceCard}`)!;
    // The toggleMode props are undefined here and must not erase the drag
    // spread's role/tabIndex/onKeyDown (they compile later in the props list).
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(card, { key: 'ArrowDown' });
    expect(dragKeyDown).toHaveBeenCalled();
  });
});

describe('ZoneCard toggleMode', () => {
  function renderToggleCard(device: LightingDevice, onToggleControlled = vi.fn()) {
    render(
      <ZoneCard
        device={device}
        toggleMode
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={onToggleControlled}
        onOpenSettings={() => {}}
      />,
    );
    return onToggleControlled;
  }

  it('makes the whole card a switch named after the device, checked when controlled', () => {
    renderToggleCard(baseDevice);
    const card = screen.getByRole('switch', { name: 'Test Strip' });
    expect(card.getAttribute('aria-checked')).toBe('true');
    expect(card.className).toContain(styles.deviceCardSelected);
  });

  it('unchecks and dims the card when the device is ignored', () => {
    renderToggleCard({ ...baseDevice, controlled: false });
    const card = screen.getByRole('switch', { name: 'Test Strip' });
    expect(card.getAttribute('aria-checked')).toBe('false');
    expect(card.className).toContain(styles.deviceCardPoweredOff);
    expect(card.className).not.toContain(styles.deviceCardSelected);
  });

  it('fires onToggleControlled from a card click and from Enter/Space', () => {
    const onToggle = renderToggleCard(baseDevice);
    const card = screen.getByRole('switch', { name: 'Test Strip' });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it('hides the actions menu but still says when Nexus is not driving the device', () => {
    renderToggleCard({ ...baseDevice, controlled: false });
    expect(screen.queryByRole('button', { name: 'lighting.devices.moreActions' })).toBeNull();
    // The same chip the lighting page shows, so an ignored device reads the
    // same wherever the card appears.
    expect(screen.getByText('lighting.devices.stateNotControlled')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Test Strip' }).getAttribute('aria-checked')).toBe('false');
  });

  it('says nothing about power, which this card cannot change', () => {
    renderToggleCard({ ...baseDevice, controlled: true, ledsOn: false });
    expect(screen.queryByText('lighting.devices.stateLightsOff')).toBeNull();
  });

  it('does not open the actions menu on right-click', () => {
    renderToggleCard(baseDevice);
    const card = screen.getByRole('switch', { name: 'Test Strip' });
    fireEvent.contextMenu(card);
    expect(screen.queryByRole('button', { name: /menuLights/ })).toBeNull();
  });

  it('does not toggle an unavailable (detection-failed) card', () => {
    const onToggle = vi.fn();
    render(
      <ZoneCard
        device={{ ...baseDevice, ledCount: 0 }}
        toggleMode
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={onToggle}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.queryByRole('switch', { name: 'Test Strip' })).toBeNull();
    const card = document.querySelector(`.${styles.deviceCard}`)!;
    fireEvent.click(card);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('ZoneCard selection gate', () => {
  it('takes a card-click selection in the default state', () => {
    const onSelect = vi.fn();
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={onSelect}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    fireEvent.click(document.querySelector(`.${styles.deviceCard}`)!);
    expect(onSelect).toHaveBeenCalled();
  });

  it('carries no leading control at all', () => {
    renderCard(baseDevice);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('drops the checkbox but still takes a card-click with Nexus Control off', () => {
    const onSelect = vi.fn();
    render(
      <ZoneCard
        device={{ ...baseDevice, controlled: false }}
        selected={false}
        indent={false}
        onSelect={onSelect}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    fireEvent.click(document.querySelector(`.${styles.deviceCard}`)!);
    // Selecting is how the user reaches the row that turns control back on.
    expect(onSelect).toHaveBeenCalled();
  });

  it('still lets toggle mode switch an un-driven device back on', () => {
    const onToggle = vi.fn();
    render(
      <ZoneCard
        device={{ ...baseDevice, controlled: false }}
        toggleMode
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={onToggle}
        onOpenSettings={() => {}}
      />,
    );
    fireEvent.click(document.querySelector(`.${styles.deviceCard}`)!);
    expect(onToggle).toHaveBeenCalled();
  });

  it('zoneCardSelectable rejects un-driven, dark and detection-failed devices', () => {
    expect(zoneCardSelectable(baseDevice)).toBe(true);
    expect(zoneCardSelectable({ ...baseDevice, controlled: false })).toBe(false);
    expect(zoneCardSelectable({ ...baseDevice, ledsOn: false })).toBe(false);
    expect(zoneCardSelectable({ ...baseDevice, ledCount: 0 })).toBe(false);
    expect(zoneCardSelectable({ ...baseDevice, devicePageReason: 'firmware' })).toBe(false);
  });

  it('zoneCardSelectionHoldable keeps dark cards but drops device-page cards', () => {
    expect(zoneCardSelectionHoldable({ ...baseDevice, ledsOn: false })).toBe(true);
    expect(zoneCardSelectionHoldable({ ...baseDevice, devicePageReason: 'argbInput' })).toBe(false);
    expect(zoneCardSelectionHoldable({ ...baseDevice, ledCount: 0 })).toBe(false);
  });

  it('drops the checkbox but still takes a card-click with the lights off', () => {
    const onSelect = vi.fn();
    render(
      <ZoneCard
        device={{ ...baseDevice, ledsOn: false }}
        selected={false}
        indent={false}
        onSelect={onSelect}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.getByText('lighting.devices.stateLightsOff')).toBeTruthy();
    fireEvent.click(document.querySelector(`.${styles.deviceCard}`)!);
    expect(onSelect).toHaveBeenCalled();
  });
});

describe('ZoneCard select-only row', () => {
  function renderWithSelectOnly(onSelectOnly?: () => void, over: { selected?: boolean; onSelect?: (a: boolean) => void } = {}) {
    return render(
      <ZoneCard
        device={baseDevice}
        selected={over.selected ?? false}
        indent={false}
        onSelect={over.onSelect ?? (() => {})}
        onSelectOnly={onSelectOnly}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
      />,
    );
  }

  it('omits the row when nothing passed it (one card or none selected)', () => {
    renderWithSelectOnly(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(screen.queryByText(/lighting\.devices\.selectOnly/)).toBeNull();
  });

  it('names the device and fires the narrow', () => {
    const onSelectOnly = vi.fn();
    renderWithSelectOnly(onSelectOnly);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    const row = screen.getByText(/lighting\.devices\.selectOnly/);
    // The label interpolates the card's own name, so the row is unambiguous.
    expect(row.textContent).toContain('Test Strip');
    fireEvent.click(row);
    expect(onSelectOnly).toHaveBeenCalledTimes(1);
  });

  it('offers Deselect instead once this card IS the whole selection', () => {
    const onSelect = vi.fn();
    renderWithSelectOnly(vi.fn(), { selected: true, onSelect });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(screen.queryByText(/lighting\.devices\.selectOnly/)).toBeNull();
    fireEvent.click(screen.getByText('lighting.devices.deselect'));
    // Additive toggle on an already-selected card clears it.
    expect(onSelect).toHaveBeenCalledWith(true);
  });
});

describe('ZoneCard menu highlight', () => {
  const openMenuFor = (device: LightingDevice) => {
    renderCard(device);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    return (label: string) =>
      screen.getAllByRole('button').find(b => (b.textContent ?? '').includes(label));
  };

  it('leaves both rows plain when the device is driven and lit', () => {
    const row = openMenuFor(baseDevice);
    expect(row('lighting.devices.menuControlOff')?.className).not.toContain('itemAccent');
    expect(row('lighting.devices.menuLightsOff')?.className).not.toContain('itemAccent');
  });

  it('accents the lights row when only the lights are off', () => {
    const row = openMenuFor({ ...baseDevice, ledsOn: false });
    expect(row('lighting.devices.menuLightsOn')?.className).toContain('itemAccent');
    expect(row('lighting.devices.menuControlOff')?.className).not.toContain('itemAccent');
  });

  it('accents only the control row while the device is un-driven', () => {
    const row = openMenuFor({ ...baseDevice, controlled: false, ledsOn: false });
    expect(row('lighting.devices.menuControlOn')?.className).toContain('itemAccent');
    // Power is moot until Nexus drives it again, so that row stays plain.
    expect(row('lighting.devices.menuLightsOn')?.className).not.toContain('itemAccent');
  });

  it('offers select-only on a card whose lights are off, which a click can select', () => {
    render(
      <ZoneCard
        device={{ ...baseDevice, ledsOn: false }}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onSelectOnly={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(screen.getByText(/lighting\.devices\.selectOnly/)).toBeTruthy();
  });

  it('offers select-only on a selectable card even with nothing else selected', () => {
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onSelectOnly={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(screen.getByText(/lighting\.devices\.selectOnly/)).toBeTruthy();
  });
});


describe('ZoneCard rename', () => {
  const renderRenameable = (
    props: Partial<React.ComponentProps<typeof ZoneCard>> = {},
    onRename: (name: string) => void = () => {},
  ) => render(
    <ZoneCard
      device={baseDevice}
      selected={false}
      indent={false}
      onSelect={() => {}}
      onTogglePower={() => {}}
      onToggleControlled={() => {}}
      onOpenSettings={() => {}}
      onRename={onRename}
      {...props}
    />,
  );

  const startRename = () => {
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    fireEvent.click(screen.getByText('lighting.devices.rename'));
  };

  it('commits the trimmed name on Enter', () => {
    const onRename = vi.fn();
    renderRenameable({}, onRename);
    startRename();
    const input = screen.getByDisplayValue('Test Strip');
    fireEvent.change(input, { target: { value: '  Top intake  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Top intake');
  });

  it('does not start a rename when the name is clicked', () => {
    renderRenameable({ onSelect: vi.fn() });
    fireEvent.click(screen.getByText('Test Strip'));
    expect(screen.queryByDisplayValue('Test Strip')).toBeNull();
  });

  it('selects the card when the name is clicked, like any other part of it', () => {
    // The name used to swallow the click so it could open an editor; with
    // rename on the menu it is just part of the card surface.
    const onSelect = vi.fn();
    renderRenameable({ onSelect });
    fireEvent.click(screen.getByText('Test Strip'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('edits the shown name, so a grouped zone renames off its stripped label', () => {
    const onRename = vi.fn();
    renderRenameable({ displayName: 'ARGB header 1', indent: true }, onRename);
    startRename();
    expect(screen.getByDisplayValue('ARGB header 1')).toBeTruthy();
  });

  it('leaves the name a plain label where the card is only a pick target', () => {
    renderRenameable({ selectOnly: true });
    fireEvent.click(screen.getByText('Test Strip'));
    expect(screen.queryByDisplayValue('Test Strip')).toBeNull();
  });

  it('leaves the name a plain label on a detection-failed card', () => {
    renderRenameable({ device: { ...baseDevice, ledCount: 0 } });
    fireEvent.click(screen.getByText('Test Strip'));
    expect(screen.queryByDisplayValue('Test Strip')).toBeNull();
  });
});

describe('ZoneCard move-to-group flyout', () => {
  const groupMove = (over: Partial<Parameters<typeof ZoneCard>[0]['groupMove'] & object> = {}) => ({
    targets: [{ id: 'g1', name: 'Desk' }, { id: 'g2', name: 'Shelf' }],
    onMove: vi.fn(),
    ...over,
  });

  function openMenu(move: NonNullable<Parameters<typeof ZoneCard>[0]['groupMove']>) {
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
        groupMove={move}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
  }

  it('lists every group behind one row, and moves the card into the one picked', () => {
    const move = groupMove();
    openMenu(move);
    const row = screen.getByText('lighting.devices.moveToGroup');
    expect(screen.queryByText('Desk')).toBeNull();
    fireEvent.click(row);
    fireEvent.click(screen.getByText('Shelf'));
    expect(move.onMove).toHaveBeenCalledWith('g2');
  });

  it('offers the group it already sits in no row, and names it on the leave row', () => {
    const run = vi.fn();
    const move = groupMove({ targets: [{ id: 'g2', name: 'Shelf' }], onRemove: { name: 'Desk', run } });
    openMenu(move);
    fireEvent.click(screen.getByText('lighting.devices.moveToGroup'));
    // Desk is where it sits, so it is not a target - only the leave row names it.
    expect(screen.queryByText('Desk')).toBeNull();
    const leave = screen.getByText(/^lighting\.devices\.removeFromGroup/);
    expect(leave.textContent).toContain('Desk');
    fireEvent.click(leave);
    expect(run).toHaveBeenCalled();
  });

  it('carries no row at all when there is nowhere to move the card', () => {
    openMenu({ targets: [], onMove: vi.fn() });
    expect(screen.queryByText('lighting.devices.moveToGroup')).toBeNull();
  });
});

describe('ZoneCard menu bands', () => {
  it('bands editors, toggles, identify + select, then naming and grouping', () => {
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onSelectOnly={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
        onOpenColorTuning={() => {}}
        onRename={() => {}}
        groupMove={{ targets: [{ id: 'g1', name: 'Desk' }], onMove: () => {} }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    const menu = document.querySelector('[class*="_menu_"]')!;
    // The select row interpolates the card name, so keep its key only.
    const rows = Array.from(menu.children).map(c => c.tagName === 'BUTTON' ? c.textContent!.trim().replace(/^(lighting\.devices\.selectOnly).*/, '$1') : '|');
    expect(rows).toEqual([
      'lighting.ledMap.settings', 'lighting.colorTuning.menu', '|',
      'lighting.devices.menuLightsOff', 'lighting.devices.menuControlOff', '|',
      'lighting.devices.identify', 'lighting.devices.selectOnly', '|',
      'lighting.devices.rename', 'lighting.devices.moveToGroup',
    ]);
  });
});

describe('ZoneCard stacked', () => {
  const cardClass = () => document.querySelector(`.${styles.deviceCard}`)?.className ?? '';
  const renderStacked = (stacked: 'inner' | 'last') => render(
    <ZoneCard device={baseDevice} selected={false} indent={false} onSelect={() => {}} stacked={stacked} />,
  );

  it('carries no stack classes on its own', () => {
    renderCard(baseDevice);
    expect(cardClass()).not.toContain(styles.deviceCardStacked);
    expect(cardClass()).not.toContain(styles.deviceCardStackLast);
  });

  it('squares its corners and seams to the row above as an inner member', () => {
    renderStacked('inner');
    expect(cardClass()).toContain(styles.deviceCardStacked);
    expect(cardClass()).not.toContain(styles.deviceCardStackLast);
  });

  it('keeps the bottom corners as the last member', () => {
    renderStacked('last');
    expect(cardClass()).toContain(styles.deviceCardStacked);
    expect(cardClass()).toContain(styles.deviceCardStackLast);
  });
});

describe('ZoneCard pick target', () => {
  const cardOf = (target: boolean, selected = false) => {
    render(
      <ZoneCard
        device={baseDevice} selected={selected} indent={false} onSelect={() => {}}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        target={target}
      />,
    );
    return document.querySelector(`.${styles.deviceCard}`)!.className;
  };

  it('outlines a card a pick lands on, and only that card', () => {
    expect(cardOf(true)).toContain(styles.deviceCardTarget);
    cleanup();
    expect(cardOf(false)).not.toContain(styles.deviceCardTarget);
  });
});

describe('ZoneCard pin', () => {
  const button = (name: string) => screen.queryByRole('button', { name }) as HTMLButtonElement | null;
  const menuRow = (re: RegExp) => screen.queryAllByRole('button').find(b => re.test(b.textContent ?? '')) ?? null;
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
  const renderPin = (pin: Partial<NonNullable<Parameters<typeof ZoneCard>[0]['pin']>>, extra: Partial<Parameters<typeof ZoneCard>[0]> = {}) => render(
    <ZoneCard
      device={baseDevice} selected={false} indent={false} onSelect={() => {}}
      onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
      pin={{ pinned: false, setPinned: () => {}, ...pin }}
      {...extra}
    />,
  );

  it('renders no pin button and no rows without a pin prop', () => {
    renderCard(baseDevice);
    expect(button('lighting.pin.pinTo:{"name":""}')).toBeNull();
    openMenu();
    expect(menuRow(/lighting\.devices\.(un)?pin$/)).toBeNull();
  });

  it('plays a pulse for a press after it mounted, never for one before', () => {
    const { rerender } = renderPin({}, { pulseSeq: 3 });
    expect(document.querySelector(`.${styles.deviceCardPulse}`)).toBeNull();
    rerender(
      <ZoneCard
        device={baseDevice} selected={false} indent={false} onSelect={() => {}}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        pin={{ pinned: false, setPinned: () => {} }}
        pulseSeq={4}
      />,
    );
    expect(document.querySelector(`.${styles.deviceCardPulse}`)).toBeTruthy();
  });

  it('shows no pin on a following card', () => {
    renderPin({});
    expect(document.querySelector(`.${styles.devicePinBtn}`)).toBeNull();
  });

  it('shows the pin on a pinned card, named for its target, and a press unpins', () => {
    const setPinned = vi.fn();
    renderPin({ pinned: true, targetName: 'Aurora', setPinned });
    const btn = button('lighting.pin.pinnedTo:{"name":"Aurora"}')!;
    fireEvent.click(btn);
    expect(setPinned).toHaveBeenCalledWith(false);
  });

  it.each([
    ['static', 'lucide-palette'], ['animate', 'lucide-sparkles'], ['mirror', 'lucide-monitor'], ['media', 'lucide-film'],
  ] as const)('wears the tab icon of a %s pin, with PinOff for the hover', (kind, icon) => {
    renderPin({ pinned: true, targetName: 'Aurora', kind });
    const btn = button('lighting.pin.pinnedTo:{"name":"Aurora"}')!;
    expect(btn.querySelector(`.${styles.devicePinMode}`)?.classList.contains(icon)).toBe(true);
    expect(btn.querySelector(`.${styles.devicePinOff}`)?.classList.contains('lucide-pin-off')).toBe(true);
  });

  it('keeps the button after the strip and does not select the card when pressed', () => {
    const onSelect = vi.fn();
    renderPin({ pinned: true, targetName: 'Aurora' }, { onSelect });
    const row = document.querySelector(`.${styles.deviceMetaRow}`)!;
    const order = [...row.children].map(el =>
      el.classList.contains(styles.ledStrip) ? 'strip'
        : el.classList.contains(styles.devicePinBtn) ? 'pin' : null,
    ).filter(Boolean);
    expect(order).toEqual(['strip', 'pin']);
    fireEvent.click(button('lighting.pin.pinnedTo:{"name":"Aurora"}')!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers no Pin where nothing can be pinned', () => {
    renderPin({ disabledReason: 'lighting.pin.disabledMedia' });
    expect(button('lighting.pin.disabledMedia')).toBeNull();
    openMenu();
    expect(menuRow(/^lighting\.devices\.pin/)).toBeNull();
  });

  it('offers Pin in the menu on a following card and Unpin on a pinned one', () => {
    const setPinned = vi.fn();
    renderPin({ setPinned });
    openMenu();
    fireEvent.click(menuRow(/^lighting\.devices\.pinlighting\.pin\.pinDesc$/)!);
    expect(setPinned).toHaveBeenCalledWith(true);
    expect(menuRow(/^lighting\.devices\.unpin/)).toBeNull();
  });

  it('offers Unpin, and no Pin, on a pinned card', () => {
    const setPinned = vi.fn();
    renderPin({ pinned: true, targetName: 'x', setPinned });
    openMenu();
    expect(menuRow(/^lighting\.devices\.pin/)).toBeNull();
    fireEvent.click(menuRow(/^lighting\.devices\.unpinlighting\.pin\.unpinDesc$/)!);
    expect(setPinned).toHaveBeenCalledWith(false);
  });

  it('describes what a pin does under the menu row and on the pin icon', () => {
    renderPin({ pinned: true, targetName: 'Aurora' });
    fireEvent.focus(button('lighting.pin.pinnedTo:{"name":"Aurora"}')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('lighting.pin.tooltipBody');
    openMenu();
    expect(menuRow(/^lighting\.devices\.unpinlighting\.pin\.unpinDesc$/)).not.toBeNull();
  });

  it('counts the members each row reaches in a selection', () => {
    const setPinned = vi.fn();
    render(
      <ZoneCard
        device={baseDevice} selected indent={false} onSelect={() => {}}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        pin={{ pinned: false, setPinned: () => {} }}
        bulk={{
          count: 3, identifyCount: 3, tunableCount: 3, controlled: true, ledsOn: true,
          setControlled: () => {}, setPower: () => {}, identify: () => {},
          pinCount: 2, unpinCount: 1, setPinned,
        }}
      />,
    );
    openMenu();
    fireEvent.click(menuRow(/pinCount\.other:\{"count":2\}/)!);
    expect(setPinned).toHaveBeenCalledWith(true);
    fireEvent.click(menuRow(/unpinCount\.one:\{"count":1\}/)!);
    expect(setPinned).toHaveBeenCalledWith(false);
  });
});

describe('ZoneCard LED colours badge', () => {
  const badge = () => screen.queryByRole('button', { name: 'lighting.devices.ledColorsBadge' }) as HTMLButtonElement | null;
  const renderWith = (device: LightingDevice, extra: Partial<Parameters<typeof ZoneCard>[0]> = {}) => render(
    <ZoneCard
      device={device} selected={false} indent={false} onSelect={() => {}}
      onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
      {...extra}
    />,
  );

  it('shows no badge when no LED holds a colour', () => {
    renderWith(baseDevice);
    expect(badge()).toBeNull();
  });

  it('badges beside the pin and opens the LED map without clearing anything', () => {
    const onOpenSettings = vi.fn();
    const setPinned = vi.fn();
    renderWith(
      { ...baseDevice, ledColors: [{ index: 0, color: '#ff0000' }] },
      { onOpenSettings, pin: { pinned: true, targetName: 'Aurora', setPinned } },
    );
    expect(screen.getByRole('button', { name: 'lighting.pin.pinnedTo:{"name":"Aurora"}' })).toBeTruthy();
    fireEvent.click(badge()!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(setPinned).not.toHaveBeenCalled();
  });
});

describe('ZoneCard color tuning badge', () => {
  const badge = () => screen.queryByRole('button', { name: 'lighting.colorTuning.title' });

  it('opens color tuning without selecting the card', () => {
    const onOpenColorTuning = vi.fn();
    const onSelect = vi.fn();
    render(
      <ZoneCard
        device={baseDevice} selected={false} indent={false} onSelect={onSelect}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        colorTuned onOpenColorTuning={onOpenColorTuning}
      />,
    );
    fireEvent.click(badge()!);
    expect(onOpenColorTuning).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['toggle mode', { toggleMode: true }],
    ['unavailable', { device: { ...baseDevice, ledCount: 0 } }],
    ['firmware-owned', { firmwareControlled: true }],
    ['not selectable', { device: { ...baseDevice, ledsOn: false } }],
  ] as const)('stays a plain mark when the card is %s', (_name, extra) => {
    const onOpenColorTuning = vi.fn();
    render(
      <ZoneCard
        device={baseDevice} selected={false} indent={false} onSelect={() => {}}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        colorTuned onOpenColorTuning={onOpenColorTuning}
        {...(extra as object)}
      />,
    );
    expect(badge()).toBeNull();
    expect(screen.getByRole('img', { name: 'lighting.colorTuning.title' })).toBeTruthy();
  });

  it('stays a plain mark when nothing can open the modal', () => {
    render(
      <ZoneCard
        device={baseDevice} selected={false} indent={false} onSelect={() => {}}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        colorTuned
      />,
    );
    expect(badge()).toBeNull();
    expect(screen.getByRole('img', { name: 'lighting.colorTuning.title' })).toBeTruthy();
  });
});

describe('ZoneCard key reactions row', () => {
  const openMenu = (props: { onOpenKeyReactions?: () => void; bulk?: BulkSelection }) => {
    render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onOpenSettings={() => {}}
        {...props}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
  };

  it('offers the row and opens the modal for a per-key keyboard', () => {
    const onOpenKeyReactions = vi.fn();
    openMenu({ onOpenKeyReactions });
    fireEvent.click(screen.getByText('lighting.keyReactions.menu'));
    expect(onOpenKeyReactions).toHaveBeenCalledTimes(1);
  });

  it('leaves the row off a card that is not a per-key keyboard', () => {
    openMenu({});
    expect(screen.queryByText('lighting.keyReactions.menu')).toBeNull();
  });

  it('shows the Type reactive badge only while it is on, and opens the editor from it', () => {
    const onOpenKeyReactions = vi.fn();
    const { rerender } = render(
      <ZoneCard device={baseDevice} selected={false} indent={false} onSelect={() => {}} onOpenKeyReactions={onOpenKeyReactions} />,
    );
    expect(screen.queryByRole('button', { name: 'lighting.keyReactions.badge' })).toBeNull();
    rerender(
      <ZoneCard device={baseDevice} selected={false} indent={false} onSelect={() => {}} onOpenKeyReactions={onOpenKeyReactions} typeReactiveOn />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.keyReactions.badge' }));
    expect(onOpenKeyReactions).toHaveBeenCalledTimes(1);
  });

  it('keeps the row for the right-clicked keyboard inside a selection', () => {
    const onOpenKeyReactions = vi.fn();
    const bulk: BulkSelection = {
      count: 3, identifyCount: 3, controlled: true, ledsOn: true,
      setControlled: vi.fn(), setPower: vi.fn(), identify: vi.fn(),
    };
    openMenu({ onOpenKeyReactions, bulk });
    fireEvent.click(screen.getByText('lighting.keyReactions.menu'));
    expect(onOpenKeyReactions).toHaveBeenCalledTimes(1);
  });
});

describe('ZoneCard firmware-owned menu', () => {
  function renderFirmwareCard(props: { onTakeControl?: () => void; onOpenDevicePage?: () => void; onRename?: (name: string) => void }) {
    return render(
      <ZoneCard
        device={baseDevice}
        selected={false}
        indent={false}
        onSelect={() => {}}
        onTogglePower={() => {}}
        onToggleControlled={() => {}}
        onOpenSettings={() => {}}
        firmwareControlled
        {...props}
      />,
    );
  }

  it('offers the device page and take control on right-click, and nothing that cannot act', () => {
    const onOpenDevicePage = vi.fn();
    const onTakeControl = vi.fn();
    renderFirmwareCard({ onOpenDevicePage, onTakeControl });
    fireEvent.contextMenu(document.querySelector(`.${styles.deviceCard}`)!);
    expect(screen.getByRole('button', { name: /menuTakeControl/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ledMap.settings/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /menuOpenDevicePage/ }));
    expect(onOpenDevicePage).toHaveBeenCalledTimes(1);
    expect(onTakeControl).not.toHaveBeenCalled();
  });

  it('keeps renaming, and drops the engine-only power and control rows', () => {
    renderFirmwareCard({ onOpenDevicePage: () => {}, onRename: () => {} });
    fireEvent.contextMenu(document.querySelector(`.${styles.deviceCard}`)!);
    expect(screen.getByRole('button', { name: /lighting.devices.rename/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /menuLightsOff/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /menuControlOff/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /lighting.devices.identify/ })).toBeNull();
  });

  it('opens a menu for the device page alone when control cannot be taken', () => {
    renderFirmwareCard({ onOpenDevicePage: () => {} });
    fireEvent.contextMenu(document.querySelector(`.${styles.deviceCard}`)!);
    expect(screen.getByRole('button', { name: /menuOpenDevicePage/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /menuTakeControl/ })).toBeNull();
  });
});

describe('ZoneCard controlled-by strip', () => {
  const strip = (controlled: boolean, names = ['Corsair iCUE']) => ({
    controlled,
    apps: names.map((name, i) => ({ id: `app-${i}`, name })),
  });
  function renderStrip(device: LightingDevice, appStrip?: ReturnType<typeof strip>, handlers: { onSelect?: () => void; onOpenAppStrip?: () => void } = {}) {
    return render(
      <ZoneCard
        device={device}
        selected={false}
        indent={false}
        onSelect={handlers.onSelect ?? (() => {})}
        onOpenSettings={() => {}}
        appStrip={appStrip}
        onOpenAppStrip={handlers.onOpenAppStrip ?? (() => {})}
      />,
    );
  }

  it('reads as gray "controlled by" when Nexus does not drive the card', () => {
    renderStrip({ ...baseDevice, controlled: false }, strip(false));
    const button = screen.getByRole('button', { name: /lighting\.devices\.controlledBy/ });
    expect(button.className).not.toContain(styles.deviceControlledByWarn);
    expect(button.textContent).toContain('Corsair iCUE');
    expect(document.querySelector(`.${styles.deviceCard}`)?.className).toContain(styles.deviceCardWithStrip);
  });

  it('reads as amber "running" when Nexus drives the card', () => {
    renderStrip(baseDevice, strip(true));
    const button = screen.getByRole('button', { name: /devices\.conflictRunning\.badge/ });
    expect(button.className).toContain(styles.deviceControlledByWarn);
  });

  it('renders no strip without a matching running app', () => {
    renderStrip(baseDevice, undefined);
    expect(screen.queryByRole('button', { name: /controlledBy|conflictRunning/ })).toBeNull();
    expect(document.querySelector(`.${styles.deviceCard}`)?.className).not.toContain(styles.deviceCardWithStrip);
  });

  it('lists several apps in the order given, comma-separated', () => {
    renderStrip({ ...baseDevice, controlled: false }, strip(false, ['Corsair iCUE', 'SignalRGB', 'OpenRGB']));
    expect(screen.getByRole('button', { name: /controlledBy/ }).textContent).toContain('Corsair iCUE, SignalRGB, and OpenRGB');
  });

  it('stays hidden in toggle, select-only, firmware-controlled and unavailable modes', () => {
    const device = { ...baseDevice, controlled: false };
    const props = { selected: false, indent: false, onSelect: () => {}, appStrip: strip(false), onOpenAppStrip: () => {} };
    const hidden = (extra: Record<string, unknown>, dev: LightingDevice = device) => {
      const view = render(<ZoneCard device={dev} {...props} {...extra} />);
      const found = screen.queryByRole('button', { name: /controlledBy/ });
      view.unmount();
      return found;
    };
    expect(hidden({ toggleMode: true, onToggleControlled: () => {} })).toBeNull();
    expect(hidden({ selectOnly: true })).toBeNull();
    expect(hidden({ firmwareControlled: true })).toBeNull();
    expect(hidden({}, { ...device, ledCount: 0 })).toBeNull();
    expect(hidden({})).not.toBeNull();
  });

  it('keeps Enter and Space off the card but lets Escape bubble', () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={e => onKeyDown(e.key)}>
        <ZoneCard device={{ ...baseDevice, controlled: false }} selected={false} indent={false} onSelect={() => {}} appStrip={strip(false)} onOpenAppStrip={() => {}} />
      </div>,
    );
    const button = screen.getByRole('button', { name: /controlledBy/ });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(onKeyDown).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledWith('Escape');
  });

  it('opens the conflict dialog on press without selecting the card', () => {
    const onSelect = vi.fn();
    const onOpenAppStrip = vi.fn();
    renderStrip({ ...baseDevice, controlled: false }, strip(false), { onSelect, onOpenAppStrip });
    fireEvent.click(screen.getByRole('button', { name: /controlledBy/ }));
    expect(onOpenAppStrip).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('ZoneCard unsized OpenRGB device', () => {
  const empty: LightingDevice = { ...baseDevice, ledCount: 0 };

  it('links to the Devices block instead of reporting a failed detection', () => {
    const onOpenZoneSizes = vi.fn();
    render(
      <ZoneCard
        device={empty} selected={false} indent={false} onSelect={() => {}} onTogglePower={() => {}}
        onToggleControlled={() => {}} onOpenSettings={() => {}} onOpenZoneSizes={onOpenZoneSizes}
      />,
    );
    expect(screen.queryByText('lighting.devices.detectionFailed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.setLedCounts' }));
    expect(onOpenZoneSizes).toHaveBeenCalledTimes(1);
  });

  it('keeps the detection-failed line when nothing can be sized', () => {
    renderCard(empty);
    expect(screen.getByText('lighting.devices.detectionFailed')).toBeTruthy();
  });

  it('says the counts come after setup where the Devices page is out of reach', () => {
    render(
      <ZoneCard
        device={empty} selected={false} indent={false} onSelect={() => {}} onTogglePower={() => {}}
        onToggleControlled={() => {}} onOpenSettings={() => {}} toggleMode needsLedCounts
      />,
    );
    expect(screen.getByText('lighting.devices.setLedCountsAfterSetup')).toBeTruthy();
    expect(screen.queryByText('lighting.devices.detectionFailed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.devices.setLedCounts' })).toBeNull();
  });
});
