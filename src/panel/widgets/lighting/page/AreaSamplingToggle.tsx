import { useEffect, useRef, useState } from 'react';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { useTranslation } from '../../../../lib/i18n';
import { setLightingAreaSampling } from '../../../../api/lighting';
import styles from './LedMapEditor.module.scss';

interface Props {
  id: string;
  value: boolean;
  onFail: () => void;
  /** Called after the newest save succeeds, so the parent refetches the device list. */
  onSaved?: () => void;
}

/** Per-device Area sampling. Applies on toggle; reverts when the save fails. */
export function AreaSamplingToggle({ id, value, onFail, onSaved }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(value);
  // Newest request wins, as in RateCapSelect.
  const seq = useRef(0);
  const pending = useRef(new Set<number>());
  const lastId = useRef(id);
  useEffect(() => {
    if (lastId.current !== id) {
      lastId.current = id;
      seq.current += 1;
      pending.current.clear();
    } else if (pending.current.size > 0) {
      return;
    }
    setCurrent(value);
  }, [value, id]);

  const handleChange = (next: boolean) => {
    const prev = current;
    const mine = ++seq.current;
    pending.current.add(mine);
    setCurrent(next);
    const fail = () => {
      if (mine !== seq.current) return;
      setCurrent(prev);
      onFail();
    };
    setLightingAreaSampling(id, next)
      .then(r => {
        pending.current.delete(mine);
        if (!r || r.error) fail();
        else if (mine === seq.current) onSaved?.();
      })
      .catch(() => {
        pending.current.delete(mine);
        fail();
      });
  };

  return (
    <div className={styles.rateCapField}>
      <span>{t('lighting.ledMap.areaSampling')}</span>
      <InfoTooltip message={t('lighting.ledMap.areaSamplingHint')} side="top" />
      <Toggle checked={current} onChange={handleChange} ariaLabel={t('lighting.ledMap.areaSampling')} />
    </div>
  );
}
