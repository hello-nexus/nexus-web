import { X } from 'lucide-react';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import styles from './AppChipRow.module.scss';

interface AppChipRowProps {
  apps: ReadonlyArray<{ id: string; name: string }>;
  ariaLabel: string;
  /** Accessible name of one chip's remove action. */
  removeLabel: (name: string) => string;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

/** Selected apps as chips. Every chip reads active; clicking one removes it.
 *  App names are community-ish data, so they render as text nodes only. */
export function AppChipRow({ apps, ariaLabel, removeLabel, onRemove, disabled }: AppChipRowProps) {
  return (
    <ChipGroup
      wrap
      multiSelect
      ariaLabel={ariaLabel}
      activeKeys={new Set(apps.map(a => a.id))}
      options={apps.map(app => ({
        key: app.id,
        ariaLabel: removeLabel(app.name),
        disabled,
        label: (
          <span className={styles.chipLabel}>
            {app.name}
            <X size={12} aria-hidden />
          </span>
        ),
      }))}
      onToggleKey={onRemove}
    />
  );
}
