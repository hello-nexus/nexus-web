import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, SunDim } from 'lucide-react';
import { fetchGlobalBrightness, setGlobalBrightness } from '../../../api/lighting';
import { Slider } from '../../Slider/Slider';
import { useThrottle } from '../../../hooks/cadence';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import styles from '../LightingView.module.scss';

/**
 * Master brightness slider rendered at the top of the lighting page. Multiplies
 * every per-device brightness slider before the colour lands on hardware, so
 * the effective brightness for an LED is `global * device / 100`. Stored as a
 * 0..1 float on the service side; the UI surfaces it as 0..100%.
 *
 * Layout: [sun icon] [bare track] [value]. Same Sun glyph the Displays widget
 * uses for monitor brightness so the two affordances feel like a matched set.
 */
export function GlobalBrightnessSlider({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  // Null until the first fetch resolves so we don't briefly flash 100% on
  // mount when the persisted value is anything else. After hydration the
  // slider is uncontrolled-by-defaults like every other lighting control.
  const [percent, setPercent] = useState<number | null>(null);
  const throttle = useThrottle();
  // Window during which the user is actively dragging the slider. Topic
  // pushes that fire mid-drag (including the broadcast triggered by our own
  // throttled POST) would otherwise refetch the persisted value and snap the
  // thumb back to wherever the server had last committed. Mirrors the same
  // pattern LightingView uses for animate-effect drags.
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
    // Reserve the row so the OpenRGB badge doesn't jump in from the right
    // when the slider hydrates. Width matches the rendered control roughly.
    return <div className={styles.globalBrightnessSlider} aria-hidden />;
  }

  const ariaLabel = t('lighting.devices.brightness');
  // Mute-like indicator when the master is at zero: SunDim is the same glyph
  // with shorter rays so the affordance still reads as "brightness" but
  // clearly signals "off" the way VolumeX does for the audio sliders.
  const Icon = percent === 0 ? SunDim : Sun;

  return (
    <div className={styles.globalBrightnessSlider}>
      <Icon size={14} strokeWidth={1.7} className={styles.globalBrightnessIcon} aria-hidden />
      <Slider
        value={percent}
        min={0}
        max={100}
        step={1}
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
