import { useMemo, useState } from 'react';
import { AppWindow, Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../../components/common/Button/Button';
import { SettingsSection } from '../../../components/common/SettingsSection/SettingsSection';
import { SettingRow } from '../../../components/common/SettingRow/SettingRow';
import { useAppIcon } from '../common/AppPicker';
import { PresetAppsModal } from '../lighting/page/PresetAppsModal';
import { setDeckPresetApps, type DeckPresetSummary, type PresetApp } from '../../../api/deck';
import { DeckAddAppProfileSheet } from './DeckAddAppProfileSheet';
import type { UseDeckInstanceResult } from './useDeckInstance';
import styles from './DeckAppAwareSection.module.scss';

function ProfileIcon({ appId }: { appId: string }) {
  const url = useAppIcon(appId);
  return url
    ? <img src={url} className={styles.profileIcon} alt="" />
    : <AppWindow size={20} className={styles.profileIconFallback} aria-hidden />;
}

export interface DeckAppAwareSectionProps {
  deck: UseDeckInstanceResult;
  instanceGrid: { cols: number; rows: number };
  /** PUT /deck/presets/{id}/apps and GET /deck/templates are LocalhostOnly -
   *  a paired panel can't bind apps or list Suggested templates, so the
   *  Apps... and + Add app profile controls are hidden there and the
   *  profiles list renders read-only. Defaults to true (every existing
   *  desktop caller). */
  desktopActions?: boolean;
}

/**
 * App Aware mode controls: the profiles list (host-wide presets with app
 * bindings), + Add app profile, and the "Showing: <preset>" status pill
 * driven by the instance's own live active-preset state.
 */
export function DeckAppAwareSection({ deck, instanceGrid, desktopActions = true }: DeckAppAwareSectionProps) {
  const { t } = useTranslation();
  const [appsTarget, setAppsTarget] = useState<{ id: string; name: string; apps: PresetApp[] } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const boundPresets = deck.presets.filter(p => (p.apps?.length ?? 0) > 0);

  const takenApps = useMemo(() => {
    const out: Record<string, string> = {};
    for (const preset of deck.presets) {
      if (preset.id === appsTarget?.id) continue;
      for (const app of preset.apps ?? []) {
        out[app.id] = preset.name;
        if (app.processName) out[app.processName] = preset.name;
      }
    }
    return out;
  }, [deck.presets, appsTarget?.id]);

  const openApps = (preset: DeckPresetSummary) => setAppsTarget({ id: preset.id, name: preset.name, apps: preset.apps ?? [] });

  const statusPill = (
    <span className={styles.pill}>
      {t('panel.settings.deck.appAware.statusPill', { name: deck.preset?.name ?? '' })}
    </span>
  );

  return (
    <div className={styles.root}>
      <SettingsSection title={t('panel.settings.deck.appAware.profilesTitle')} action={statusPill}>
        {boundPresets.length === 0 && <p className={styles.emptyNote}>{t('panel.settings.deck.appAware.noProfiles')}</p>}
        {boundPresets.map(p => (
          <SettingRow
            key={p.id}
            label={p.name}
            icon={<div className={styles.profileIcons}>{(p.apps ?? []).slice(0, 4).map(a => <ProfileIcon key={a.id} appId={a.id} />)}</div>}
            iconLeading
          >
            {desktopActions && (
              <Button tone="ghost" size="sm" onClick={() => openApps(p)}>
                {t('panel.settings.deck.appAware.appsButton')}
              </Button>
            )}
            <Button tone="ghost" size="sm" onClick={() => void deck.activate(p.id)}>
              {t('panel.settings.deck.appAware.edit')}
            </Button>
          </SettingRow>
        ))}
        {desktopActions && (
          <SettingRow>
            <Button tone="ghost" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setAddOpen(true)}>
              {t('panel.settings.deck.appAware.addProfile')}
            </Button>
          </SettingRow>
        )}
      </SettingsSection>

      <p className={styles.fallbackNote}>{t('panel.settings.deck.appAware.fallbackNote')}</p>

      {appsTarget && (
        <PresetAppsModal
          presetName={appsTarget.name}
          apps={appsTarget.apps}
          taken={takenApps}
          onSave={async apps => {
            const result = await setDeckPresetApps(appsTarget.id, apps);
            if (result.kind === 'conflict') {
              return t('lighting.layoutPresets.appsTaken', { app: result.conflict.appName, preset: result.conflict.presetName });
            }
            if (result.kind === 'failed') return t('panel.settings.deck.appAware.appsSaveFailed');
            // The service broadcasts a `preset` deck-topic frame for this
            // write, which useDeckInstance already applies to `presets` -
            // no need to re-fetch the whole hook and flash a loading state.
            setAppsTarget(null);
            return null;
          }}
          onClose={() => setAppsTarget(null)}
        />
      )}

      {addOpen && (
        <DeckAddAppProfileSheet
          currentPresetId={deck.instance?.activePresetId ?? null}
          boundApps={takenApps}
          instanceGrid={instanceGrid}
          onClose={() => setAddOpen(false)}
          onCreated={id => { setAddOpen(false); void deck.activate(id); }}
        />
      )}
    </div>
  );
}
