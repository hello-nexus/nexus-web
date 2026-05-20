import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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

/// Key Tester tab body. The firmware-driven `keeb.tester` WebSocket
/// topic isn't wired yet (Phase 7 in plans/keeb-support.md). Until then
/// this runs in **Local Mode**: it listens to window keydown events so
/// the table shape is testable without hardware.
export function KeebTesterView({ open }: KeebTesterViewProps) {
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
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>Local Mode</h3>
          <p className={styles.hint}>
            Live key testing arrives with the HID driver — see Phase 7 of the keeb-support plan.
            For now this listens to your browser's keydown events so the UI is still testable.
          </p>
        </div>
        <button type="button" className={styles.resetBtn} onClick={onReset}>
          <RefreshCw size={14} aria-hidden="true" />
          Reset
        </button>
      </header>

      <section className={styles.latest} aria-label="Latest key">
        <div className={styles.latestStat}>
          <span className={styles.statValue}>{latest?.key ?? '—'}</span>
          <span className={styles.statLabel}>Key</span>
        </div>
        <div className={styles.latestStat}>
          <span className={styles.statValue}>{latest?.keycode ?? '—'}</span>
          <span className={styles.statLabel}>Keycode</span>
        </div>
        <div className={styles.latestStat}>
          <span className={styles.statValue}>
            {latest ? new Date(latest.timestamp).toLocaleTimeString() : '—'}
          </span>
          <span className={styles.statLabel}>Timestamp</span>
        </div>
      </section>

      <section className={styles.history} aria-label="Key history">
        <header className={styles.historyHead}>
          <span>Key</span>
          <span>Keycode</span>
          <span>Time</span>
        </header>
        {history.length === 0 && (
          <p className={styles.empty}>Press any key to populate the history.</p>
        )}
        {history.map(entry => (
          <div key={`${entry.timestamp}-${entry.key}`} className={styles.historyRow}>
            <span>{entry.key}</span>
            <span>{entry.keycode}</span>
            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
