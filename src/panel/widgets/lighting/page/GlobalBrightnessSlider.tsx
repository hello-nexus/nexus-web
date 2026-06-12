import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, SunDim } from 'lucide-react';
import { fetchGlobalBrightness, setGlobalBrightness } from '../../../../api/lighting';
import { Slider } from '../../../../components/common/Slider/Slider';
import { useThrottle } from '../../../../hooks/cadence';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Master brightness slider at the top of the lighting page. Multiplies
 * each per-device brightness before colour reaches hardware: effective
 * LED brightness is `global * device / 100`. Stored 0..1 on the
 * service side, surfaced 0..100% in the UI.
 *
 * Layout: [sun icon] [bare track] [value]. Same Sun glyph the Displays
 * widget uses for monitor brightness.
 */
export function GlobalBrightnessSlider({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  // Null until the first fetch resolves, to avoid flashing 100% on
  // mount when the persisted value is anything else.
  const [percent, setPercent] = useState<number | null>(null);
  const throttle = useThrottle();
  // Active-drag window. Mid-drag topic pushes (including the broadcast
  // from our own throttled POST) would refetch the persisted value and
  // snap the thumb back to the last-committed server value.
  const localEditUntilRef = useRef(0);

  const refresh = useCallback(() => {
    if (Date.now() < localEditUntilRef.current) return;
    fetchGlobalBrightness().then(data => {
      if (!data) return;
      setPercent(Math.round(Math.max(0, Math.min(1, data.value)) * 100));
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    refresh();
  }, [serviceOnline, refresh]);

  // Stay in sync if another client (or a profile load) mutates the global
  // brightness. Every /lighting/* mutation publishes a `lighting` frame.
  useTopicCallback('lighting', serviceOnline, refresh);

  const sendValue = useCallback((next: number) => {
    setGlobalBrightness(Math.max(0, Math.min(1, next / 100))).catch(() => { /* best-effort */ });
  }, []);

  const handleChange = useCallback((value: number) => {
    localEditUntilRef.current = Date.now() + 1500;
    setPercent(value);
    throttle(() => sendValue(value));
  }, [sendValue, throttle]);

  const handleCommit = useCallback((value: number) => {
    localEditUntilRef.current = Date.now() + 1500;
    sendValue(value);
  }, [sendValue]);

  if (percent === null) {
    // Reserve the row so the OpenRGB badge doesn't shift when the
    // slider hydrates.
    return <div className={styles.globalBrightnessSlider} aria-hidden />;
  }

  const ariaLabel = t('lighting.devices.brightness');
  // At zero, swap to SunDim (shorter rays) as an off indicator,
  // mirroring how VolumeX marks muted audio.
  const Icon = percent === 0 ? SunDim : Sun;

  return (
    <div className={styles.globalBrightnessSlider}>
      <Icon size={14} strokeWidth={1.7} className={styles.globalBrightnessIcon} aria-hidden />
      <Slider
        value={percent}
        min={0}
        max={100}
        step={1}
        // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
        orientation="bare"
        onChange={handleChange}
        onCommit={handleCommit}
        trackFill
        ariaLabel={ariaLabel}
        className={styles.globalBrightnessTrack}
      />
      <span className={styles.globalBrightnessValue}>{percent}%</span>
    </div>
  );
}
