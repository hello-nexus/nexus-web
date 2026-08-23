import { Ban, CheckCheck, Lightbulb } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { useTranslation } from '../../../../lib/i18n';
import type { LightingDevice } from '../../../../api/lighting';
import { ZoneCard, zoneCardUnavailable } from '../page/ZoneCard';
import { visibleCards } from '../page/zoneUtils';
import styles from './StaticDeviceSelect.module.scss';

/**
 * Static-mode device picker for the immersive editor. Static assigns a colour
 * per device, so a pick needs a target; this is the tab that supplies one.
 *
 * Cards are the lighting page's own ZoneCards in `selectOnly` mode, and the
 * selection Set is the page's, so a selection made here is the one the desktop
 * page shows and vice versa.
 */
/** A device the firmware drives itself overrides anything we assign it. */
function isFirmwareControlled(d: LightingDevice): boolean {
  return d.controlled === false;
}

export function StaticDeviceSelect({ devices, selectedIds, onSetSelection }: {
  devices: LightingDevice[];
  selectedIds: Set<string>;
  /** Receives the whole next selection, matching DevicePanel's onSetSelection. */
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
}) {
  const { t } = useTranslation();
  // The same listing the page shows: fully parked zone cards hide, and a
  // firmware-driven device cannot wear a pick, so it cannot be a target.
  const cards = visibleCards(devices);
  const targetable = (d: LightingDevice) => !zoneCardUnavailable(d) && !isFirmwareControlled(d);
  const selectableIds = cards.filter(targetable).map(d => d.id);

  if (cards.length === 0) {
    return <EmptyState icon={<Lightbulb />} title={t('lighting.devices.empty')} />;
  }

  // Touch has no multi-select modifier, so every tap here toggles additively -
  // on the card as well as its checkbox, which ZoneCard already does.
  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Primary follows the last remaining card in device order, matching
    // DevicePanel - Set-insertion order would pick a different one.
    const primary = next.has(id)
      ? id
      : (selectableIds.filter(x => next.has(x)).pop() ?? null);
    onSetSelection(next, primary);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.bulkRow}>
        <Button
          tone="ghost"
          size="sm"
          icon={<CheckCheck />}
          disabled={selectableIds.every(id => selectedIds.has(id))}
          onClick={() => onSetSelection(new Set(selectableIds), selectableIds[0] ?? null)}
        >
          {t('lighting.ledMap.selectAll')}
        </Button>
        <Button
          tone="ghost"
          size="sm"
          icon={<Ban />}
          disabled={selectedIds.size === 0}
          onClick={() => onSetSelection(new Set(), null)}
        >
          {t('lighting.ledMap.selectNone')}
        </Button>
      </div>
      <div className={styles.grid} role="group" aria-label={t('lighting.rightPane.devices')}>
        {cards.map(d => (
          <ZoneCard
            key={d.id}
            device={d}
            selectOnly
            ledFullscreen
            firmwareControlled={isFirmwareControlled(d)}
            selected={selectedIds.has(d.id)}
            indent={false}
            onSelect={() => toggle(d.id)}
          />
        ))}
      </div>
    </div>
  );
}
