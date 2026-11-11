import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { SensorAlertRule, SensorAlertSeverity, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { RangeSlider } from '../../common/Slider/RangeSlider';
import { Select } from '../../common/Select/Select';
import { Toggle } from '../../common/Toggle/Toggle';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import {
  ALERT_SENSOR_CATEGORIES,
  ALERT_SENSOR_TYPES,
  REPEAT_OPTIONS_MINUTES,
  baseBounds,
  chipState,
  defaultHigh,
  delayChoices,
  delayLabel,
  displayBounds,
  formatAlertValue,
  fromDisplay,
  seedBound,
  snapDisplay,
  sensorAlertAnchor,
  sensorLabel,
  sensorRefOf,
  stateColor,
  stepFor,
  toDisplay,
  widenBounds,
  type Bounds,
} from './sensorAlertHelpers';
import styles from './SensorAlertsSection.module.scss';

const STACKED = 'stacked' as const;
const WARN = 'warn' as const;
const BAD = 'bad' as const;

interface SensorAlertRuleCardProps {
  rule: SensorAlertRule;
  state: SensorAlertState | undefined;
  lookup: ReturnType<typeof useSensorLookup>;
  open: boolean;
  onToggleOpen: () => void;
  /** Shows an edit without writing it (a slider mid-drag). */
  onPreview: (rule: SensorAlertRule) => void;
  /** Writes the full rule. */
  onSave: (rule: SensorAlertRule) => void;
  onDelete: () => void;
}

export function SensorAlertRuleCard({ rule, state, lookup, open, onToggleOpen, onPreview, onSave, onDelete }: SensorAlertRuleCardProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers } = useUnitPrefs();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The last limit of a side switched off, so switching it back on restores it.
  const [hidden, setHidden] = useState<{ low: number | null; high: number | null }>({ low: null, high: null });

  const type = rule.sensor.type;
  const live = lookup.resolve(rule.sensor.category, rule.sensor.id)?.value ?? null;

  // Track extent in the stored unit. It only grows once chosen, so the knobs do not move under a
  // drag as the reading wanders.
  const [bounds, setBounds] = useState<Bounds>(() => baseBounds(type, live, rule.low, rule.high));
  const wanted = widenBounds(bounds, [rule.low, rule.high, live]);
  if (wanted.min !== bounds.min || wanted.max !== bounds.max) setBounds(wanted);
  const shown = displayBounds(bounds, type, tempUnit);

  const lowOn = rule.low !== null;
  const highOn = rule.high !== null;
  const lowNative = rule.low ?? hidden.low ?? seedBound('low', type, live, bounds, rule.high);
  const highNative = rule.high ?? hidden.high ?? seedBound('high', type, live, bounds, rule.low);
  const fmt = (v: number) => formatAlertValue(fromDisplay(v, type, tempUnit), type, tempUnit, numberFormat, monitoringWholeNumbers);

  const edit = (patch: Partial<SensorAlertRule>, write: boolean) => {
    const next = { ...rule, ...patch };
    if (write) onSave(next);
    else onPreview(next);
  };

  const toggleSide = (side: 'low' | 'high', on: boolean) => {
    if (!on) {
      setHidden(h => ({ ...h, [side]: rule[side] }));
      edit({ [side]: null }, true);
      return;
    }
    const other = side === 'low' ? rule.high : rule.low;
    const remembered = hidden[side];
    const ordered = remembered !== null && (other === null || (side === 'low' ? remembered < other : remembered > other));
    edit({ [side]: ordered ? remembered : seedBound(side, type, live, bounds, other) }, true);
  };

  const setRange = ([lo, hi]: [number, number], write: boolean) => {
    edit({
      ...(lowOn ? { low: fromDisplay(lo, type, tempUnit) } : {}),
      ...(highOn ? { high: fromDisplay(hi, type, tempUnit) } : {}),
    }, write);
  };

  const outsideTone = rule.severity === 'act' ? BAD : WARN;
  const chip = chipState(rule, state);
  const severityOptions: Array<{ key: SensorAlertSeverity; label: string }> = [
    { key: 'watch', label: t('diagnostics.incidents.severity.warning') },
    { key: 'act', label: t('diagnostics.incidents.severity.critical') },
  ];
  const repeatOptions = REPEAT_OPTIONS_MINUTES.map(minutes => ({
    key: String(minutes),
    label: minutes === 0
      ? t('diagnostics.alerts.repeat.once')
      : minutes < 60 ? t('diagnostics.duration.minutes', { m: minutes }) : t('diagnostics.duration.hours', { h: minutes / 60 }),
  }));

  return (
    <>
      <CollapsibleSection
        title={sensorLabel(rule.sensor)}
        searchAnchor={sensorAlertAnchor(rule.id)}
        titleAfter={chip && <Badge label={t(`diagnostics.alerts.state.${chip}`)} color={stateColor(chip, rule)} />}
        open={open}
        onToggle={onToggleOpen}
        rightInteractive
        right={(
          <span className={styles.headRight}>
            <span className={styles.liveValue}>
              {live !== null ? formatAlertValue(live, type, tempUnit, numberFormat, monitoringWholeNumbers) : t('diagnostics.alerts.noReading')}
            </span>
            <Toggle checked={rule.enabled} onChange={enabled => edit({ enabled }, true)} ariaLabel={t('diagnostics.alerts.enabledFor', { name: sensorLabel(rule.sensor) })} />
          </span>
        )}
      >
        <SettingRow label={t('monitoring.settings.sensor')} wrapControl>
          <SensorPicker
            lookup={lookup}
            category={rule.sensor.category}
            sensor={rule.sensor.id}
            categories={ALERT_SENSOR_CATEGORIES}
            sensorTypes={ALERT_SENSOR_TYPES}
            onChange={(sel, resolved) => {
              if (!resolved) return;
              const ref = sensorRefOf(sel.category, resolved);
              const typeChanged = ref.type !== type;
              const next: SensorAlertRule = typeChanged
                ? { ...rule, sensor: ref, low: null, high: defaultHigh(ref.type, resolved.value) }
                : { ...rule, sensor: ref };
              if (typeChanged) {
                setBounds(baseBounds(ref.type, resolved.value, next.low, next.high));
                setHidden({ low: null, high: null });
              }
              onSave(next);
            }}
          />
        </SettingRow>
        <SettingToggle
          label={t('diagnostics.alerts.below')}
          checked={lowOn}
          disabled={lowOn && !highOn}
          onChange={on => toggleSide('low', on)}
        />
        <SettingToggle
          label={t('diagnostics.alerts.above')}
          checked={highOn}
          disabled={highOn && !lowOn}
          onChange={on => toggleSide('high', on)}
        />
        <div className={styles.sliderBlock}>
          <RangeSlider
            orientation={STACKED}
            editable
            softBounds
            label={t('diagnostics.alerts.validRange')}
            value={[snapDisplay(toDisplay(lowNative, type, tempUnit), type), snapDisplay(toDisplay(highNative, type, tempUnit), type)]}
            min={shown.min}
            max={shown.max}
            step={stepFor(type)}
            lowEnabled={lowOn}
            highEnabled={highOn}
            outsideTone={outsideTone}
            marker={live !== null ? { value: toDisplay(live, type, tempUnit), label: formatAlertValue(live, type, tempUnit, numberFormat, monitoringWholeNumbers) } : undefined}
            formatValue={fmt}
            ariaLabelMin={t('diagnostics.alerts.lowKnob')}
            ariaLabelMax={t('diagnostics.alerts.highKnob')}
            onChange={(v, commit) => setRange(v, Boolean(commit))}
            onCommit={v => setRange(v, true)}
          />
        </div>
        <SettingRow label={t('diagnostics.alerts.delays')}>
          <span className={styles.delayPair}>
            {(['raiseAfterSeconds', 'clearAfterSeconds'] as const).map(field => (
              <span key={field} className={styles.delayField}>
                <span className={styles.delayLabel}>{t(field === 'raiseAfterSeconds' ? 'diagnostics.alerts.raiseAfter' : 'diagnostics.alerts.clearAfter')}</span>
                <Select
                  value={String(rule[field])}
                  ariaLabel={t(field === 'raiseAfterSeconds' ? 'diagnostics.alerts.raiseAfter' : 'diagnostics.alerts.clearAfter')}
                  options={delayChoices(rule[field]).map(sec => ({ value: String(sec), label: delayLabel(t, language, sec) }))}
                  onChange={v => edit({ [field]: Number(v) }, true)}
                />
              </span>
            ))}
          </span>
        </SettingRow>
        <SettingRow label={t('diagnostics.alerts.severity')} description={t('diagnostics.alerts.severityHint')}>
          <ChipGroup
            ariaLabel={t('diagnostics.alerts.severity')}
            activeKey={rule.severity}
            onChange={key => edit({ severity: key as SensorAlertSeverity }, true)}
            options={severityOptions}
          />
        </SettingRow>
        <SettingToggle
          label={t('diagnostics.alerts.notifyDesktop')}
          checked={rule.notifyDesktop}
          onChange={notifyDesktop => edit({ notifyDesktop }, true)}
        />
        <SettingToggle
          label={t('diagnostics.alerts.showInHealth')}
          checked={rule.showInHealth}
          onChange={showInHealth => edit({ showInHealth }, true)}
        />
        <SettingRow label={t('diagnostics.alerts.repeat')}>
          <ChipGroup
            ariaLabel={t('diagnostics.alerts.repeat')}
            activeKey={String(rule.repeatMinutes)}
            onChange={key => edit({ repeatMinutes: Number(key) }, true)}
            options={repeatOptions}
          />
        </SettingRow>
        <SettingRow>
          <Button type="button" tone="neutral" size="sm" icon={<Trash2 size={13} aria-hidden />} onClick={() => setConfirmOpen(true)}>
            {t('common.delete')}
          </Button>
        </SettingRow>
      </CollapsibleSection>
      <ConfirmModal
        open={confirmOpen}
        title={t('common.delete')}
        message={t('diagnostics.alerts.deleteConfirm', { name: sensorLabel(rule.sensor) })}
        confirmLabel={t('common.delete')}
        onConfirm={() => { setConfirmOpen(false); onDelete(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
