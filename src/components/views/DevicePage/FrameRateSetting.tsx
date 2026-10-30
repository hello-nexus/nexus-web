import { useEffect, useRef, useState } from 'react';
import { patchPanelDevice } from '../../../api/panel';
import { useTranslation } from '../../../lib/i18n';
import { useToastSafe } from '../../common/Toast/Toast';
import { SettingSelect } from '../../common/SettingRow/SettingRow';
import { frameRateCaps, frameRateFromValue, frameRateValue } from './frameRateOptions';

interface Props {
  /** The panel record the cap belongs to; null before it is known. */
  recordId: string | null;
  /** The stored cap; null = Off. */
  cap: number | null;
}

/**
 * Per-device frame rate cap. Applies on change; the newest request wins, and a failed save puts the
 * select back on the last value the service confirmed. A value arriving from the parent while a save
 * is in flight (an older save's broadcast) never overwrites a newer pick.
 */
export function FrameRateSetting({ recordId, cap }: Props) {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const [current, setCurrent] = useState<number | null>(cap);
  const seq = useRef(0);
  const pending = useRef(0);
  const confirmed = useRef<number | null>(cap);

  useEffect(() => {
    if (pending.current > 0) return;
    confirmed.current = cap;
    setCurrent(cap);
  }, [cap]);

  const handleChange = (value: string) => {
    if (!recordId) return;
    const sent = frameRateFromValue(value);
    const next = sent > 0 ? sent : null;
    const mine = ++seq.current;
    pending.current += 1;
    setCurrent(next);
    const settle = (ok: boolean) => {
      pending.current -= 1;
      if (ok) {
        // Only the newest request records what the service holds.
        if (mine === seq.current) confirmed.current = next;
        return;
      }
      if (mine !== seq.current) return;
      setCurrent(confirmed.current);
      push({ title: t('lighting.ledMap.rateCapFailed') });
    };
    patchPanelDevice(recordId, { fpsCap: sent }).then(r => settle(!!r), () => settle(false));
  };

  return (
    <SettingSelect
      label={t('devices.lcd.frameRate')}
      description={t('devices.lcd.frameRateHint')}
      value={frameRateValue(current)}
      options={frameRateCaps(current).map(hz => (hz === null
        ? { value: '', label: t('lighting.ledMap.rateCapOff') }
        : { value: String(hz), label: t('lighting.ledMap.rateCapHz', { hz }) }))}
      onChange={handleChange}
    />
  );
}
