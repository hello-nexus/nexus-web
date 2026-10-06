import { useState } from 'react';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { sizeToSpan } from '../../../panel/engine/grid';
import {
  DASHBOARD_PRESET_IDS,
  dashboardPresetLayout,
  dashboardPresetWidgets,
  type DashboardPresetId,
} from '../../../panel/engine/dashboardPresets';
import { lookupApp } from '../../../panel/widgets/registry';
import type { PanelLayout } from '../../../panel/types';
import { useTranslation } from '../../../lib/i18n';
import styles from './DashboardPresetsModal.module.scss';

const MAP_MIN_CELLS = 8;

interface DashboardPresetsModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (layout: PanelLayout) => void;
}

export function DashboardPresetsModal({ open, onClose, onApply }: DashboardPresetsModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<DashboardPresetId | null>(null);

  const close = () => {
    setSelected(null);
    onClose();
  };

  const apply = () => {
    if (!selected) return;
    onApply(dashboardPresetLayout(selected));
    close();
  };

  return (
    <ConfirmModal
      open={open}
      title={t('dashboard.presets.title')}
      message={t('dashboard.presets.message')}
      confirmLabel={t('dashboard.presets.apply')}
      destructive={false}
      // Empty when the install-defaults preload failed; applying it would wipe the dashboard.
      confirmDisabled={!selected || dashboardPresetWidgets(selected).length === 0}
      onConfirm={apply}
      onCancel={close}
    >
      <div className={styles.grid}>
        {DASHBOARD_PRESET_IDS.map(id => (
          <EffectCard
            key={id}
            label={t(`dashboard.presets.${id}.name`)}
            meta={t(`dashboard.presets.${id}.description`)}
            thumbUrl={null}
            thumbStatic
            thumbAspect={1}
            thumbOverlay={<PresetMap id={id} />}
            active={selected === id}
            onClick={() => setSelected(id)}
          />
        ))}
      </div>
    </ConfirmModal>
  );
}

function PresetMap({ id }: { id: DashboardPresetId }) {
  const widgets = dashboardPresetWidgets(id);
  const extent = widgets.reduce((max, w) => {
    const span = sizeToSpan(w.size);
    return Math.max(max, w.col + span.cols, w.row + span.rows);
  }, MAP_MIN_CELLS);
  return (
    <div
      className={styles.map}
      style={{ gridTemplateColumns: `repeat(${extent}, 1fr)`, gridTemplateRows: `repeat(${extent}, 1fr)` }}
      aria-hidden="true"
    >
      {widgets.map((w, i) => {
        const span = sizeToSpan(w.size);
        const Icon = lookupApp(w.type)?.meta.icon;
        return (
          <span
            key={i}
            className={styles.tile}
            style={{ gridColumn: `${w.col + 1} / span ${span.cols}`, gridRow: `${w.row + 1} / span ${span.rows}` }}
          >
            {Icon && <Icon size={14} aria-hidden />}
          </span>
        );
      })}
    </div>
  );
}
