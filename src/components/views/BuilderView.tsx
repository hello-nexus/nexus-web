import { useCallback } from 'react';
import type { BuilderAction, ComponentCategory, ComponentOption, Build, CompatibilityIssue, WattageEstimate } from '../../types/builder';
import { useTranslation } from '../../lib/i18n';
import { BuilderTable } from '../builder/BuilderTable/BuilderTable';
import { ComponentPicker } from '../builder/ComponentPicker/ComponentPicker';
import { CompatibilityPanel } from '../builder/CompatibilityPanel/CompatibilityPanel';
import { WattageEstimator } from '../builder/WattageEstimator/WattageEstimator';
import { BuildShare } from '../builder/BuildShare/BuildShare';
import styles from './BuilderView.module.scss';

interface BuilderViewProps {
  category: ComponentCategory | null;
  build: Build;
  dispatch: React.Dispatch<BuilderAction>;
  issues: CompatibilityIssue[];
  wattage: WattageEstimate;
  totalPrice: number;
  onCategoryChange: (cat: ComponentCategory | null) => void;
  onViewDetail: (component: ComponentOption) => void;
}

export default function BuilderView({
  category,
  build,
  dispatch,
  issues,
  wattage,
  totalPrice,
  onCategoryChange,
  onViewDetail,
}: BuilderViewProps) {
  const { t } = useTranslation();

  const handleChoose = useCallback((cat: ComponentCategory) => {
    onCategoryChange(cat);
  }, [onCategoryChange]);

  const handleRemove = useCallback((cat: ComponentCategory, index: number) => {
    dispatch({ type: 'REMOVE_COMPONENT', category: cat, index });
  }, [dispatch]);

  const handleToggleOwned = useCallback((cat: ComponentCategory) => {
    dispatch({ type: 'TOGGLE_OWNED', category: cat });
  }, [dispatch]);

  const handleSelect = useCallback((component: ComponentOption, retailer?: string) => {
    if (category) {
      dispatch({ type: 'SELECT_COMPONENT', category, index: 0, component, retailer });
      onCategoryChange(null);
    }
  }, [category, dispatch, onCategoryChange]);

  const handleClosePicker = useCallback(() => {
    onCategoryChange(null);
  }, [onCategoryChange]);

  const psuWattage = build.slots.psu?.[0]?.selection?.specs.wattage ?? null;

  if (category) {
    return (
      <section className={styles.builder}>
        <div className="pageBody">
          <div className={styles.pickerSection}>
            <ComponentPicker
              category={category}
              onSelect={handleSelect}
              onClose={handleClosePicker}
              onViewDetail={onViewDetail}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.builder}>
      <div className="pageBody">
      <div className={styles.summaryBar}>
        <div className={styles.totalPrice}>
          <span className={styles.totalLabel}>{t('builder.total')}</span>
          <span className={styles.totalValue}>${totalPrice.toFixed(2)}</span>
        </div>
        <WattageEstimator wattage={wattage} psuWattage={psuWattage} />
        <div className={styles.summarySpacer} />
        <BuildShare build={build} />
      </div>

      {issues.length > 0 && (
        <div className={styles.compatSection}>
          <CompatibilityPanel issues={issues} />
        </div>
      )}

      <div className={styles.tableSection}>
        <BuilderTable
          build={build}
          onChoose={handleChoose}
          onRemove={handleRemove}
          onToggleOwned={handleToggleOwned}
          onViewDetail={onViewDetail}
        />
      </div>
      </div>
    </section>
  );
}
