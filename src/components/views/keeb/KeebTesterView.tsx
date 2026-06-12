import { useCallback, useEffect, useState } from 'react';
import { Keyboard, RefreshCw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Card } from '../../common/Card/Card';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { useTranslation } from '../../../lib/i18n';
import styles from './KeebTesterView.module.scss';

interface TouchEntry {
  key: string;
  keycode: number;
  timestamp: number;
}

export interface KeebTesterViewProps {
  /** Whether the modal is currently open — gates the global key listener. */
  open: boolean;
}

/// Key Tester tab body. The firmware-driven `keeb.tester` WebSocket topic
/// isn't wired (Phase 7 in plans/keeb-support.md), so this runs in Local
/// Mode: it listens to window keydown events, testable without hardware.
export function KeebTesterView({ open }: KeebTesterViewProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<TouchEntry[]>([]);

  const handler = useCallback((event: KeyboardEvent) => {
    if (event.repeat) return;
    setHistory(prev => [
      {
        key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
        keycode: event.keyCode || 0,
        timestamp: Date.now(),
      },
      ...prev,
    ].slice(0, 20));
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [open, handler]);

  const onReset = () => setHistory([]);
  const latest = history[0];

  return (
    <div className={styles.container}>
      <Card
        title={t('keeb.tester.localMode')}
        subtitle={t('keeb.tester.localModeHint')}
        actions={
          <Button size="sm" tone="neutral" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={onReset}>
            {t('keeb.tester.reset')}
          </Button>
        }
      >
        <InfoList>
          <InfoRow label={t('keeb.tester.key')} value={latest?.key ?? '-'} />
          <InfoRow label={t('keeb.tester.keycode')} value={latest?.keycode ?? '-'} />
          <InfoRow
            label={t('keeb.tester.time')}
            value={latest ? new Date(latest.timestamp).toLocaleTimeString() : '-'}
          />
        </InfoList>
      </Card>

      <Card title={t('keeb.tester.history')}>
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
                label={`${entry.key} (kc ${entry.keycode})`}
                value={new Date(entry.timestamp).toLocaleTimeString()}
              />
            ))}
          </InfoList>
        )}
      </Card>
    </div>
  );
}
