import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoneCard } from './ZoneCard';
import type { LightingDevice } from '../../../../api/lighting';
import type { SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../LightingPage.module.scss';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

describe('ZoneCard controlled toggle', () => {
  it('shows the controlled button checked and does not dim the card when controlled', () => {
    renderCard(baseDevice);
    const controlledBtn = screen.getByRole('switch', { name: 'lighting.devices.controlled' });
    expect(controlledBtn.getAttribute('aria-checked')).toBe('true');
    expect(controlledBtn.className).not.toContain(styles.devicePowerBtnPersistent);
    const card = document.querySelector(`.${styles.deviceCard}`);
    expect(card?.className).not.toContain(styles.deviceCardPoweredOff);
  });

  it('shows the controlled button unchecked, persistent, and dims the card when not controlled', () => {
    renderCard({ ...baseDevice, controlled: false });
    const controlledBtn = screen.getByRole('switch', { name: 'lighting.devices.notControlled' });
    expect(controlledBtn.getAttribute('aria-checked')).toBe('false');
    expect(controlledBtn.className).toContain(styles.devicePowerBtnPersistent);
    const card = document.querySelector(`.${styles.deviceCard}`);
    expect(card?.className).toContain(styles.deviceCardPoweredOff);
  });

  it('treats an undefined controlled field as controlled (older service)', () => {
    renderCard(baseDevice);
    expect(screen.queryByRole('switch', { name: 'lighting.devices.notControlled' })).toBeNull();
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

  it('hides the per-card action buttons', () => {
    renderToggleCard(baseDevice);
    expect(screen.queryByRole('switch', { name: 'lighting.devices.controlled' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.devices.identify' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.settings' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'lighting.devices.powerOn' })).toBeNull();
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
