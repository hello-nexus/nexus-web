import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoneCard, type BulkSelection } from './ZoneCard';
import type { LightingDevice } from '../../../../api/lighting';
import type { SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../LightingPage.module.scss';

// Params are appended so assertions can pin what actually reaches a label -
// a bare `key` mock would pass even if the interpolation object were dropped.
vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

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
    expect(document.querySelector(`.${styles.deviceStateChip}`)).toBeNull();
    const card = document.querySelector(`.${styles.deviceCard}`);
    expect(card?.className).not.toContain(styles.deviceCardPoweredOff);
  });

  it('names the ignored state persistently, in place of the LED count', () => {
    renderCard({ ...baseDevice, controlled: false });
    expect(screen.getByText('lighting.devices.stateNotControlled')).toBeTruthy();
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
    expect(rowIcon(/menuControlOn/)).toContain('lucide-link-2');
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

  it('hides the LED map row, which edits one device only', () => {
    renderBulkAndOpen(bulkProps());
    expect(screen.queryByRole('button', { name: /ledMap.settings/ })).toBeNull();
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

  it('hides the actions menu and the state chip', () => {
    renderToggleCard({ ...baseDevice, controlled: false });
    expect(screen.queryByRole('button', { name: 'lighting.devices.moreActions' })).toBeNull();
    expect(document.querySelector(`.${styles.deviceStateChip}`)).toBeNull();
    // The whole card is the switch here, so the ignored state reads from
    // aria-checked rather than a chip.
    expect(screen.getByRole('switch', { name: 'Test Strip' }).getAttribute('aria-checked')).toBe('false');
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
