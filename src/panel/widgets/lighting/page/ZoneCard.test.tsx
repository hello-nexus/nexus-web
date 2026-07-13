import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoneCard } from './ZoneCard';
import type { LightingDevice } from '../../../../api/lighting';
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
