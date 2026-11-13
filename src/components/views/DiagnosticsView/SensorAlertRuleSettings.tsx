import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { requestPairPhone } from '../../../app/pairPhoneRequest';
import { useAlertPhones } from './useAlertPhones';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { SensorAlertRule, SensorAlertState, SensorRef } from '../../../api/diagnosticsAlerts';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { RangeSlider } from '../../common/Slider/RangeSlider';
import { Select } from '../../common/Select/Select';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import {
  ALERT_SENSOR_CATEGORIES,
  ALERT_SENSOR_TYPES,
  baseBounds,
  builtInLimitBounds,
  defaultHigh,
  DEFAULT_CLEAR_SECONDS,
  delayChoices,
  delayLabel,
  displayBounds,
  formatAlertValue,
  formatDisplayValue,
  fromDisplay,
  isBuiltIn,
  snapDisplay,
  ruleLabel,
  sensorRefOf,
  stepFor,
  toDisplay,
  padBounds,
  widenBounds,
  type Bounds,
} from './sensorAlertHelpers';
import styles from './SensorAlertRuleSettings.module.scss';

const STACKED = 'stacked' as const;
const WARN = 'warn' as const;
const BAD = 'bad' as const;

interface SensorAlertRuleSettingsProps {
  rule: SensorAlertRule;
  lookup: ReturnType<typeof useSensorLookup>;
  /** Shows an edit without writing it (a slider mid-drag). */
  onPreview: (rule: SensorAlertRule) => void;
  /** Writes the full rule. */
  onSave: (rule: SensorAlertRule) => void;
  onDelete: () => void;
  /** Switches the entry on or off; for a fan built-in this is its per-fan health check. */
  onToggleEnabled: (enabled: boolean) => void;
  /** The rule's live state, the only reading source for a built-in. */
  state?: SensorAlertState;
  /** Writes a built-in back to its factory values. */
  onRestoreDefault?: () => void;
  /** The entry already tracking a sensor picked here, if any; the pick is then refused and `onTracked` runs. */
  findTracked?: (sensor: SensorRef) => SensorAlertRule | undefined;
  onTracked?: (existing: SensorAlertRule) => void;
}

