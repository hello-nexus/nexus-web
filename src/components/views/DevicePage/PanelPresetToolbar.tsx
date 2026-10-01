import { useCallback, useEffect, useMemo, useState } from 'react';
import { PresetToolbar } from '../../common/PresetToolbar/PresetToolbar';
import { PresetAppsModal } from '../../../panel/widgets/lighting/page/PresetAppsModal';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import {
  activatePanelPreset,
  createPanelPreset,
  deletePanelPreset,
  fetchPanelPresets,
  renamePanelPreset,
  setPanelPresetApps,
  type PanelPreset,
  type PanelPresetsResponse,
} from '../../../api/panel';

interface PanelPresetToolbarProps {
  deviceId: string;
}

/** One panel's presets: load, save as new, rename, delete, and the apps
 *  whose focus loads a preset. */
export function PanelPresetToolbar({ deviceId }: PanelPresetToolbarProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PanelPresetsResponse>({ presets: [], activeId: null });
  const [appsTarget, setAppsTarget] = useState<PanelPreset | null>(null);

  const apply = useCallback((res: PanelPresetsResponse | null) => {
    if (res) setState(res);
  }, []);

  const reload = useCallback(() => {
    void fetchPanelPresets(deviceId).then(apply);
  }, [deviceId, apply]);

  useEffect(reload, [reload]);

  // The service loads a preset on app focus and broadcasts the device.
  useTopicCallback('panel/device', true, raw => {
    if ((raw as { deviceId?: string } | null)?.deviceId === deviceId) reload();
  });

  const takenApps = useMemo(() => {
    const out: Record<string, string> = {};
    for (const preset of state.presets) {
      if (preset.id === appsTarget?.id) continue;
      for (const app of preset.apps) {
        out[app.id] = preset.name;
        if (app.processName) out[app.processName] = preset.name;
      }
    }
    return out;
  }, [state.presets, appsTarget?.id]);

  return (
    <>
      <PresetToolbar
        rail
        showHistory={false}
        presets={state.presets.map(p => ({ id: p.id, name: p.name, hasApps: p.apps.length > 0 }))}
        activeId={state.activeId}
        presetCount={state.presets.length}
        onLoad={id => { void activatePanelPreset(deviceId, id).then(apply); }}
        onCreate={async name => {
          const res = await createPanelPreset(deviceId, name);
          if (!res) return { error: true };
          setState(res);
          return { error: false };
        }}
        onRename={(id, name) => { void renamePanelPreset(deviceId, id, name).then(apply); }}
        onDelete={id => { void deletePanelPreset(deviceId, id).then(apply); }}
        onManageApps={() => {
          const preset = state.presets.find(p => p.id === state.activeId);
          if (preset) setAppsTarget(preset);
        }}
      />
      {appsTarget && (
        <PresetAppsModal
          presetName={appsTarget.name}
          apps={appsTarget.apps}
          taken={takenApps}
          onSave={async apps => {
            const result = await setPanelPresetApps(deviceId, appsTarget.id, apps);
            if (result.kind === 'conflict') {
              return t('lighting.layoutPresets.appsTaken', {
                app: result.conflict.appName,
                preset: result.conflict.presetName,
              });
            }
            if (result.kind === 'failed') return t('lighting.layoutPresets.appsSaveFailed');
            setAppsTarget(null);
            reload();
            return null;
          }}
          onClose={() => setAppsTarget(null)}
        />
      )}
    </>
  );
}
