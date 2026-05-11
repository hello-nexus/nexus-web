import { useEffect, useRef, useState } from 'react';
import styles from './PanelHostNameSetting.module.scss';

interface PanelHostNameSettingProps {
  // Currently resolved host name. Empty string while the initial /ping is
  // in flight - the input shows a placeholder until it lands.
  machineName: string;
  onCommit: (next: string) => void;
}

/**
 * Inline editor for the user-overridden host PC display name. Shows the
 * current resolved value, lets the user replace it, and commits on blur
 * or Enter. Empty input clears the override on the server, which falls
 * back to Environment.MachineName on the next read.
 */
export function PanelHostNameSetting({ machineName, onCommit }: PanelHostNameSettingProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(machineName);

  // Sync to the latest server-resolved value, but only when the input is
  // not focused. Without the focus guard, a watchdog refresh mid-typing
  // would replace the user's draft with the previous server value.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setDraft(machineName);
  }, [machineName]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === machineName) {
      if (trimmed !== draft) setDraft(trimmed);
      return;
    }
    onCommit(trimmed);
  };

  return (
    <div className={styles.section}>
      <label className={styles.title} htmlFor="panel-host-name-input">Computer name</label>
      <input
        ref={inputRef}
        id="panel-host-name-input"
        className={styles.input}
        type="text"
        value={draft}
        placeholder={machineName || 'this PC'}
        maxLength={64}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(machineName);
            (e.target as HTMLInputElement).blur();
          }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <div className={styles.hint}>Shown to paired phones and in the panel tray.</div>
    </div>
  );
}
