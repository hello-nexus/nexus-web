import { useEffect, useState } from 'react';
import type { SetRotaryWheelsBody } from '../../../api/keeb';
import { getKeebRotaryFunctions } from '../../../api/keeb';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useTranslation } from '../../../lib/i18n';
import {
  getRotaryFunctionLabelKey,
  getRotaryFunctionTooltipKey,
} from './keebCategories';
import styles from './KeebRotaryView.module.scss';

export interface KeebRotaryViewProps {
  wheel: 'left' | 'right';
  /** Current global wheel assignment (left + right). */
  left: string;
  right: string;
  onSetRotary: (body: SetRotaryWheelsBody) => Promise<void>;
}

const DEFAULT_FN = 'VolumeAdjustment';

/// Rotary Assignment tab body. Function chips drive the active wheel (selected
/// via the wheel buttons on the keyboard render above); the chip carrying the
/// wheel's current function reads as active. The firmware executes the wheel
/// functions natively - volume, brightness, scroll - with no host round-trip.
export function KeebRotaryView({
  wheel,
  left,
  right,
  onSetRotary,
}: KeebRotaryViewProps) {
  const { t } = useTranslation();
  const [functions, setFunctions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getKeebRotaryFunctions().then(fns => {
      if (!cancelled) setFunctions(fns);
    });
    return () => { cancelled = true; };
  }, []);

  const active = wheel === 'left' ? left : right;
  const fallbackActive = active || DEFAULT_FN;

  // The function list comes from the service; firmware additions this build
  // doesn't know yet fall back from the locale key to a camelCase split.
  const functionLabel = (fnName: string): string => {
    const key = getRotaryFunctionLabelKey(fnName);
    const label = t(key);
    return label === key ? fnName.replace(/([A-Z])/g, ' $1').trim() : label;
  };
  const functionTooltip = (fnName: string): string | undefined => {
    const key = getRotaryFunctionTooltipKey(fnName);
    const tip = t(key);
    return tip === key ? undefined : tip;
  };

  const options: ChipOption[] = functions.map(fnName => ({
    key: fnName,
    label: functionLabel(fnName),
    tooltip: functionTooltip(fnName),
  }));

  const handlePick = async (fnName: string) => {
    const body: SetRotaryWheelsBody = wheel === 'left'
      ? { left: fnName, right }
      : { left, right: fnName };
    await onSetRotary(body);
  };

  const title = wheel === 'left' ? t('keeb.rotary.editingLeft') : t('keeb.rotary.editingRight');

  return (
    <div className={styles.container}>
      <SettingsSection title={title}>
        <div className={styles.chipSection}>
          <ChipGroup
            className={styles.chips}
            options={options}
            activeKey={fallbackActive}
            onChange={fnName => void handlePick(fnName)}
            ariaLabel={title}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
