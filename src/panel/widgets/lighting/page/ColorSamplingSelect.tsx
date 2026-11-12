import { useEffect, useRef, useState } from 'react';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { useTranslation } from '../../../../lib/i18n';
import { setLightingColorSampling, type ColorSamplingMode } from '../../../../api/lighting';
import styles from './LedMapEditor.module.scss';

interface Props {
  id: string;
  value: ColorSamplingMode;
  onFail: () => void;
  /** Called after the newest save succeeds, so the parent refetches the device list. */
  onSaved?: () => void;
}

/** Per-device color sampling mode. Applies on change; reverts when the save fails. */
export function ColorSamplingSelect({ id, value, onFail, onSaved }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<ColorSamplingMode>(value);
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
    { value: 'standard', label: t('lighting.ledMap.colorSamplingStandard') },
    { value: 'vivid', label: t('lighting.ledMap.colorSamplingVivid') },
    { value: 'ignore-black', label: t('lighting.ledMap.colorSamplingIgnoreBlack') },
  ];

  const handleChange = (v: string) => {
    const next = v as ColorSamplingMode;
    const prev = current;
    const mine = ++seq.current;
    pending.current.add(mine);
    setCurrent(next);
    const fail = () => {
      if (mine !== seq.current) return;
      setCurrent(prev);
      onFail();
    };
    setLightingColorSampling(id, next)
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
      <span>{t('lighting.ledMap.colorSampling')}</span>
      <InfoTooltip message={t('lighting.ledMap.colorSamplingHint')} side="top" />
      <Select value={current} onChange={handleChange} options={options} ariaLabel={t('lighting.ledMap.colorSampling')} />
    </div>
  );
}
