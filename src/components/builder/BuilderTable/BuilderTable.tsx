import type { Build, ComponentCategory, ComponentOption } from '../../../types/builder';
import { BUILDER_CATEGORIES } from '../../../types/builder';
import { useTranslation } from '../../../lib/i18n';
import { BuilderRow } from './BuilderRow';
import styles from './BuilderTable.module.scss';

interface BuilderTableProps {
  build: Build;
  onChoose: (category: ComponentCategory) => void;
  onRemove: (category: ComponentCategory, index: number) => void;
  onToggleOwned: (category: ComponentCategory) => void;
  /** Navigate to the in-app product detail page for the picked component. */
  onViewDetail: (component: ComponentOption) => void;
}

export function BuilderTable({ build, onChoose, onRemove, onToggleOwned, onViewDetail }: BuilderTableProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        <div className={styles.cellComponent}>{t('builder.col.component')}</div>
        <div className={styles.cellName}>{t('builder.col.name')}</div>
        <div className={styles.cellSpecs}>{t('builder.col.specs')}</div>
        <div className={styles.cellPrice}>{t('builder.col.price')}</div>
        <div className={styles.cellActions} aria-hidden />
      </div>
      {BUILDER_CATEGORIES.map(cat => {
        const entries = build.slots[cat] ?? [{ selection: null, selectedRetailer: null }];
        const entry = entries[0];
        const isOwned = build.ownedSlots.includes(cat);
        return (
          <BuilderRow
            key={cat}
            category={cat}
            entry={entry}
            onChoose={() => onChoose(cat)}
            onRemove={() => onRemove(cat, 0)}
            isOwned={isOwned}
            onToggleOwned={() => onToggleOwned(cat)}
            onViewDetail={onViewDetail}
          />
        );
      })}
    </div>
  );
}
