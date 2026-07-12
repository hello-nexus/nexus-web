import { useEffect, useState } from 'react';
import type { SetRotaryWheelsBody } from '../../../api/keeb';
import { getKeebRotaryFunctions } from '../../../api/keeb';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
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

/// Rotary Assignment tab body. Function tiles drive the active wheel
/// (selected via the wheel buttons on the keyboard render above). The
/// firmware executes the wheel functions natively - volume, brightness,
/// scroll - with no host round-trip.
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

  const handlePick = async (fnName: string) => {
    const body: SetRotaryWheelsBody = wheel === 'left'
      ? { left: fnName, right }
      : { left, right: fnName };
    await onSetRotary(body);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.wheelBadge} aria-live="polite">
          {wheel === 'left' ? t('keeb.rotary.editingLeft') : t('keeb.rotary.editingRight')}
        </div>
      </header>

      <div className={styles.tiles}>
        {functions.map(fnName => (
          <IconLabelButton
            key={fnName}
            label={functionLabel(fnName)}
            active={fallbackActive === fnName}
            title={functionTooltip(fnName)}
            ariaLabel={functionLabel(fnName)}
            onPress={() => void handlePick(fnName)}
          />
        ))}
      </div>
    </div>
  );
}
