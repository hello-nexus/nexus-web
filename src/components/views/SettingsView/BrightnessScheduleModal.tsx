import { useCallback, useMemo } from 'react';
import { Clock, Moon, RotateCcw, Sun } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { Slider } from '../../common/Slider/Slider';
import { CurveGraph, type CurveGraphAxis, type CurveGraphMarker } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import type { BrightnessSchedulePoint } from '../../../api/lighting';
import { geocodeResultToLocation, sameWeatherLocation, weatherLocationKey } from '../../../api/weather';
import { WeatherLocationSearch } from '../../../panel/widgets/weather/WeatherLocationSearch';
import { useWeatherPrefs } from '../../../panel/widgets/weather/useWeatherPrefs';
import type { BrightnessScheduleState } from '../../../hooks/useBrightnessSchedule';
import { useIdleDim } from '../../../hooks/useIdleDim';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { SCHEDULE_EASING } from '../../../lib/brightnessSchedule';
import { IDLE_DIM_TIMEOUTS, snapIdleTimeout } from '../../../lib/idleDim';
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
 * out-of-box curve. With the sunset shift on, the service plays a curve
 * generated from today's sunrise and sunset, so the graph shows that one
 * read-only. Every edit saves straight through, so the LEDs follow the
 * drag on the next push.
 */
export function BrightnessScheduleModal({ open, onClose, state }: BrightnessScheduleModalProps) {
  const { t, language } = useTranslation();
  // The modal mounts only while open, so this fetches on open.
  const idleDim = useIdleDim(true);
  const { timeFormat, numberFormat } = useUnitPrefs();
  const { schedule, defaults, current, minute, save, sunShift, location, sun, sunPoints, saveSun } = state;
  const { prefs } = useWeatherPrefs();

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

  // The generated curve replaces the user's points while it applies.
  const sunApplies = sunPoints !== null;
  const points = useMemo<CurvePoint[]>(
    () => (sunPoints ?? schedule?.points ?? []).map(p => ({ temp: p.hour, speed: p.brightness })),
    [schedule, sunPoints],
  );

  const clock = useCallback((min: number) => new Date(2000, 0, 1, Math.floor(min / 60) % 24, Math.floor(min % 60))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12 }), [hour12]);
  const markers = useMemo<CurveGraphMarker[] | undefined>(() => {
    if (!sunApplies || sun?.sunriseMin == null || sun.sunsetMin == null) return undefined;
    return [
      { x: sun.sunriseMin / 60, label: clock(sun.sunriseMin), icon: <Sun size={12} /> },
      { x: sun.sunsetMin / 60, label: clock(sun.sunsetMin), icon: <Moon size={12} /> },
    ];
  }, [sunApplies, sun, clock]);

  // One line under the picker whatever the toggle says, so flipping it never
  // changes the modal's height: the times when known, else why there are none.
  const sunNote = sun?.status === 'polar-day' ? t('lighting.schedule.sun.polarDay')
    : sun?.status === 'polar-night' ? t('lighting.schedule.sun.polarNight')
      : sun?.status === 'no-location' ? t('lighting.schedule.sun.noLocation')
        : null;

  // The picker lists the saved places plus the chosen one when it predates
  // the list, so a place picked from a search still shows its name.
  const choices = location && !prefs.locations.some(l => sameWeatherLocation(l, location))
    ? [location, ...prefs.locations]
    : prefs.locations;
  const autoLabel = sun?.autoLocation
    ? t('lighting.schedule.sun.locationAutoNamed', { place: sun.autoLocation.label })
    : t('lighting.schedule.sun.locationAuto');
  const pickLocation = (key: string) => {
    if (key === '') { void saveSun({ location: null }); return; }
    const picked = choices.find(l => weatherLocationKey(l) === key);
    if (picked) void saveSun({ location: picked });
  };

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
          label={t('lighting.schedule.sun.label')}
          description={t('lighting.schedule.sun.description')}
          checked={sunShift}
          disabled={!schedule}
          onChange={on => { void saveSun({ sunShift: on }); }}
          stackOnNarrow
        />
        <div className={styles.sun}>
          <SettingSelect
            label={t('lighting.schedule.sun.location')}
            value={location ? weatherLocationKey(location) : ''}
            options={[
              { value: '', label: autoLabel },
              ...choices.map(l => ({ value: weatherLocationKey(l), label: l.label })),
            ]}
            disabled={!sunShift}
            onChange={pickLocation}
          />
          <WeatherLocationSearch
            hasKeyboard
            disabled={!sunShift}
            onSelect={result => { void saveSun({ location: geocodeResultToLocation(result) }); }}
          />
          {sun?.status === 'ok' && sun.sunriseMin != null && sun.sunsetMin != null ? (
            <p className={styles.hint}>
              {t('lighting.schedule.sun.times', { sunrise: clock(sun.sunriseMin), sunset: clock(sun.sunsetMin) })}
            </p>
          ) : sunNote && <p className={styles.hint}>{sunNote}</p>}
        </div>

        <SettingToggle
          label={t('lighting.schedule.enable.label')}
          description={t('lighting.schedule.enable.description')}
          checked={schedule?.enabled ?? false}
          disabled={!schedule}
          onChange={enabled => { if (schedule) void save({ ...schedule, enabled }); }}
          stackOnNarrow
        />

        {/* Both lines share one cell so the taller sets the height in either state. */}
        <div className={styles.hints}>
          <p className={styles.hint} aria-hidden={sunApplies ? true : undefined} data-hidden={sunApplies ? '' : undefined}>
            {t('lighting.schedule.graph.hint')}
          </p>
          <p className={styles.hint} aria-hidden={sunApplies ? undefined : true} data-hidden={sunApplies ? undefined : ''}>
            {t('lighting.schedule.sun.editNote')}
          </p>
        </div>

        <div className={styles.graph}>
          <CurveGraph
            points={points}
            tempMin={0}
            tempMax={24}
            axis={axis}
            easing={SCHEDULE_EASING}
            currentTemp={minute / 60}
            editable={!!schedule && !sunApplies}
            markers={markers}
            readOnly={sunApplies}
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
            disabled={!schedule || sunApplies || defaults.length === 0 || isDefault}
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
                  value={String(idle.timeoutSeconds === 0 ? 0 : snapIdleTimeout(idle.timeoutSeconds))}
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
