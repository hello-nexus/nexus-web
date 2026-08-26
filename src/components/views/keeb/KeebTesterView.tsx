import { useCallback, useEffect, useState } from 'react';
import { Keyboard, RefreshCw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolveHour12, type TimeFormat } from '../../../lib/units';
import styles from './KeebTesterView.module.scss';

function formatEventClock(ms: number, timeFormat: TimeFormat): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: resolveHour12(timeFormat) });
}

interface TouchEntry {
  key: string;
  code: string;
  timestamp: number;
}

/// Key Tester tab body. Runs in Local Mode: it listens to window keydown
/// events, so it verifies real keystrokes end-to-end (keyboard -> OS ->
/// browser) without any service round-trip. The page mounts this view only
/// on the tester tab, so the mount lifetime gates the global key listener.
export function KeebTesterView() {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const [history, setHistory] = useState<TouchEntry[]>([]);

  const handler = useCallback((event: KeyboardEvent) => {
    if (event.repeat) return;
    setHistory(prev => [
      {
        key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
        code: event.code,
        timestamp: Date.now(),
      },
      ...prev,
    ].slice(0, 20));
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [handler]);

  const onReset = () => setHistory([]);
  const latest = history[0];

  return (
    <div className={styles.container}>
      <SettingsSection
        title={t('keeb.tester.localMode')}
        description={t('keeb.tester.localModeHint')}
        action={
          <Button size="sm" tone="neutral" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={onReset}>
            {t('keeb.tester.reset')}
          </Button>
        }
      >
        <InfoList>
          <InfoRow label={t('keeb.tester.key')} value={latest?.key ?? '-'} />
          <InfoRow label={t('keeb.tester.code')} value={latest?.code ?? '-'} />
          <InfoRow
            label={t('keeb.tester.time')}
            value={latest ? formatEventClock(latest.timestamp, timeFormat) : '-'}
          />
        </InfoList>
      </SettingsSection>

      <SettingsSection title={t('keeb.tester.history')}>
        {history.length === 0 ? (
          <EmptyState
            icon={<Keyboard size={24} aria-hidden="true" />}
            title={t('keeb.tester.empty')}
            compact
          />
        ) : (
          <InfoList>
            {history.map(entry => (
              <InfoRow
                key={`${entry.timestamp}-${entry.key}`}
                label={`${entry.key} · ${entry.code}`}
                value={formatEventClock(entry.timestamp, timeFormat)}
              />
            ))}
          </InfoList>
        )}
      </SettingsSection>
    </div>
  );
}
