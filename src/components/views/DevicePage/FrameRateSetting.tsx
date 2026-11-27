import { useEffect, useRef, useState } from 'react';
import { patchPanelDevice } from '../../../api/panel';
import { useTranslation } from '../../../lib/i18n';
import { useToastSafe } from '../../common/Toast/Toast';
import { SettingSelect } from '../../common/SettingRow/SettingRow';
import { frameRateCaps, frameRateFromValue, frameRateValue } from './frameRateOptions';

/** Matches no option, so the select shows its placeholder. */
const MIXED_VALUE = 'mixed';

interface Props {
  /** The panel record the cap belongs to; null before it is known. Not needed with `onSave`. */
  recordId?: string | null;
  /** The stored cap; null = Off. */
  cap: number | null;
  /** Saves a cap in fps (0 = Off) somewhere other than a panel record; resolves true when it was stored. */
  onSave?: (fps: number) => Promise<boolean>;
  /** The edited devices hold different caps; the select shows "Mixed" until a rate is picked. */
  mixed?: boolean;
  /** Rates offered beyond the lighting presets. */
  extraCapsHz?: readonly number[];
  /** Replaces the default panel hint, for callers whose content is not redrawn. */
  hint?: string;
}

/**
 * Per-device frame rate cap. Applies on change; the newest request wins, and a failed save puts the
 * select back on the newest successful save. A value arriving from the parent while a save
 * is in flight (an older save's broadcast) never overwrites a newer pick.
 */
export function FrameRateSetting({ recordId = null, cap, onSave, mixed = false, extraCapsHz, hint }: Props) {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const [current, setCurrent] = useState<number | null>(cap);
  const [picked, setPicked] = useState(false);
  const seq = useRef(0);
  const pending = useRef(0);
  const confirmed = useRef<number | null>(cap);
  const confirmedSeq = useRef(0);
  const failedSeq = useRef(0);

  useEffect(() => {
    if (pending.current > 0) return;
    confirmed.current = cap;
    setCurrent(cap);
    setPicked(false);
  }, [cap, mixed]);

  const handleChange = (value: string) => {
    if (!onSave && !recordId) return;
    const sent = frameRateFromValue(value);
    const next = sent > 0 ? sent : null;
    setPicked(true);
    const mine = ++seq.current;
    pending.current += 1;
    setCurrent(next);
    const settle = (ok: boolean) => {
      pending.current -= 1;
      if (ok) {
        // The service holds the newest successful save, even when a later pick failed.
        if (mine > confirmedSeq.current) {
          confirmed.current = next;
          confirmedSeq.current = mine;
        }
        // The newest pick already failed and rolled back; follow the older save that landed after it.
        if (failedSeq.current === seq.current) setCurrent(confirmed.current);
        return;
      }
      if (mine !== seq.current) return;
      failedSeq.current = mine;
      setCurrent(confirmed.current);
      // Nothing was saved from the mixed state, so it reads Mixed again rather than the unsaved cap.
      if (confirmedSeq.current === 0) setPicked(false);
      push({ title: t('lighting.ledMap.rateCapFailed') });
    };
    const saved = onSave ? onSave(sent) : patchPanelDevice(recordId as string, { fpsCap: sent });
    saved.then(r => settle(!!r), () => settle(false));
  };

  return (
    <SettingSelect
      label={t('lighting.ledMap.rateCap')}
      description={hint ?? t('devices.lcd.frameRateHint')}
      value={mixed && !picked ? MIXED_VALUE : frameRateValue(current)}
      placeholder={mixed && !picked ? t('common.mixed') : undefined}
      options={frameRateCaps(current, extraCapsHz).map(hz => (hz === null
        ? { value: '', label: t('lighting.ledMap.rateCapOff') }
        : { value: String(hz), label: t('lighting.ledMap.rateCapHz', { hz }) }))}
      onChange={handleChange}
    />
  );
}
