import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { Button } from '../../../../components/common/Button/Button';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { Slider } from '../../../../components/common/Slider/Slider';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { useThrottle } from '../../../../hooks/cadence';
import { useTranslation } from '../../../../lib/i18n';
import {
  NEUTRAL_COLOR_ADJUST,
  fetchLightingColorAdjust,
  setLightingColorAdjust,
  setLightingDeviceBrightness,
  type LightingColorAdjust,
  type LightingDevice,
} from '../../../../api/lighting';
import { useGlobalBrightness } from './useGlobalBrightness';
import {
  RIBBON_SAMPLES,
  applyColorAdjust,
  isNeutralAdjust,
  toCss,
} from './colorTuning';
import styles from './ColorTuningModal.module.scss';

interface ColorTuningModalProps {
  /** Every tunable card, in rail order - the modal's own device list. */
  devices: LightingDevice[];
  /** Cards the tuning starts scoped to: the card the menu was opened on, or
   *  the whole selection when it was opened from a multi-card menu. */
  initialIds: string[];
  onClose: () => void;
}

/** One control's value across the scoped devices: `mixed` when they disagree,
 *  in which case `value` is the average so the slider still has a position. */
interface Spread {
  value: number;
  mixed: boolean;
}

function spread(values: number[]): Spread {
  if (values.length === 0) return { value: 0, mixed: false };
  const first = values[0];
  const mixed = values.some(v => Math.abs(v - first) > 1e-4);
  if (!mixed) return { value: first, mixed: false };
  return { value: values.reduce((a, b) => a + b, 0) / values.length, mixed: true };
}

/**
 * Per-device colour tuning: channel gains, a warm/cool shift, saturation and
 * brightness, applied by the service on the frame's way to the hardware.
 *
 * This is calibration, not an effect - two strips rendering the same canvas
 * pixel can look visibly different (LED bin, diffuser, sleeve), and these
 * controls trim each device until they agree. Nothing here changes the canvas
 * preview, exactly as per-device brightness never did.
 *
 * Multi-device by design: the scope chips at the top drive one write for the
 * whole set, and any control the scoped devices disagree on says so rather
 * than silently showing one device's value for all of them.
 */
