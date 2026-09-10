import { Ban, CheckCheck, Lightbulb } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { useTranslation } from '../../../../lib/i18n';
import type { LightingDevice } from '../../../../api/lighting';
import { ZoneCard, ZoneCardStack, zoneCardSelectable, type StackPosition } from '../page/ZoneCard';
import { MotherboardGroup } from '../page/MotherboardGroup';
import { buildDeviceBlocks, stripParentPrefix, type ZoneBlock } from '../page/deviceBlocks';
import { visibleCards } from '../page/zoneUtils';
import type { LedPick } from '../page/DeviceLedStrip';
import styles from './StaticDeviceSelect.module.scss';

/**
 * Static-mode device picker for the immersive editor. Static assigns a colour
 * per device, so a pick needs a target; this is the tab that supplies one.
 *
 * Cards are the lighting page's own ZoneCards in `selectOnly` mode, grouped by
 * the page's own blocks and MotherboardGroup headers, and the selection Set is
 * the page's - so a selection made here is the one the desktop page shows and
 * vice versa. Group headers collapse only; power and Nexus Control belong to
 * the page, not to a picker.
 */
export function StaticDeviceSelect({ devices, selectedIds, onSetSelection, ledPickFor }: {
  devices: LightingDevice[];
  selectedIds: Set<string>;
  /** Receives the whole next selection, matching DevicePanel's onSetSelection. */
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  /** This device's own assignment, so each card reads what IT wears. */
  ledPickFor?: (id: string) => LedPick | undefined;
}) {
  const { t } = useTranslation();
  // Its own collapse state: this picker is a different shape from the rail, so
  // a group folded here should not fold there.
  const [collapsed, setCollapsed] = usePersistentState<string[]>('lighting.immersiveCollapsedDeviceGroups', []);
  const toggleCollapsed = (key: string) =>
    setCollapsed(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // The same listing the page shows: fully parked zone cards hide.
  const cards = visibleCards(devices);
  const selectableIds = cards.filter(zoneCardSelectable).map(d => d.id);
  const blocks = buildDeviceBlocks(cards);

  if (cards.length === 0) {
    return <EmptyState icon={<Lightbulb />} title={t('lighting.devices.empty')} />;
  }

  // Touch has no multi-select modifier, so every tap toggles additively - on
  // the card as well as its checkbox, which ZoneCard already does.
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

  const card = (d: LightingDevice, indent: boolean, displayName?: string, stacked?: StackPosition) => (
    <ZoneCard
      key={d.id}
      device={d}
      displayName={displayName}
      stacked={stacked}
      selectOnly
      ledFullscreen
      ledPickOnly
      ledPick={ledPickFor?.(d.id)}
      selected={selectedIds.has(d.id)}
      indent={indent}
      onSelect={() => toggle(d.id)}
    />
  );

  // A tap on a stack header toggles its pickable zones as one, the way a tap
  // on a card toggles that card.
  const toggleAll = (ids: string[]) => {
    const next = new Set(selectedIds);
    const allIn = ids.every(id => next.has(id));
    ids.forEach(id => allIn ? next.delete(id) : next.add(id));
    onSetSelection(next, allIn ? (selectableIds.filter(x => next.has(x)).pop() ?? null) : ids[0]);
  };

  const stack = (block: Extract<ZoneBlock, { kind: 'split' }>, indent: boolean) => {
    const pickable = block.devices.filter(zoneCardSelectable).map(d => d.id);
    return (
      <ZoneCardStack
        key={block.groupKey}
        name={block.label}
        onSelect={pickable.length > 0 ? () => toggleAll(pickable) : undefined}
      >
        {block.devices.map((d, i) => card(d, indent, stripParentPrefix(d.name, block.stripLabel), i === block.devices.length - 1 ? 'last' : 'inner'))}
      </ZoneCardStack>
    );
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
        {blocks.map(block => block.kind === 'single'
          ? card(block.device, false)
          : block.kind === 'split'
          ? stack(block, false)
          : (
            <MotherboardGroup
              key={block.groupKey}
              parentName={block.label}
              ariaLabel={block.isBrand ? block.label : undefined}
              collapsed={collapsed.includes(block.groupKey)}
              onToggleCollapsed={() => toggleCollapsed(block.groupKey)}
              groupOn={block.devices.some(d => d.ledsOn)}
              onTogglePower={() => {}}
              groupControlled={block.devices.some(d => d.controlled !== false)}
              onToggleControlled={() => {}}
              hideActions
            >
              {block.blocks.map(row => row.kind === 'split'
                ? stack(row, true)
                : card(row.device, true, block.isBrand ? undefined : stripParentPrefix(row.device.name, block.stripLabel)))}
            </MotherboardGroup>
          ))}
      </div>
    </div>
  );
}
