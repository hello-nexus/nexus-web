import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGlobalBrightness, setGlobalBrightness } from '../../../../api/lighting';
import { Slider } from '../../../../components/common/Slider/Slider';
import { useThrottle } from '../../../../hooks/cadence';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Master brightness slider at the top of the lighting page. Caps each
 * per-device brightness before colour reaches hardware: effective LED
 * brightness is `min(global, device / 100)`, so a device never renders
 * brighter than master. Stored 0..1 on the service side, surfaced
 * 0..100% in the UI.
 *
 * Renders as a labelled stacked slider so it reads as the first control in the
 * effect dock's stack rather than a separate widget.
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

  return (
    <div className={styles.globalBrightnessSlider}>
      <Slider
        // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
        orientation="stacked"
        editable
        trackFill
        label={t('lighting.settings.brightnessLabel')}
        value={percent}
        min={0}
        max={100}
        step={1}
        onChange={handleChange}
        onCommit={handleCommit}
      />
    </div>
  );
}
