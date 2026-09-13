import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoneCard, zoneCardSelectable, type BulkSelection } from './ZoneCard';
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
    expect(rowIcon(/menuControlOn/)?.split(' ')).toContain('lucide-link');
    expect(rowIcon(/menuLightsOff/)).toContain('lucide-power-off');
  });

  it('flips both labels and icons when the state flips', () => {
    renderCard({ ...baseDevice, controlled: true, ledsOn: false });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    expect(rowIcon(/menuControlOff/)).toContain('lucide-unlink');
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
      oneDevice: false,
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

  it('hides the LED map row when the selection spans devices', () => {
    renderBulkAndOpen(bulkProps());
    expect(screen.queryByRole('button', { name: /ledMap.settings/ })).toBeNull();
  });

  it('keeps the LED map row when the selection is one device\'s own zones', () => {
    // Selecting a keeb's keys and underglow still names one device, and the
    // editor opens on that device and lists both.
    renderBulkAndOpen(bulkProps({ oneDevice: true }));
    expect(screen.getByRole('button', { name: /ledMap.settings/ })).toBeTruthy();
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

  it('offers no button at all when the selection leaves this card with no rows', () => {
    // Detection-failed card: no identify, no state rows, and the LED map is
    // single-device - the menu would otherwise open empty.
    renderBulk(bulkProps({ identifyCount: 0 }), { ...baseDevice, ledCount: 0 });
    expect(screen.queryByRole('button', { name: 'lighting.devices.moreActions' })).toBeNull();
    const card = document.querySelector(`.${styles.deviceCard}`)!;
    expect(fireEvent.contextMenu(card)).toBe(true); // no handler, so not prevented
    expect(document.querySelector('[class*="_menu_"]')).toBeNull();
  });

  it.each(['pl', 'ru'])('asks %s for the CLDR few form at 3', (language) => {
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

  it('leads the menu, names the device, and fires the narrow', () => {
    const onSelectOnly = vi.fn();
    renderWithSelectOnly(onSelectOnly);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    const rows = screen.getAllByRole('button').filter(b => /lighting\.devices\./.test(b.textContent ?? ''));
    expect(rows[0].textContent).toContain('lighting.devices.selectOnly');
    // The label interpolates the card's own name, so the row is unambiguous.
    expect(rows[0].textContent).toContain('Test Strip');
    fireEvent.click(rows[0]);
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
  it('splits naming and grouping off from the actions below', () => {
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
        onRename={() => {}}
        groupMove={{ targets: [{ id: 'g1', name: 'Desk' }], onMove: () => {} }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
    const menu = document.querySelector('[class*="_menu_"]')!;
    const rows = Array.from(menu.children).map(c => c.tagName === 'BUTTON' ? c.textContent?.trim() : '|');
    // The select row interpolates the card name, so match its head only.
    expect(rows[0]).toMatch(/^lighting\.devices\.selectOnly/);
    expect(rows[1]).toBe('|');
    // Naming and grouping close the menu, behind a rule of their own. This
    // device carries no hardware name to reset, so there are two rows.
    expect(rows.slice(-3)).toEqual(['|', 'lighting.devices.rename', 'lighting.devices.moveToGroup']);
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

describe('ZoneCard color lock', () => {
  const badge = () => screen.queryByRole('button', { name: 'lighting.devices.unlockLook' }) as HTMLButtonElement | null;
  const menuRow = (re: RegExp) => screen.queryAllByRole('button').find(b => re.test(b.textContent ?? '')) ?? null;
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'lighting.devices.moreActions' }));
  const renderLock = (lock: { locked: boolean; lockable: boolean; hasPick: boolean; setLocked?: (locked: boolean) => void }, extra: Partial<Parameters<typeof ZoneCard>[0]> = {}) => render(
    <ZoneCard
      device={baseDevice} selected={false} indent={false} onSelect={() => {}}
      onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
      lock={{ setLocked: () => {}, ...lock }}
      {...extra}
    />,
  );

  it('renders no badge and no rows without a lock prop', () => {
    renderCard(baseDevice);
    expect(badge()).toBeNull();
    openMenu();
    expect(menuRow(/lighting\.devices\.(un)?lockLook/)).toBeNull();
  });

  it('shows no badge on an unlocked card, even on the Static tab', () => {
    renderLock({ locked: false, lockable: true, hasPick: true });
    expect(badge()).toBeNull();
  });

  it('badges a locked card between the strip and the menu, in any mode, and the badge unlocks', () => {
    const setLocked = vi.fn();
    renderLock({ locked: true, lockable: false, hasPick: true, setLocked });
    const btn = badge()!;
    const row = document.querySelector(`.${styles.deviceMetaRow}`)!;
    const order = [...row.children].map(el =>
      el.classList.contains(styles.ledStrip) ? 'strip'
        : el.querySelector(`.${styles.deviceLockBtn}`) || el.classList.contains(styles.deviceLockBtn) ? 'lock'
          : el.classList.contains(styles.deviceCardActions) ? 'menu' : null,
    ).filter(Boolean);
    expect(order).toEqual(['strip', 'lock', 'menu']);
    fireEvent.click(btn);
    expect(setLocked).toHaveBeenCalledWith(false);
  });

  it('does not select the card when the badge is pressed', () => {
    const onSelect = vi.fn();
    renderLock({ locked: true, lockable: false, hasPick: true }, { onSelect });
    fireEvent.click(badge()!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers Lock in the menu on the Static tab when the card has a pick', () => {
    const setLocked = vi.fn();
    renderLock({ locked: false, lockable: true, hasPick: true, setLocked });
    openMenu();
    const row = menuRow(/^lighting\.devices\.lockLook$/)!;
    expect(row).not.toBeNull();
    expect(menuRow(/unlockLook/)).toBeNull();
    fireEvent.click(row);
    expect(setLocked).toHaveBeenCalledWith(true);
  });

  it('offers no Lock row without a pick, or outside the Static tab', () => {
    renderLock({ locked: false, lockable: true, hasPick: false });
    openMenu();
    expect(menuRow(/lockLook/)).toBeNull();
    cleanup();
    renderLock({ locked: false, lockable: false, hasPick: true });
    openMenu();
    expect(menuRow(/lockLook/)).toBeNull();
  });

  it('offers Unlock in the menu on a locked card in any mode', () => {
    const setLocked = vi.fn();
    renderLock({ locked: true, lockable: false, hasPick: true, setLocked });
    openMenu();
    const row = menuRow(/^lighting\.devices\.unlockLook$/)!;
    expect(row).not.toBeNull();
    expect(menuRow(/^lighting\.devices\.lockLook$/)).toBeNull();
    fireEvent.click(row);
    expect(setLocked).toHaveBeenCalledWith(false);
  });

  it('flashes the badge for one run per seq bump, then rests', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderLock({ locked: true, lockable: true, hasPick: true });
      expect(badge()!.className).not.toContain(styles.deviceLockBtnFlash);
      const withSeq = (seq: number) => (
        <ZoneCard
          device={baseDevice} selected={false} indent={false} onSelect={() => {}}
          onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
          lock={{ locked: true, lockable: true, hasPick: true, setLocked: () => {}, flashSeq: seq }}
        />
      );
      act(() => { rerender(withSeq(1)); });
      expect(badge()!.className).toContain(styles.deviceLockBtnFlash);
      act(() => { vi.advanceTimersByTime(900); });
      expect(badge()!.className).not.toContain(styles.deviceLockBtnFlash);
      // A second pick flashes again; a re-render with the same seq does not.
      act(() => { rerender(withSeq(2)); });
      expect(badge()!.className).toContain(styles.deviceLockBtnFlash);
      act(() => { vi.advanceTimersByTime(900); });
      act(() => { rerender(withSeq(2)); });
      expect(badge()!.className).not.toContain(styles.deviceLockBtnFlash);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts the members each row reaches in a selection', () => {
    const setLocked = vi.fn();
    render(
      <ZoneCard
        device={baseDevice} selected indent={false} onSelect={() => {}}
        onTogglePower={() => {}} onToggleControlled={() => {}} onOpenSettings={() => {}}
        lock={{ locked: false, lockable: true, hasPick: true, setLocked: () => {} }}
        bulk={{
          count: 3, identifyCount: 3, tunableCount: 3, controlled: true, ledsOn: true, oneDevice: false,
          setControlled: () => {}, setPower: () => {}, identify: () => {},
          lockCount: 2, unlockCount: 1, setLocked,
        }}
      />,
    );
    openMenu();
    const lockRow = menuRow(/lockLookCount\.other:\{"count":2\}/)!;
    const unlockRow = menuRow(/unlockLookCount\.one:\{"count":1\}/)!;
    expect(lockRow).not.toBeNull();
    expect(unlockRow).not.toBeNull();
    fireEvent.click(lockRow);
    expect(setLocked).toHaveBeenCalledWith(true);
    fireEvent.click(unlockRow);
    expect(setLocked).toHaveBeenCalledWith(false);
  });
});
