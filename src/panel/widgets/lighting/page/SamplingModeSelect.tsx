import { useEffect, useRef, useState } from 'react';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { useTranslation } from '../../../../lib/i18n';
import { setLightingSampling, type SamplingMode } from '../../../../api/lighting';
import styles from './LedMapEditor.module.scss';

interface Props {
  id: string;
  value: SamplingMode;
  onFail: () => void;
  /** Called after the newest save succeeds, so the parent refetches the device list. */
  onSaved?: () => void;
}

/** Per-device sampling mode. Applies on change; reverts when the save fails. */
export function SamplingModeSelect({ id, value, onFail, onSaved }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<SamplingMode>(value);
  // Newest request wins; a failure reverts to the value held at pick time.
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

  const options: SelectOption[] = [
    { value: 'led', label: t('lighting.ledMap.samplingLed') },
    { value: 'nearest', label: t('lighting.ledMap.samplingNearest') },
    { value: 'rows', label: t('lighting.ledMap.samplingRows') },
    { value: 'columns', label: t('lighting.ledMap.samplingColumns') },
  ];

  const handleChange = (v: string) => {
    const next = v as SamplingMode;
    const prev = current;
    const mine = ++seq.current;
    pending.current.add(mine);
    setCurrent(next);
    const fail = () => {
      if (mine !== seq.current) return;
      setCurrent(prev);
      onFail();
    };
    setLightingSampling(id, next)
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
      <span>{t('lighting.ledMap.sampling')}</span>
      <InfoTooltip message={t('lighting.ledMap.samplingHint')} side="top" />
      <Select value={current} onChange={handleChange} options={options} ariaLabel={t('lighting.ledMap.sampling')} />
    </div>
  );
}
