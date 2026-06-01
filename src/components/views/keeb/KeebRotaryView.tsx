import { useEffect, useState } from 'react';
import type { SetRotaryWheelsBody } from '../../../api/keeb';
import { getKeebRotaryFunctions } from '../../../api/keeb';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { Select } from '../../common/Select/Select';
import {
  ROTARY_SENSITIVITIES,
  getRotaryFunctionTooltip,
} from './keebCategories';
import styles from './KeebRotaryView.module.scss';

export interface KeebRotaryViewProps {
  wheel: 'left' | 'right';
  /** Current global wheel assignment (left + right). */
  left: string;
  right: string;
  sensitivity: string;
  onSetRotary: (body: SetRotaryWheelsBody) => Promise<void>;
  onSetSensitivity: (s: string) => Promise<void>;
}

const DEFAULT_FN = 'VolumeAdjustment';

/// Rotary Assignment tab body. Function tiles drive the active wheel
/// (selected via the wheel buttons on the keyboard render above), with a
/// sensitivity selector at the top.
///
/// TODO: Per-app overrides — once `AppDetection` exposes a running-app
/// list in nexus-service, swap the "All Applications" placeholder for a
/// real picker. Scope is global only.
export function KeebRotaryView({
  wheel,
  left,
  right,
  sensitivity,
  onSetRotary,
  onSetSensitivity,
}: KeebRotaryViewProps) {
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

  const handlePick = async (fn: string) => {
    const body: SetRotaryWheelsBody = wheel === 'left'
      ? { left: fn, right, apps: [] }
      : { left, right: fn, apps: [] };
    await onSetRotary(body);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Scope</span>
          <Select
            value="all"
            onChange={() => { /* no-op until AppDetection lands */ }}
            options={[{ value: 'all', label: 'All Applications' }]}
            ariaLabel="App scope"
            size="sm"
            disabled
          />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Sensitivity</span>
          <Select
            value={sensitivity || 'Balanced'}
            onChange={v => void onSetSensitivity(v)}
            options={ROTARY_SENSITIVITIES.map(s => ({ value: s, label: s }))}
            ariaLabel="Rotary sensitivity"
            size="sm"
          />
        </div>

        <div className={styles.wheelBadge}>
          Editing: <strong>{wheel === 'left' ? 'Left' : 'Right'} Wheel</strong>
        </div>
      </header>

      <div className={styles.tiles}>
        {functions.map(fn => (
          <IconLabelButton
            key={fn}
            label={fn.replace(/([A-Z])/g, ' $1').trim()}
            active={fallbackActive === fn}
            title={getRotaryFunctionTooltip(fn)}
            ariaLabel={fn}
            onPress={() => void handlePick(fn)}
          />
        ))}
      </div>
    </div>
  );
}
