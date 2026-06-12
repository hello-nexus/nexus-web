import { useEffect, useRef, useState } from 'react';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { useTranslation } from '../../lib/i18n';
import styles from './PanelHostNameSetting.module.scss';

interface PanelHostNameSettingProps {
  // Resolved host name. Empty while the initial /ping is in flight (input
  // shows a placeholder).
  machineName: string;
  onCommit: (next: string) => void;
}

/**
 * Inline editor for the user-overridden host PC display name. Commits on blur
 * or Enter. Empty input clears the override; the server then falls back to
 * Environment.MachineName.
 */
export function PanelHostNameSetting({ machineName, onCommit }: PanelHostNameSettingProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(machineName);

  // Sync to the server-resolved value only when the input isn't focused.
  // Without the focus guard, a watchdog refresh mid-typing would overwrite the
  // draft with the previous server value.
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
    <SettingsSection title={t('panel.editor.hostName.title')}>
      <input
        ref={inputRef}
        id="panel-host-name-input"
        aria-label={t('panel.editor.hostName.title')}
        className={styles.input}
        type="text"
        value={draft}
        placeholder={machineName || t('panel.editor.hostName.placeholder')}
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
      <div className={styles.hint}>{t('panel.editor.hostName.hint')}</div>
    </SettingsSection>
  );
}
