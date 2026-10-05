import { useCallback, useEffect, useRef, useState } from 'react';
import { GaugeCircle, Fan } from 'lucide-react';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import { fetchCurves, fetchFanChannels, type FanChannel, type WireCurve } from '../../../api/cooling';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import styles from './CoolingFanRow.module.scss';

// Matches the device pages' state polls, which move the same telemetry.
const POLL_MS = 2000;

/** Live cooling channels and curves, polled while mounted, for a device Cooling tab's read-only rows. */
export function useCoolingChannels() {
  const [channels, setChannels] = useState<FanChannel[]>([]);
  const [curves, setCurves] = useState<WireCurve[]>([]);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const [fans, saved] = await Promise.all([fetchFanChannels(), fetchCurves()]);
    // Both or neither, like the Cooling page: channels without their curves
    // would show a curve-driven fan as Manual.
    if (!aliveRef.current || !fans || !saved) return;
    setChannels(fans.channels);
    setCurves(saved.curves);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  return { channels, curves };
}

/** One fan's line on a device Cooling tab: name, live RPM and how the Cooling page drives it. */
export function CoolingFanRow({
  label,
  rpm,
  rpmUnavailable = false,
  channel,
  curves,
}: {
  label: string;
  rpm: number;
  rpmUnavailable?: boolean;
  channel: FanChannel | null;
  curves: readonly WireCurve[];
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();

  // Same labels and precedence as the Cooling page's per-fan mode dropdown:
  // a curve binding beats the reported mode (hub providers report a
  // curve-driven fan as Manual), and a later curve's binding wins.
  let curveName = '';
  for (const c of curves) {
    if (channel && c.outputs?.some(o => o.id === channel.id)) curveName = c.name;
  }
  let mode = '';
  let showDuty = false;
  if (channel?.controlled === false) {
    mode = t('cooling.fan.notControlled');
  } else if (curveName) {
    mode = curveName;
    showDuty = true;
  } else if (channel?.mode === 'Manual') {
    mode = t('cooling.card.manual');
    showDuty = true;
  } else if (channel && channel.mode !== 'Curve') {
    mode = t('cooling.card.bios');
  }

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      {rpmUnavailable ? (
        <HoverTooltip body={t('cooling.fan.rpmUnavailableHint')}>
          <span className={styles.rpmMuted}>
            <GaugeCircle size={12} aria-hidden />
            {t('cooling.fan.rpmUnavailable')}
          </span>
        </HoverTooltip>
      ) : (
        <span className={styles.rpm}>
          <Fan size={12} aria-hidden />
          {rpm > 0 ? `${formatNumber(rpm, numberFormat)} RPM` : '-'}
        </span>
      )}
      <span className={styles.mode}>
        {mode}
        {showDuty && channel && (
          <span className={styles.duty}>{localizeNumbers(`${channel.dutyPercent}%`, numberFormat)}</span>
        )}
      </span>
    </div>
  );
}