export function ColorTuningModal({ devices, initialIds, onClose }: ColorTuningModalProps) {
  const { t } = useTranslation();
  const globalBrightness = useGlobalBrightness();

  const [scoped, setScoped] = useState<Set<string>>(() => {
    const known = new Set(devices.map(d => d.id));
    const seed = initialIds.filter(id => known.has(id));
    return new Set(seed.length > 0 ? seed : devices.slice(0, 1).map(d => d.id));
  });
  // Service-owned trims, seeded once and then kept in step with our own
  // writes. Sparse on the wire: an id absent from the response is neutral.
  const [adjusts, setAdjusts] = useState<Record<string, LightingColorAdjust>>({});
  // Brightness lives on the device list, but a drag has to read back instantly
  // rather than waiting for the list to refetch, so edits are held here.
  const [brightness, setBrightness] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchLightingColorAdjust().then(data => {
      if (!cancelled && data) setAdjusts(data.adjustments ?? {});
    }).catch(() => { /* best-effort: an unreachable service reads as neutral */ });
    return () => { cancelled = true; };
  }, []);

  const adjustOf = useCallback(
    (id: string): LightingColorAdjust => adjusts[id] ?? NEUTRAL_COLOR_ADJUST,
    [adjusts],
  );
  const brightnessOf = useCallback((id: string): number => {
    const local = brightness[id];
    if (local !== undefined) return local;
    return devices.find(d => d.id === id)?.brightness ?? 100;
  }, [brightness, devices]);

  const scopedIds = useMemo(
    () => devices.filter(d => scoped.has(d.id)).map(d => d.id),
    [devices, scoped],
  );

  // Current slider positions, plus whether the scoped devices agree on each.
  const red = spread(scopedIds.map(id => adjustOf(id).red));
  const green = spread(scopedIds.map(id => adjustOf(id).green));
  const blue = spread(scopedIds.map(id => adjustOf(id).blue));
  const temperature = spread(scopedIds.map(id => adjustOf(id).temperature));
  const saturation = spread(scopedIds.map(id => adjustOf(id).saturation));
  const bright = spread(scopedIds.map(id => brightnessOf(id)));

  const adjustThrottle = useThrottle();
  const brightnessThrottle = useThrottle();

  // Every control writes the same trim to every scoped device, so one patch
  // rebuilds the whole set from the values on screen - a mixed control stops
  // being mixed the moment the user touches it, which is the intent.
  const writeAdjust = useCallback((patch: Partial<LightingColorAdjust>, commit: boolean) => {
    const next: LightingColorAdjust = {
      red: patch.red ?? red.value,
      green: patch.green ?? green.value,
      blue: patch.blue ?? blue.value,
      temperature: patch.temperature ?? temperature.value,
      saturation: patch.saturation ?? saturation.value,
    };
    setAdjusts(prev => {
      const out = { ...prev };
      for (const id of scopedIds) out[id] = next;
      return out;
    });
    const send = () => setLightingColorAdjust(scopedIds, next).catch(() => { /* best-effort */ });
    if (commit) send();
    else adjustThrottle(send);
  }, [adjustThrottle, blue.value, green.value, red.value, saturation.value, scopedIds, temperature.value]);

  const writeBrightness = useCallback((value: number, commit: boolean) => {
    setBrightness(prev => {
      const out = { ...prev };
      for (const id of scopedIds) out[id] = value;
      return out;
    });
    const send = () => {
      for (const id of scopedIds) {
        setLightingDeviceBrightness(id, value).catch(() => { /* best-effort */ });
      }
    };
    if (commit) send();
    else brightnessThrottle(send);
  }, [brightnessThrottle, scopedIds]);

  const handleReset = useCallback(() => {
    writeAdjust({ ...NEUTRAL_COLOR_ADJUST }, true);
    writeBrightness(100, true);
  }, [writeAdjust, writeBrightness]);

  // The ribbon renders what the sliders currently say, so a mixed control
  // previews its average - the same value the next drag would commit.
  // Brightness is deliberately left out: it dims the whole device rather than
  // shifting a colour, and folding it in would just darken every cell and hide
  // the shift the ribbon exists to show.
  const ribbon = useMemo(() => {
    const preview: LightingColorAdjust = {
      red: red.value, green: green.value, blue: blue.value,
      temperature: temperature.value, saturation: saturation.value,
    };
    return RIBBON_SAMPLES.map(source => ({
      source: toCss(source),
      tuned: toCss(applyColorAdjust(source, preview)),
    }));
  }, [red.value, green.value, blue.value, temperature.value, saturation.value]);

  const empty = scopedIds.length === 0;
  const mixedLabel = (s: Spread) => (s.mixed
    ? <span className={styles.mixed}>{t('lighting.colorTuning.mixed')}</span>
    : null);

  const master = globalBrightness == null ? 100 : Math.round(globalBrightness * 100);
  const showCap = globalBrightness != null && bright.value > master;

  return (
    <DeviceModal open onClose={onClose} title={t('lighting.colorTuning.title')} medium>
      <div className={styles.body}>
        <p className={styles.hint}>{t('lighting.colorTuning.hint')}</p>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>{t('lighting.colorTuning.scope')}</span>
            <div className={styles.sectionActions}>
              <Button
                tone="ghost"
                size="sm"
                disabled={scoped.size === devices.length}
                onClick={() => setScoped(new Set(devices.map(d => d.id)))}
              >
                {t('lighting.ledMap.selectAll')}
              </Button>
            </div>
          </div>
          <ChipGroup
            wrap
            multiSelect
            ariaLabel={t('lighting.colorTuning.scope')}
            activeKeys={scoped}
            onToggleKey={id => setScoped(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })}
            options={devices.map(d => ({
              key: d.id,
              label: (
                <span className={styles.chipLabel}>
                  {d.name}
                  {/* A dot marks a device that already carries a trim, so an
                      untouched set is distinguishable at a glance from one
                      where only some devices were tuned. */}
                  {!isNeutralAdjust(adjustOf(d.id)) && (
                    <span className={styles.tunedDot} aria-hidden />
                  )}
                </span>
              ),
              ariaLabel: isNeutralAdjust(adjustOf(d.id))
                ? d.name
                : t('lighting.colorTuning.deviceTuned', { name: d.name }),
            }))}
          />
          {empty && <p className={styles.empty} role="status">{t('lighting.colorTuning.noScope')}</p>}
        </section>

        {/* The shift, shown on one ribbon: each cell is split corner to corner,
            the upper-left half the colour the effect produced and the lower-
            right half what this device will actually be sent. */}
        <section className={styles.section}>
          <div className={styles.ribbon} aria-hidden>
            {ribbon.map((cell, i) => (
              <span
                key={i}
                className={styles.ribbonCell}
                style={{
                  backgroundImage:
                    `linear-gradient(to bottom right, ${cell.source} 0 49.5%, ${cell.tuned} 50.5% 100%)`,
                }}
              />
            ))}
          </div>
          <div className={styles.ribbonLegend}>
            <span>{t('lighting.colorTuning.legendSource')}</span>
            <span>{t('lighting.colorTuning.legendTuned')}</span>
          </div>
        </section>

        <section className={styles.controls} aria-disabled={empty || undefined}>
          <div className={styles.control}>
            <div className={styles.controlHead}>{mixedLabel(bright)}</div>
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('lighting.devices.brightness')}
              // The stacked layout wraps the input in a <label> that also holds
              // the editable value, so without this the accessible name comes
              // out as "Brightness100%".
              ariaLabel={t('lighting.devices.brightness')}
              info={t('lighting.colorTuning.brightnessInfo')}
              value={Math.round(bright.value)}
              min={0}
              max={100}
              step={1}
              fillCap={showCap ? master : undefined}
              marker={showCap ? master : undefined}
              markerLabel={showCap ? (
                <InfoTooltip
                  message={t('lighting.colorTuning.effectiveBrightnessInfo', { master })}
                  side="bottom"
                />
              ) : undefined}
              disabled={empty}
              formatValue={v => `${v}%`}
              onChange={v => writeBrightness(v, false)}
              onCommit={v => writeBrightness(v, true)}
              className={bright.mixed ? styles.sliderMixed : undefined}
            />
          </div>

          {([
            ['red', red, 'lighting.colorTuning.red'],
            ['green', green, 'lighting.colorTuning.green'],
            ['blue', blue, 'lighting.colorTuning.blue'],
          ] as const).map(([channel, value, labelKey]) => (
            <div key={channel} className={`${styles.control} ${styles[channel]}`}>
              <div className={styles.controlHead}>{mixedLabel(value)}</div>
              <Slider
                orientation="stacked"
                editable
                trackFill
                label={t(labelKey)}
                ariaLabel={t(labelKey)}
                value={Math.round(value.value * 100)}
                min={30}
                max={170}
                step={1}
                disabled={empty}
                formatValue={v => `${v}%`}
                onChange={v => writeAdjust({ [channel]: v / 100 }, false)}
                onCommit={v => writeAdjust({ [channel]: v / 100 }, true)}
                className={value.mixed ? styles.sliderMixed : undefined}
              />
            </div>
          ))}

          <div className={styles.control}>
            <div className={styles.controlHead}>{mixedLabel(temperature)}</div>
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              zeroMarker
              showRange
              label={t('lighting.colorTuning.temperature')}
              ariaLabel={t('lighting.colorTuning.temperature')}
              info={t('lighting.colorTuning.temperatureInfo')}
              value={Math.round(temperature.value * 100)}
              min={-100}
              max={100}
              step={1}
              disabled={empty}
              formatValue={v => (v === -100
                ? t('lighting.colorTuning.cool')
                : v === 100
                  ? t('lighting.colorTuning.warm')
                  : `${v > 0 ? '+' : ''}${v}`)}
              onChange={v => writeAdjust({ temperature: v / 100 }, false)}
              onCommit={v => writeAdjust({ temperature: v / 100 }, true)}
              className={temperature.mixed ? styles.sliderMixed : undefined}
            />
          </div>

          <div className={styles.control}>
            <div className={styles.controlHead}>{mixedLabel(saturation)}</div>
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('lighting.devices.saturation')}
              ariaLabel={t('lighting.devices.saturation')}
              info={t('lighting.colorTuning.saturationInfo')}
              value={Math.round(saturation.value * 100)}
              min={0}
              max={200}
              step={1}
              disabled={empty}
              formatValue={v => `${v}%`}
              onChange={v => writeAdjust({ saturation: v / 100 }, false)}
              onCommit={v => writeAdjust({ saturation: v / 100 }, true)}
              className={saturation.mixed ? styles.sliderMixed : undefined}
            />
          </div>
        </section>

        <div className={styles.actions}>
          <Button tone="ghost" size="sm" disabled={empty} onClick={handleReset}>
            {t('lighting.colorTuning.reset')}
          </Button>
          <Button tone="accent" size="sm" onClick={onClose}>
            {t('lighting.colorTuning.done')}
          </Button>
        </div>
      </div>
    </DeviceModal>
  );
}
