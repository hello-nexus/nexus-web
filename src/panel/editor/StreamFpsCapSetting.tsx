import { useEffect, useRef, useState } from 'react';
import { fetchStreamSettings, setStreamFpsCap } from '../../api/panel';
import { Select, type SelectOption } from '../../components/common/Select/Select';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { useToastSafe } from '../../components/common/Toast/Toast';
import { useTranslation } from '../../lib/i18n';
import { RATE_CAP_OPTIONS_HZ } from '../widgets/lighting/page/RateCapSelect';

const OFF = '';

/**
 * Global frame cap for every streamed display. Applies on change and reverts
 * when the save fails. Renders nothing until the service answers, and stays
 * hidden on a service without the route.
 */
export function StreamFpsCapSetting() {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const [supported, setSupported] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  // Newest request wins: an older response must neither revert nor confirm.
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    void fetchStreamSettings().then(s => {
      if (!alive || !s) return;
      setCurrent(s.fpsCap ?? null);
      setSupported(true);
    });
    return () => { alive = false; };
  }, []);

  if (!supported) return null;

  const options: SelectOption[] = [
    { value: OFF, label: t('lighting.ledMap.rateCapOff') },
    ...RATE_CAP_OPTIONS_HZ.map(hz => ({
      value: String(hz), label: t('lighting.ledMap.rateCapHz', { hz }),
    })),
  ];

  const handleChange = (v: string) => {
    const next = v === OFF ? null : Number(v);
    const prev = current;
    const mine = ++seq.current;
    setCurrent(next);
    const fail = () => {
      if (mine !== seq.current) return;
      setCurrent(prev);
      push({ title: t('panel.editor.streamFpsCap.failed') });
    };
    setStreamFpsCap(next)
      .then(r => { if (!r) fail(); })
      .catch(fail);
  };

  return (
    <SettingsSection
      title={t('panel.editor.streamFpsCap.title')}
      description={t('panel.editor.streamFpsCap.hint')}
    >
      <Select
        value={current == null ? OFF : String(current)}
        onChange={handleChange}
        options={options}
        ariaLabel={t('panel.editor.streamFpsCap.title')}
      />
    </SettingsSection>
  );
}
