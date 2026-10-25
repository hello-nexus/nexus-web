import { useEffect, useRef, useState } from 'react';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { useTranslation } from '../../../../lib/i18n';
import { setLightingMaxRate } from '../../../../api/lighting';
import styles from './LedMapEditor.module.scss';

export const RATE_CAP_OPTIONS_HZ = [30, 20, 15, 10, 5, 1] as const;
const OFF = '';

interface Props {
  id: string;
  /** The stored cap in Hz; null = Off. */
  value: number | null;
  onFail: () => void;
  /** Called once each time the save queue drains after a success, so the parent refetches the device list. */
  onSaved?: () => void;
}

/** Per-device frame-rate cap. Applies on change; reverts when the save fails. Mount one per card (key by id). */
export function RateCapSelect({ id, value, onFail, onSaved }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<number | null>(value);
  // Only the newest request reverts the display, to the last confirmed value. An older
  // success records the confirmed value only if it is newer than the last confirmation.
  const seq = useRef(0);
  // Requests in flight. While any is, a value arriving from the parent (an older
  // save's refetch) must not overwrite a newer pick.
  const pending = useRef(new Set<number>());
  const confirmed = useRef<number | null>(value);
  const confirmedSeq = useRef(0);
  const shown = useRef(value);
  const saved = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (pending.current.size > 0) return;
    confirmed.current = value;
    shown.current = value;
    setCurrent(value);
  }, [value]);

  const options: SelectOption[] = [
    { value: OFF, label: t('lighting.ledMap.rateCapOff') },
    ...RATE_CAP_OPTIONS_HZ.map(hz => ({
      value: String(hz), label: t('lighting.ledMap.rateCapHz', { hz }),
    })),
  ];

  const handleChange = (v: string) => {
    const next = v === OFF ? null : Number(v);
    const mine = ++seq.current;
    pending.current.add(mine);
    shown.current = next;
    setCurrent(next);
    const settle = () => {
      pending.current.delete(mine);
      if (pending.current.size > 0) return;
      if (mounted.current && shown.current !== confirmed.current) {
        shown.current = confirmed.current;
        setCurrent(confirmed.current);
      }
      if (saved.current) {
        saved.current = false;
        onSaved?.();
      }
    };
    const fail = () => {
      if (mine !== seq.current || !mounted.current) return;
      shown.current = confirmed.current;
      setCurrent(confirmed.current);
      onFail();
    };
    setLightingMaxRate(id, next)
      .then(r => {
        if (!r || r.error) fail();
        else {
          saved.current = true;
          if (mine > confirmedSeq.current) {
            confirmed.current = next;
            confirmedSeq.current = mine;
          }
        }
        settle();
      })
      .catch(() => {
        fail();
        settle();
      });
  };

  return (
    <div className={styles.rateCapField}>
      <span>{t('lighting.ledMap.rateCap')}</span>
      <InfoTooltip message={t('lighting.ledMap.rateCapHint')} side="top" />
      <Select
        value={current == null ? OFF : String(current)}
        onChange={handleChange}
        options={options}
        ariaLabel={t('lighting.ledMap.rateCap')}
      />
    </div>
  );
}
