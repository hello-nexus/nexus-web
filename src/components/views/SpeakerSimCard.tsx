import { useEffect, useState } from 'react';
import { fetchDevSimSpeaker, startDevSimSpeaker, stopDevSimSpeaker, type DevSimSpeaker } from '../../api/devSim';
import { useTranslation } from '../../lib/i18n';
import { Card } from '../common/Card/Card';
import { InlineError } from '../common/InlineError/InlineError';
import { SettingToggle } from '../common/SettingRow/SettingRow';
import styles from './ToolsView.module.scss';

/** Dev-tools-only card on the Tools page: a simulated Logitech G560 that drives the real device page. */
export function SpeakerSimCard() {
  const { t } = useTranslation();
  const [sim, setSim] = useState<DevSimSpeaker | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchDevSimSpeaker().then(next => { if (!cancelled) { if (next) setSim(next); else setError(true); } });
    return () => { cancelled = true; };
  }, []);

  const send = async (request: Promise<DevSimSpeaker | null>) => {
    const next = await request;
    setError(!next);
    if (next) setSim(next);
  };

  if (!sim && !error) return null;

  return (
    <Card title={t('tools.simSpeaker.title')}>
      <span className={styles.dim}>{t('tools.simSpeaker.description')}</span>
      <SettingToggle
        label={t('tools.simSpeaker.active')}
        checked={sim?.active ?? false}
        disabled={!sim}
        onChange={on => { void send(on ? startDevSimSpeaker() : stopDevSimSpeaker()); }}
      />
      {sim?.active && <span className={styles.dim}>{t('tools.simSpeaker.tests', { count: sim.testsPlayed })}</span>}
      {error && <InlineError>{t('tools.simSpeaker.error')}</InlineError>}
    </Card>
  );
}