/** The editable settings of one tracked sensor: the sensor, its alert limits, delay, urgency and delivery options. Shown inside the sensor's card. */
export function SensorAlertRuleSettings({ rule, lookup, onPreview, onSave, onDelete, onToggleEnabled, state, onRestoreDefault, findTracked, onTracked }: SensorAlertRuleSettingsProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers } = useUnitPrefs();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const phones = useAlertPhones();
  const type = rule.sensor.type;
  const builtIn = isBuiltIn(rule);
  const live = builtIn ? (state?.value ?? null) : (lookup.resolve(rule.sensor.category, rule.sensor.id)?.value ?? null);

  // Track extent in the stored unit. It only grows once chosen, so the knobs do not move under a
  // drag as the reading wanders.
  const [bounds, setBounds] = useState<Bounds>(() => builtInLimitBounds(rule) ?? baseBounds(type, live, rule.low, rule.high));
  const wanted = widenBounds(bounds, builtIn ? [rule.low, rule.high] : [rule.low, rule.high, live]);
  if (wanted.min !== bounds.min || wanted.max !== bounds.max) setBounds(wanted);
  const shown = displayBounds(bounds, type, tempUnit);

  // Both knobs always show; a knob parked on its end of the track means no limit on that side.
  const lowOn = rule.low !== null;
  const highOn = rule.high !== null;
  const step = stepFor(type);
  const lowShownValue = rule.low !== null ? snapDisplay(toDisplay(rule.low, type, tempUnit), type) : null;
  const highShownValue = rule.high !== null ? snapDisplay(toDisplay(rule.high, type, tempUnit), type) : null;
  const track = padBounds(shown, step);
  const fmt = (v: number) => formatDisplayValue(v, type, tempUnit, numberFormat, monitoringWholeNumbers);

  const edit = (patch: Partial<SensorAlertRule>, write: boolean) => {
    // Every enabled rule shows in Health and notifies once per episode; neither is a user choice.
    const next = { ...rule, ...patch, showInHealth: true, repeatMinutes: 0, clearAfterSeconds: DEFAULT_CLEAR_SECONDS };
    if (write) onSave(next);
    else onPreview(next);
  };

  const setRange = ([lo, hi]: [number, number], write: boolean) => {
    edit({
      low: lo <= track.min ? null : fromDisplay(lo, type, tempUnit),
      high: hi >= track.max ? null : fromDisplay(hi, type, tempUnit),
    }, write);
  };

  const outsideTone = rule.severity === 'act' ? BAD : WARN;
  return (
    <>
      <SettingToggle
        label={t('diagnostics.alerts.enabledFor', { name: ruleLabel(rule) })}
        checked={rule.enabled}
        onChange={onToggleEnabled}
      />
      {!builtIn && (
        <SettingRow label={t('monitoring.settings.sensor')} wrapControl>
          <SensorPicker
            lookup={lookup}
            category={rule.sensor.category}
            sensor={rule.sensor.id}
            categories={ALERT_SENSOR_CATEGORIES}
            sensorTypes={ALERT_SENSOR_TYPES}
            isUnavailable={(category, o) => !!findTracked?.({ category, id: o.value, type: o.type ?? '', name: '', parentName: '' })}
            unavailableSuffix={t('diagnostics.sensors.inWatchlist')}
            onChange={(sel, resolved) => {
              if (!resolved) return;
              const ref = sensorRefOf(sel.category, resolved);
              const existing = findTracked?.(ref);
              if (existing) { onTracked?.(existing); return; }
              const typeChanged = ref.type !== type;
              const next: SensorAlertRule = typeChanged
                ? { ...rule, sensor: ref, low: null, high: defaultHigh(ref.type, resolved.value) }
                : { ...rule, sensor: ref };
              if (typeChanged) setBounds(baseBounds(ref.type, resolved.value, next.low, next.high));
              onSave(next);
            }}
          />
        </SettingRow>
      )}
      <div className={styles.sliderBlock}>
        <RangeSlider
          orientation={STACKED}
          editable
          openEnded
          label={t('diagnostics.alerts.validRange')}
          value={[
            lowShownValue ?? track.min,
            highShownValue ?? track.max,
          ]}
          min={track.min}
          max={track.max}
          step={step}
          lowEnabled={lowOn}
          highEnabled={highOn}
          lowOffLabel={t('diagnostics.alerts.noLowerLimit')}
          highOffLabel={t('diagnostics.alerts.noUpperLimit')}
          outsideTone={outsideTone}
          marker={live !== null ? { value: toDisplay(live, type, tempUnit), label: formatAlertValue(live, type, tempUnit, numberFormat, monitoringWholeNumbers) } : undefined}
          formatValue={fmt}
          ariaLabelMin={t('diagnostics.alerts.lowKnob')}
          ariaLabelMax={t('diagnostics.alerts.highKnob')}
          onChange={(v, commit) => setRange(v, Boolean(commit))}
          onCommit={v => setRange(v, true)}
        />
      </div>
      <SettingRow label={t('diagnostics.alerts.raiseAfter')} description={t('diagnostics.alerts.raiseAfterDescription')}>
        <Select
          value={String(rule.raiseAfterSeconds)}
          ariaLabel={t('diagnostics.alerts.raiseAfter')}
          options={delayChoices(rule.raiseAfterSeconds).map(sec => ({ value: String(sec), label: delayLabel(t, language, sec) }))}
          onChange={v => edit({ raiseAfterSeconds: Number(v) }, true)}
        />
      </SettingRow>
      <SettingToggle
        label={t('diagnostics.alerts.urgent')}
        description={t('diagnostics.alerts.urgentDescription')}
        checked={rule.severity === 'act'}
        onChange={urgent => edit({ severity: urgent ? 'act' : 'watch' }, true)}
      />
      <SettingToggle
        label={t('diagnostics.alerts.notifyDesktop')}
        checked={rule.notifyDesktop}
        onChange={notifyDesktop => edit({ notifyDesktop }, true)}
      />
      <SettingToggle
        label={t('diagnostics.alerts.notifyMobile')}
        description={phones === null ? undefined : phones > 0 ? t(pluralKey('diagnostics.alerts.phonesAlertsOn', language, phones), { count: phones }) : (
          <>
            {t('diagnostics.alerts.noPhonesAlertsOn')}
            {' '}
            <Button type="button" tone="ghost" size="sm" data-testid="pair-remote-link" onClick={requestPairPhone}>
              {t('phonePair.title')}
            </Button>
          </>
        )}
        checked={rule.notifyMobile}
        onChange={notifyMobile => edit({ notifyMobile }, true)}
      />
      <SettingRow>
        {builtIn ? (
          <Button type="button" tone="neutral" size="sm" data-testid="sensor-restore" icon={<RotateCcw size={13} aria-hidden />} onClick={onRestoreDefault}>
            {t('diagnostics.sensors.restoreDefault')}
          </Button>
        ) : (
          <Button type="button" tone="neutral" size="sm" data-testid="sensor-delete" icon={<Trash2 size={13} aria-hidden />} onClick={() => setConfirmOpen(true)}>
            {t('common.delete')}
          </Button>
        )}
      </SettingRow>
      <ConfirmModal
        open={confirmOpen}
        title={t('common.delete')}
        message={t('diagnostics.alerts.deleteConfirm', { name: ruleLabel(rule) })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => { setConfirmOpen(false); onDelete(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
