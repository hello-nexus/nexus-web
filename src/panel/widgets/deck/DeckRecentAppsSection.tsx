import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { Button } from '../../../components/common/Button/Button';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { DeviceModal } from '../../../components/common/DeviceModal/DeviceModal';
import { SettingsSection } from '../../../components/common/SettingsSection/SettingsSection';
import { SettingRow } from '../../../components/common/SettingRow/SettingRow';
import { AppPicker } from '../common/AppPicker';
import { fetchService } from '../../../api/service';
import { useRecentApps } from './useRecentApps';
import styles from './DeckRecentAppsSection.module.scss';

interface ShortcutSummary {
  name: string;
  processName?: string;
}

/** processKey (lowercased process name) -> display name, resolved once from
 *  the installed shortcut list - the same source AppPicker reads, so an
 *  excluded app still shows its real name after a reopen (the recents ring
 *  itself never carries an excluded app's name once it drops out). */
function useShortcutNamesByProcess(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void fetchService<{ shortcuts: ShortcutSummary[] }>('/shortcuts').then(res => {
      if (cancelled || !res) return;
      const map: Record<string, string> = {};
      for (const s of res.shortcuts) {
        const key = s.processName?.toLowerCase();
        if (key && !map[key]) map[key] = s.name;
      }
      setNames(map);
    });
    return () => { cancelled = true; };
  }, []);
  return names;
}

export interface DeckRecentAppsSectionProps {
  /** True when the host has no grid of its own to show for this mode (the
   *  widget settings sheet); renders a read-only preview note in its place.
   *  StreamDeckDevicePage shows its own live tiles instead, so it passes false. */
  showPreviewNote: boolean;
}

/**
 * Recent Apps mode controls: excluded-apps chips (add via AppPicker, remove
 * by clicking a chip) and a clear-recent action. Every key in this mode is
 * the live ring - there is nothing else to configure here.
 */
export function DeckRecentAppsSection({ showPreviewNote }: DeckRecentAppsSectionProps) {
  const { t } = useTranslation();
  const { apps, excluded, setExcluded, clear } = useRecentApps(true);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const shortcutNames = useShortcutNamesByProcess();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const nameFor = (key: string): string =>
    sessionNames[key] ?? apps.find(a => a.processKey === key)?.name ?? shortcutNames[key] ?? key;

  return (
    <div className={styles.root}>
      <SettingsSection description={t('panel.settings.deck.mode.recentAppsDescription')}>
        <SettingRow label={t('panel.settings.deck.recentApps.excludedTitle')} wrapControl stackOnNarrow>
          <div className={styles.chipRow}>
            {excluded.length > 0 && (
              <ChipGroup
                wrap
                multiSelect
                ariaLabel={t('panel.settings.deck.recentApps.excludedTitle')}
                activeKeys={new Set(excluded)}
                options={excluded.map(key => ({
                  key,
                  ariaLabel: t('panel.settings.deck.recentApps.excludedRemove', { name: nameFor(key) }),
                  label: (
                    <span className={styles.chipLabel}>
                      {nameFor(key)}
                      <X size={12} aria-hidden />
                    </span>
                  ),
                }))}
                onToggleKey={key => void setExcluded(excluded.filter(k => k !== key))}
              />
            )}
            <Button
              tone="ghost"
              size="sm"
              icon={<Plus size={14} aria-hidden />}
              onClick={() => setPickerOpen(true)}
            >
              {t('panel.settings.deck.recentApps.addExcluded')}
            </Button>
          </div>
        </SettingRow>

        <SettingRow>
          <Button tone="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            {t('panel.settings.deck.recentApps.clear')}
          </Button>
        </SettingRow>
      </SettingsSection>

      {showPreviewNote && <p className={styles.previewNote}>{t('panel.settings.deck.recentApps.previewNote')}</p>}

      <DeviceModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('panel.settings.deck.recentApps.addExcludedTitle')}
        medium
      >
        <AppPicker
          selectedIds={excluded}
          onSelect={app => {
            const key = app.processName;
            if (!key || excluded.includes(key)) return;
            setSessionNames(prev => ({ ...prev, [key]: app.name }));
            void setExcluded([...excluded, key]);
          }}
          showRunning
        />
      </DeviceModal>

      <ConfirmModal
        open={confirmClear}
        title={t('panel.settings.deck.recentApps.clearConfirmTitle')}
        message={t('panel.settings.deck.recentApps.clearConfirmBody')}
        destructive={false}
        onConfirm={() => { void clear(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
