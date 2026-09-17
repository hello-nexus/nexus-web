import { useMemo } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { CurveGraph, type CurveGraphAxis } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import type { BrightnessSchedulePoint } from '../../../api/lighting';
import type { BrightnessScheduleState } from '../../../hooks/useBrightnessSchedule';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { SCHEDULE_EASING } from '../../../lib/brightnessSchedule';
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
 * 0..24 hour axis drawn as a smooth curve through the points, plus the on/off
 * switch and a reset to the service's out-of-box curve. Every edit saves
 * straight through, so the LEDs follow the drag on the next push.
 */
export function BrightnessScheduleModal({ open, onClose, state }: BrightnessScheduleModalProps) {
  const { t } = useTranslation();
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
      </div>
    </DeviceModal>
  );
}
