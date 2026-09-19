import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useToastSafe } from '../../../components/common/Toast/Toast';
import { DeviceModal } from '../../../components/common/DeviceModal/DeviceModal';
import { Tabs, type TabDef } from '../../../components/common/Tabs/Tabs';
import { AppPicker } from '../common/AppPicker';
import { createDeckPreset, deleteDeckPreset, setDeckPresetApps, getDeckTemplates, type DeckTemplate } from '../../../api/deck';
import styles from './DeckAddAppProfileSheet.module.scss';

type AddTab = 'suggested' | 'all';

export interface DeckAddAppProfileSheetProps {
  /** Copied into a new "All apps" profile so it starts from the instance's current look. */
  currentPresetId: string | null;
  /** App id / processName -> owning preset name, across every host-wide preset. */
  boundApps: Record<string, string>;
  instanceGrid: { cols: number; rows: number };
  onClose: () => void;
  onCreated: (presetId: string) => void;
}

/**
 * "+ Add app profile" sheet: Suggested (bundled per-app templates for an
 * installed app not already bound) and All apps (any installed/running app,
 * copying the instance's current preset as a starting point). Either path
 * creates a preset, binds the one app to it, and hands the new id back to
 * the caller to activate.
 */
export function DeckAddAppProfileSheet({ currentPresetId, boundApps, instanceGrid, onClose, onCreated }: DeckAddAppProfileSheetProps) {
  const { t } = useTranslation();
  const toast = useToastSafe();
  const [tab, setTab] = useState<AddTab>('suggested');
  const [templates, setTemplates] = useState<DeckTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getDeckTemplates().then(list => { if (!cancelled) setTemplates(list); });
    return () => { cancelled = true; };
  }, []);

  const isBound = (appId?: string, processName?: string) =>
    (!!appId && appId in boundApps) || (!!processName && processName in boundApps);

  const suggested = (templates ?? []).filter(tpl => tpl.installedAppId && !isBound(tpl.installedAppId, tpl.processName));

  const fail = () => {
    setBusy(false);
    toast.push({ title: t('panel.settings.deck.appAware.addProfileFailed') });
  };

  const finishCreate = async (presetId: string, app: { id: string; name: string; processName?: string }) => {
    const bound = await setDeckPresetApps(presetId, [{ id: app.id, name: app.name, processName: app.processName }]);
    setBusy(false);
    if (bound.kind === 'ok') {
      onCreated(presetId);
      return;
    }
    // The bind failed: this profile has no app trigger, so leaving it
    // activated would strand an orphan preset the user never asked for.
    void deleteDeckPreset(presetId);
    if (bound.kind === 'conflict') {
      toast.push({ title: t('lighting.layoutPresets.appsTaken', { app: bound.conflict.appName, preset: bound.conflict.presetName }) });
    } else {
      toast.push({ title: t('panel.settings.deck.appAware.appsSaveFailed') });
    }
  };

  const pickTemplate = async (tpl: DeckTemplate) => {
    if (busy || !tpl.installedAppId) return;
    setBusy(true);
    const created = await createDeckPreset({ name: tpl.name, cols: tpl.cols, rows: tpl.rows, templateId: tpl.id });
    if (!created) { fail(); return; }
    await finishCreate(created.id, { id: tpl.installedAppId, name: tpl.installedAppName ?? tpl.name, processName: tpl.processName });
  };

  const pickApp = async (app: { id: string; name: string; processName?: string }) => {
    if (busy) return;
    setBusy(true);
    const created = await createDeckPreset({
      name: app.name, cols: instanceGrid.cols, rows: instanceGrid.rows,
      copyOfPresetId: currentPresetId ?? undefined,
    });
    if (!created) { fail(); return; }
    await finishCreate(created.id, app);
  };

  const tabs: TabDef[] = [
    { key: 'suggested', label: t('panel.settings.deck.appAware.suggestedTab') },
    { key: 'all', label: t('panel.settings.deck.appAware.allAppsTab') },
  ];

  return (
    <DeviceModal open onClose={onClose} title={t('panel.settings.deck.appAware.addProfile')} medium>
      <div className={styles.body}>
        <Tabs tabs={tabs} activeKey={tab} onChange={k => setTab(k as AddTab)} />

        {tab === 'suggested' ? (
          <div className={styles.templateList} data-panel-scrollable="true">
            {templates === null && <p className={styles.empty}>{t('common.loading')}</p>}
            {templates !== null && suggested.length === 0 && (
              <p className={styles.empty}>{t('panel.settings.deck.appAware.noSuggested')}</p>
            )}
            {suggested.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                className={styles.templateRow}
                disabled={busy}
                onClick={() => void pickTemplate(tpl)}
              >
                <div className={styles.templateInfo}>
                  <span className={styles.templateName}>{tpl.name}</span>
                  <span className={styles.templateDescription}>{tpl.description}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <AppPicker
            selectedIds={[]}
            unavailableIds={Object.fromEntries(Object.entries(boundApps).map(
              ([key, owner]) => [key, t('lighting.layoutPresets.appsTakenShort', { preset: owner })],
            ))}
            onSelect={app => void pickApp(app)}
            showRunning
          />
        )}
      </div>
    </DeviceModal>
  );
}
