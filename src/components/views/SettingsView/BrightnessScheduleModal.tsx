import { useMemo } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { Slider } from '../../common/Slider/Slider';
import { CurveGraph, type CurveGraphAxis } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import type { BrightnessSchedulePoint } from '../../../api/lighting';
import type { BrightnessScheduleState } from '../../../hooks/useBrightnessSchedule';
import { useIdleDim } from '../../../hooks/useIdleDim';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { SCHEDULE_EASING } from '../../../lib/brightnessSchedule';
import { IDLE_DIM_TIMEOUTS } from '../../../lib/idleDim';
import { slideshowIntervalLabel } from '../../../panel/slideshow/slideshow';
import { hour12OptionFor, localizeNumbers } from '../../../lib/units';
import styles from './BrightnessScheduleModal.module.scss';

// As many "12 AM"-style labels as a phone-width chart fits without them
// colliding; the points themselves mark the hours between.
const HOUR_STEP = 6;

interface BrightnessScheduleModalProps {
  open: boolean;
  onClose: () => void;
  state: BrightnessScheduleState;
}

/**
 * Editor for the master-brightness schedule: the cooling curve graph on a
 * 0..24 hour axis, plus the on/off switch and a reset to the service's
 * out-of-box curve. Every edit saves straight through, so the LEDs follow the
 * drag on the next push.
 */
export function BrightnessScheduleModal({ open, onClose, state }: BrightnessScheduleModalProps) {
  const { t, language } = useTranslation();
  // The modal mounts only while open, so this fetches on open.
  const idleDim = useIdleDim(true);
  const { timeFormat, numberFormat } = useUnitPrefs();
  const { schedule, defaults, current, minute, save } = state;

  const hour12 = hour12OptionFor(timeFormat);
  const axis = useMemo<CurveGraphAxis>(() => ({
    xStep: HOUR_STEP,
    wrap: true,
    xName: t('lighting.schedule.axis.time'),
    yName: t('lighting.schedule.axis.brightness'),
    // The right edge is midnight again, so hour 24 reads as hour 0.
    formatX: h => new Date(2000, 0, 1, h % 24).toLocaleTimeString(undefined, { hour: 'numeric', hour12 }),
    formatLiveX: h => new Date(2000, 0, 1, Math.floor(h), Math.round((h % 1) * 60))
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12 }),
  }), [t, hour12]);

  const points = useMemo<CurvePoint[]>(
    () => (schedule?.points ?? []).map(p => ({ temp: p.hour, speed: p.brightness })),
    [schedule],
  );

  const commit = (next: CurvePoint[]) => {
    if (!schedule) return;
    // The axis runs past the last hour so it has room, but a point dragged
    // onto the edge is midnight, which the first hour already owns. One point
    // per hour, the later on the axis winning: the graph clamps a drag to its
    // neighbours inclusively, so two points can share an hour.
    const byHour = new Map<number, BrightnessSchedulePoint>();
    for (const p of next) {
      const hour = Math.min(23, Math.max(0, Math.round(p.temp)));
      byHour.set(hour, { hour, brightness: Math.max(0, Math.min(100, Math.round(p.speed))) });
    }
    void save({ enabled: schedule.enabled, points: [...byHour.values()] });
  };

  const isDefault = useMemo(() => {
    if (!schedule || defaults.length === 0 || schedule.points.length !== defaults.length) return false;
    const sorted = [...schedule.points].sort((a, b) => a.hour - b.hour);
    return sorted.every((p, i) => p.hour === defaults[i].hour && p.brightness === defaults[i].brightness);
  }, [schedule, defaults]);

  const idle = idleDim.state;
  const idleSettings = idle && { enabled: idle.enabled, timeoutSeconds: idle.timeoutSeconds, level: idle.level };
  const osOff = idle?.osScreenOffSeconds ?? null;
  const screenOffLabel = osOff === null ? t('lighting.idleDim.timeout.screenOff')
    : osOff === 0 ? t('lighting.idleDim.timeout.screenOffNever')
      : t('lighting.idleDim.timeout.screenOffAfter', { duration: slideshowIntervalLabel(t, language, osOff) });
  const timeoutOptions = idle ? [
    ...(idle.screenOffSupported ? [{ value: '0', label: screenOffLabel }] : []),
    ...IDLE_DIM_TIMEOUTS.map(s => ({ value: String(s), label: slideshowIntervalLabel(t, language, s) })),
  ] : [];
  const neverDims = !!idle && idle.timeoutSeconds === 0 && osOff === 0;

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={t('lighting.schedule.title')}
      icon={<Clock size={18} />}
      medium
    >
      <div className={styles.modal}>
        <SettingToggle
          label={t('lighting.schedule.enable.label')}
          description={t('lighting.schedule.enable.description')}
          checked={schedule?.enabled ?? false}
          disabled={!schedule}
          onChange={enabled => { if (schedule) void save({ ...schedule, enabled }); }}
          stackOnNarrow
        />

        <p className={styles.hint}>{t('lighting.schedule.graph.hint')}</p>

        <div className={styles.graph}>
          <CurveGraph
            points={points}
            tempMin={0}
            tempMax={24}
            axis={axis}
            easing={SCHEDULE_EASING}
            currentTemp={minute / 60}
            editable={!!schedule}
            onChange={commit}
          />
        </div>

        <div className={styles.footer}>
          <span className={styles.now}>
            {schedule?.enabled && current !== null
              ? t('lighting.schedule.now.on', { level: localizeNumbers(`${current}%`, numberFormat) })
              : t('lighting.schedule.now.off')}
          </span>
          <Button
            type="button"
            tone="ghost"
            size="sm"
            icon={<RotateCcw size={13} />}
            disabled={!schedule || defaults.length === 0 || isDefault}
            onClick={() => { if (schedule) void save({ enabled: schedule.enabled, points: defaults }); }}
          >
            {t('lighting.schedule.reset')}
          </Button>
        </div>

        {idle?.supported && idleSettings && (
          <div className={styles.idle}>
            <SettingToggle
              label={t('lighting.idleDim.enable.label')}
              description={t('lighting.idleDim.enable.description')}
              checked={idle.enabled}
              onChange={enabled => { void idleDim.save({ ...idleSettings, enabled }); }}
              stackOnNarrow
            />
            {idle.enabled && (
              <>
                <SettingSelect
                  label={t('lighting.idleDim.timeout.label')}
                  description={neverDims ? t('lighting.idleDim.timeout.neverNote') : undefined}
                  descriptionBelow
                  value={String(idle.timeoutSeconds)}
                  options={timeoutOptions}
                  onChange={v => { void idleDim.save({ ...idleSettings, timeoutSeconds: Number(v) }); }}
                />
                <Slider
                  // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                  orientation="stacked"
                  editable
                  trackFill
                  label={t('lighting.idleDim.level.label')}
                  ariaLabel={t('lighting.idleDim.level.label')}
                  value={idle.level}
                  min={0}
                  max={100}
                  step={1}
                  formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
                  onChange={v => idleDim.preview({ ...idleSettings, level: v })}
                  onCommit={v => { void idleDim.save({ ...idleSettings, level: v }); }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </DeviceModal>
  );
}
