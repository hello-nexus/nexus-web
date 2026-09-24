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
  id: string;
  name: string;
  processName?: string;
}

/** processKey (lowercased process name) -> the installed shortcut, resolved
 *  once from the same list AppPicker reads. Gives an excluded app its real
 *  name after a reopen (the recents ring itself never carries an excluded
 *  app's name once it drops out) and its shortcut id, so the picker can mark
 *  it selected - AppPicker keys selection off its entries' ids, not process
 *  keys. */
function useShortcutsByProcess(): Record<string, ShortcutSummary> {
  const [byProcess, setByProcess] = useState<Record<string, ShortcutSummary>>({});
  useEffect(() => {
    let cancelled = false;
    void fetchService<{ shortcuts: ShortcutSummary[] }>('/shortcuts').then(res => {
      if (cancelled || !res) return;
      const map: Record<string, ShortcutSummary> = {};
      for (const s of res.shortcuts) {
        const key = s.processName?.toLowerCase();
        if (key && !map[key]) map[key] = s;
      }
      setByProcess(map);
    });
    return () => { cancelled = true; };
  }, []);
  return byProcess;
}

// Stable reference for ChipGroup's activeKeys: the excluded chips are a plain
// removable list, not a toggle - none of them render "active".
const NO_ACTIVE_CHIPS = new Set<string>();

export interface DeckRecentAppsSectionProps {
  /** True when the host has no grid of its own to show for this mode (the
   *  widget settings sheet); renders a read-only preview note in its place.
   *  StreamDeckDevicePage shows its own live tiles instead, so it passes false. */
  showPreviewNote: boolean;
  /** PUT /deck/recent-apps/excluded and DELETE /deck/recent-apps are
   *  LocalhostOnly - a paired panel can read the excluded list but not
   *  change it, so Add/Clear are hidden there and the excluded chips render
   *  read-only. Defaults to true (every existing desktop caller). */
  desktopActions?: boolean;
}

/**
 * Recent Apps mode controls: excluded-apps chips (add via AppPicker, remove
 * by clicking a chip) and a clear-recent action. Every key in this mode is
 * the live ring - there is nothing else to configure here.
 */
export function DeckRecentAppsSection({ showPreviewNote, desktopActions = true }: DeckRecentAppsSectionProps) {
  const { t } = useTranslation();
  const { apps, excluded, setExcluded, clear } = useRecentApps(true);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const shortcutsByProcess = useShortcutsByProcess();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const nameFor = (key: string): string =>
    sessionNames[key] ?? apps.find(a => a.processKey === key)?.name ?? shortcutsByProcess[key]?.name ?? key;
  // AppPicker's selectedIds compares against its entries' ids (a shortcut id
  // for an installed app), not process keys - map the excluded list forward
  // so an already-excluded app shows selected instead of silently no-oping
  // when re-picked.
  const pickerSelectedIds = excluded.map(key => shortcutsByProcess[key]?.id ?? key);

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
                activeKeys={NO_ACTIVE_CHIPS}
                options={excluded.map(key => ({
                  key,
                  disabled: !desktopActions,
                  ariaLabel: t('panel.settings.deck.recentApps.excludedRemove', { name: nameFor(key) }),
                  label: (
                    <span className={styles.chipLabel}>
                      {nameFor(key)}
                      {desktopActions && <X size={12} aria-hidden />}
                    </span>
                  ),
                }))}
                onToggleKey={key => void setExcluded(excluded.filter(k => k !== key))}
              />
            )}
            {desktopActions && (
              <Button
                tone="ghost"
                size="sm"
                icon={<Plus size={14} aria-hidden />}
                onClick={() => setPickerOpen(true)}
              >
                {t('panel.settings.deck.recentApps.addExcluded')}
              </Button>
            )}
          </div>
        </SettingRow>

        {desktopActions && (
          <SettingRow>
            <Button tone="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              {t('panel.settings.deck.recentApps.clear')}
            </Button>
          </SettingRow>
        )}
      </SettingsSection>

      {showPreviewNote && <p className={styles.previewNote}>{t('panel.settings.deck.recentApps.previewNote')}</p>}

      <DeviceModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('panel.settings.deck.recentApps.addExcludedTitle')}
        medium
      >
        <AppPicker
          selectedIds={pickerSelectedIds}
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
