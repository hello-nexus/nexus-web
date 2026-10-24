import { useEffect, useRef, useState } from 'react';
import { fetchStreamSettings, setStreamFpsCap } from '../../api/panel';
import { isRemoteOrigin, isRemotePaired } from '../../api/service';
import { Select, type SelectOption } from '../../components/common/Select/Select';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { useToastSafe } from '../../components/common/Toast/Toast';
import { useTranslation } from '../../lib/i18n';
import { RATE_CAP_OPTIONS_HZ } from '../widgets/lighting/page/RateCapSelect';

const OFF = '';

/**
 * Global frame cap for every streamed display. Applies on change and reverts
 * to the last value the service confirmed when the newest save fails. The
 * service route is loopback-only, so a phone, a remote origin or the relay
 * never renders or fetches it. The section shows at once with the Select
 * disabled until the GET answers, and disappears if that GET fails (an older
 * service without the route).
 */
export function StreamFpsCapSetting() {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const local = !isRemoteOrigin && !isRemotePaired;
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [current, setCurrent] = useState<number | null>(null);
  // Newest request wins: an older response must neither revert nor confirm.
  const seq = useRef(0);
  const confirmed = useRef<number | null>(null);

  useEffect(() => {
    if (!local) return;
    let alive = true;
    void fetchStreamSettings().then(s => {
      if (!alive) return;
      if (!s) {
        setStatus('unsupported');
        return;
      }
      confirmed.current = s.fpsCap ?? null;
      // A pick made before the GET answered stays; otherwise show the service value.
      if (seq.current === 0) setCurrent(confirmed.current);
      setStatus('ready');
    });
    return () => { alive = false; };
  }, [local]);

  if (!local || status === 'unsupported') return null;

  const options: SelectOption[] = [
    { value: OFF, label: t('lighting.ledMap.rateCapOff') },
    ...RATE_CAP_OPTIONS_HZ.map(hz => ({
      value: String(hz), label: t('lighting.ledMap.rateCapHz', { hz }),
    })),
  ];

  const handleChange = (v: string) => {
    const next = v === OFF ? null : Number(v);
    const mine = ++seq.current;
    setCurrent(next);
    const fail = () => {
      if (mine !== seq.current) return;
      setCurrent(confirmed.current);
      push({ title: t('panel.editor.streamFpsCap.failed') });
    };
    setStreamFpsCap(next)
      .then(r => {
        if (!r) fail();
        else confirmed.current = r.fpsCap ?? null;
      })
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
        disabled={status !== 'ready'}
      />
    </SettingsSection>
  );
}
