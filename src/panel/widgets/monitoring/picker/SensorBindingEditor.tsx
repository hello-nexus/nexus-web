import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { HardwareSensor } from '../../../../hooks/useSensors';
import type { SensorBinding } from '../../../../lib/sensorBinding';
import { defaultFixedMax } from '../perfDomain';
import type { DeviceKey } from '../perfSlots';
import { SensorPicker, useSensorLookup } from './SensorPicker';
import styles from './SensorPicker.module.scss';

/** The range a freshly picked sensor starts with: zero up to the monitoring pickers' fixed-range ceiling for it. */
export function defaultSensorRange(category: string, resolved: HardwareSensor | undefined, sensorId: string): { min: number; max: number } {
  return { min: 0, max: defaultFixedMax(category as DeviceKey, resolved, sensorId) };
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * A sensor pick plus the range of its reading that sweeps 0 to 1, in the
 * sensor's own units. Picking another sensor restarts the range from that
 * sensor's default; an invalid range (min not below max) is held back.
 */
export function SensorBindingEditor({ binding, onChange, onReset, showReset, ariaLabel }: {
  binding: SensorBinding;
  onChange: (binding: SensorBinding) => void;
  /** Present when the user has overridden the default. */
  onReset?: () => void;
  /** Where a default exists to return to: the reset then always shows, disabled without an override. */
  showReset?: boolean;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const lookup = useSensorLookup();
  const { resolve } = lookup;
  const unit = resolve(binding.category, binding.sensor)?.units ?? '';
  const [draft, setDraft] = useState({ min: String(binding.min), max: String(binding.max) });
  useEffect(() => {
    setDraft({ min: String(binding.min), max: String(binding.max) });
  }, [binding.min, binding.max]);
  const min = parseNumber(draft.min);
  const max = parseNumber(draft.max);
  const invalid = min === null || max === null || min >= max;

  const commit = () => {
    if (invalid || (min === binding.min && max === binding.max)) return;
    onChange({ ...binding, min, max });
  };
  const suffix = unit ? ` (${unit})` : '';
  const minLabel = `${t('monitoring.settings.rangeMin')}${suffix}`;
  const maxLabel = `${t('monitoring.settings.rangeMax')}${suffix}`;

  return (
    <div className={styles.editor} role="group" aria-label={ariaLabel}>
      <SensorPicker
        lookup={lookup}
        category={binding.category}
        sensor={binding.sensor}
        onChange={(selection, resolved) => {
          if (selection.category === binding.category && selection.sensor === binding.sensor) return;
          // A sensor this PC does not list keeps the range already set for it.
          const range = resolved ? defaultSensorRange(selection.category, resolved, selection.sensor) : { min: binding.min, max: binding.max };
          onChange({ ...selection, ...range });
        }}
      />
      <div className={styles.rangeRow}>
        <label className={styles.rangeField}>
          <span className={styles.rangeLabel}>{minLabel}</span>
          <TextInput
            type="number" size="sm" value={draft.min} ariaLabel={minLabel} invalid={invalid}
            onInput={v => setDraft(d => ({ ...d, min: v }))} onBlur={commit} onSubmit={commit}
          />
        </label>
        <label className={styles.rangeField}>
          <span className={styles.rangeLabel}>{maxLabel}</span>
          <TextInput
            type="number" size="sm" value={draft.max} ariaLabel={maxLabel} invalid={invalid}
            onInput={v => setDraft(d => ({ ...d, max: v }))} onBlur={commit} onSubmit={commit}
          />
        </label>
        {showReset && (
          <HoverTooltip body={t('lighting.sensor.reset')} side="top">
            {/* A disabled button takes no mouse events, so the tooltip listens on the wrapper. */}
            <span className={styles.resetSlot}>
              <Button size="sm" tone="ghost" icon={<RotateCcw size={14} />} aria-label={t('lighting.sensor.reset')} onClick={onReset} disabled={!onReset} />
            </span>
          </HoverTooltip>
        )}
      </div>
    </div>
  );
}
