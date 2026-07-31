import { Fragment, useEffect, useState } from 'react';
import {
  DndContext, type DragEndEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable,
  sortableKeyboardCoordinates, arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchDisplays, type Display } from '../../../api/displays';
import { SettingsSection, SettingsHint } from '../common/SettingsRow/SettingsRow';
import type { WidgetSettingsProps } from '../types';
import styles from './DisplaysSettings.module.scss';

function SortableDisplayRow({ display, position, showBadge }: {
  display: Display;
  position: number;
  showBadge: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: display.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  // Matches the #N badge on the widget sliders so the row-to-slider mapping
  // is visible; the badge also disambiguates duplicate monitor models.
  const badge = `#${position}`;
  return (
    <div ref={setNodeRef} style={style} className={styles.row} role="listitem">
      <span
        className={styles.handle}
        aria-label={t('displays.settings.reorder', { name: showBadge ? `${display.name} ${badge}` : display.name })}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </span>
      {showBadge && <span className={styles.index} aria-hidden="true">{badge}</span>}
      <span className={styles.name}>{display.name}</span>
    </div>
  );
}

export function DisplaysSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const [displays, setDisplays] = useState<Display[] | null>(null);
  const [hint, setHint] = useState('');
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchDisplays().then(result => {
      if (cancelled || !result) return;
      setDisplays(result.displays);
      setHint(result.hint ?? '');
      const saved = (widget.config?.displayOrder as string[] | undefined) ?? [];
      const presentIds = result.displays.map(d => d.id);
      const kept = saved.filter(id => presentIds.includes(id));
      for (const id of presentIds) {
        if (!kept.includes(id)) kept.push(id);
      }
      setOrderedIds(kept);
    });
    return () => { cancelled = true; };
  // Order seeds from config once at mount; subsequent drags update orderedIds
  // directly via setOrderedIds, not by re-reading config.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    setOrderedIds(prev => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      const next = arrayMove(prev, from, to);
      onUpdate({ displayOrder: next });
      return next;
    });
  };

  const displayMap = displays
    ? new Map(displays.map(d => [d.id, d]))
    : new Map<string, Display>();

  const orderedDisplays = orderedIds
    .map(id => displayMap.get(id))
    .filter((d): d is Display => d !== undefined);

  return (
    <div className={styles.settings}>
      <SettingsSection title={t('displays.settings.title')}>
        {displays === null ? (
          <span className={styles.name}>{hint || t('displays.empty')}</span>
        ) : displays.length === 0 ? (
          <span className={styles.name}>{hint || t('displays.empty')}</span>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className={styles.list} role="list">
                {orderedDisplays.map((d, i) => (
                  <Fragment key={d.id}>
                    <SortableDisplayRow display={d} position={i + 1} showBadge={orderedDisplays.length > 1} />
                    {i === 1 && orderedIds.length > 2 && (
                      <div className={styles.divider} aria-hidden="true">
                        <span className={styles.dividerLabel}>2×2</span>
                      </div>
                    )}
                    {i === 3 && orderedIds.length > 4 && (
                      <div className={styles.divider} aria-hidden="true">
                        <span className={styles.dividerLabel}>4×2</span>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </SettingsSection>
      <SettingsHint>{t('displays.settings.hint')}</SettingsHint>
    </div>
  );
}

export default DisplaysSettings;
