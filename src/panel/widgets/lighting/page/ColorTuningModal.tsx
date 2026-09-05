import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { Button } from '../../../../components/common/Button/Button';
import { Slider } from '../../../../components/common/Slider/Slider';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { useThrottle } from '../../../../hooks/cadence';
import { useTranslation } from '../../../../lib/i18n';
import {
  NEUTRAL_COLOR_ADJUST,
  fetchLightingColorAdjust,
  setLightingColorAdjust,
  type LightingColorAdjust,
  type LightingColorAdjustPatch,
  type LightingDevice,
} from '../../../../api/lighting';
import { useGlobalBrightness } from './useGlobalBrightness';
import { RIBBON_SAMPLES, applyColorAdjust, toCss } from './colorTuning';
import styles from './ColorTuningModal.module.scss';

interface ColorTuningModalProps {
  /** Every tunable card, used to resolve the scoped ids to names + brightness. */
  devices: LightingDevice[];
  /** Cards this tuning applies to: the card the menu was opened on, or the
   *  whole selection when it was opened from a multi-card menu. Fixed for the
   *  life of the modal - the scope is chosen on the device rail, not in here. */
  deviceIds: string[];
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
 * Multi-device by design: one write covers the whole scope, and any control
 * the scoped devices disagree on says so rather than silently showing one
 * device's value for all of them.
 */
export function ColorTuningModal({ devices, deviceIds, onClose }: ColorTuningModalProps) {
  const { t } = useTranslation();
  const globalBrightness = useGlobalBrightness();

  // Service-owned trims, seeded once and then kept in step with our own
  // writes. Sparse on the wire: an id absent from the response is neutral.
  const [adjusts, setAdjusts] = useState<Record<string, LightingColorAdjust>>({});
  // Brightness lives on the device list, but a drag has to read back instantly
  // rather than waiting for the list to refetch, so edits are held here.
  const [brightness, setBrightness] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchLightingColorAdjust().then(data => {
      // Local writes win: the sliders are live before this resolves, so a drag
      // inside that window must not be repainted with the pre-drag values.
      if (!cancelled && data) setAdjusts(prev => ({ ...(data.adjustments ?? {}), ...prev }));
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

  // Scope is fixed at open. Resolved against the live card list so an id that
  // disappeared (hub recomposed, device unplugged) drops out instead of being
  // written to.
  const scopedCards = useMemo(
    () => deviceIds.map(id => devices.find(d => d.id === id)).filter((d): d is LightingDevice => d != null),
    [devices, deviceIds],
  );
  const scopedIds = useMemo(() => scopedCards.map(d => d.id), [scopedCards]);

  // Current slider positions, plus whether the scoped devices agree on each.
  const red = spread(scopedIds.map(id => adjustOf(id).red));
  const green = spread(scopedIds.map(id => adjustOf(id).green));
  const blue = spread(scopedIds.map(id => adjustOf(id).blue));
  const temperature = spread(scopedIds.map(id => adjustOf(id).temperature));
  const saturation = spread(scopedIds.map(id => adjustOf(id).saturation));
  const bright = spread(scopedIds.map(id => brightnessOf(id)));

  const throttle = useThrottle();
  // The throttle has no cancel, so a commit that fired immediately can be
  // followed ~33ms later by the drag's trailing callback. Both read the latest
  // patch from this ref rather than a captured value, and an identical payload
  // is dropped - so the trailing call can neither revert the commit nor double
  // up a typed edit (which fires onChange(commit) and onCommit back to back).
  const pendingRef = useRef<{ ids: string[]; patch: LightingColorAdjustPatch } | null>(null);
  const lastSentRef = useRef('');
  const flush = useCallback(() => {
    const p = pendingRef.current;
    if (!p || p.ids.length === 0) return;
    const key = JSON.stringify(p);
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    setLightingColorAdjust(p.ids, p.patch).catch(() => { /* best-effort */ });
  }, []);

  // Only the moved control goes over the wire. The service leaves every field
  // the body omits alone, so nudging Red cannot flatten a saturation the two
  // scoped devices disagree on into their average.
  const write = useCallback((patch: LightingColorAdjustPatch, commit: boolean) => {
    const { brightness: nextBrightness, ...trim } = patch;
    if (Object.keys(trim).length > 0) {
      setAdjusts(prev => {
        const out = { ...prev };
        for (const id of scopedIds) out[id] = { ...(prev[id] ?? NEUTRAL_COLOR_ADJUST), ...trim };
        return out;
      });
    }
    if (nextBrightness !== undefined) {
      setBrightness(prev => {
        const out = { ...prev };
        for (const id of scopedIds) out[id] = nextBrightness;
        return out;
      });
    }
    pendingRef.current = { ids: scopedIds, patch };
    if (commit) flush();
    else throttle(flush);
  }, [flush, scopedIds, throttle]);

  const handleReset = useCallback(() => {
    write({ ...NEUTRAL_COLOR_ADJUST, brightness: 100 }, true);
  }, [write]);

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
        {/* Read-only: the scope is whatever the device rail had selected when
            the menu was opened, so this states what is about to change rather
            than offering another place to change it. */}
        <section className={styles.section}>
          <span className={styles.sectionTitle}>{t('lighting.colorTuning.scope')}</span>
          <p className={styles.deviceList}>
            {scopedCards.map(d => d.name).join(', ')}
          </p>
        </section>

        {/* The shift, as two stacked bands over the same reference colours:
            the top row is what the effect produced, the row under it what this
            device will actually be sent. Column-aligned so each pair reads as
            one before/after comparison. */}
        <section className={styles.section}>
          <div className={styles.ribbon}>
            <span className={styles.ribbonLabel}>{t('lighting.colorTuning.legendSource')}</span>
            <div className={styles.ribbonRow} aria-hidden>
              {ribbon.map((cell, i) => (
                <span key={i} className={styles.ribbonCell} style={{ background: cell.source }} />
              ))}
            </div>
            <span className={styles.ribbonLabel}>{t('lighting.colorTuning.legendTuned')}</span>
            <div className={styles.ribbonRow} aria-hidden>
              {ribbon.map((cell, i) => (
                <span key={i} className={styles.ribbonCell} style={{ background: cell.tuned }} />
              ))}
            </div>
          </div>
        </section>

        <section className={styles.controls}>
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
                  className={styles.markerInfo}
                />
              ) : undefined}
              disabled={empty}
              formatValue={v => `${v}%`}
              onChange={v => write({ brightness: v }, false)}
              onCommit={v => write({ brightness: v }, true)}
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
                onChange={v => write({ [channel]: v / 100 }, false)}
                onCommit={v => write({ [channel]: v / 100 }, true)}
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
              onChange={v => write({ temperature: v / 100 }, false)}
              onCommit={v => write({ temperature: v / 100 }, true)}
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
              onChange={v => write({ saturation: v / 100 }, false)}
              onCommit={v => write({ saturation: v / 100 }, true)}
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
