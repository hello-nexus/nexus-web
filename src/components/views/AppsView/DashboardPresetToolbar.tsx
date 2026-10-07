import { useCallback, useEffect, useState } from 'react';
import { PresetToolbar } from '../../common/PresetToolbar/PresetToolbar';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  activateDashboardPreset,
  createDashboardPreset,
  deleteDashboardPreset,
  fetchDashboardPresets,
  renameDashboardPreset,
  type DashboardPresetsResponse,
} from '../../../api/dashboardPresets';
import type { UseDashboardLayoutResult } from '../../../panel/engine/useDashboardLayout';

interface DashboardPresetToolbarProps {
  layoutState: UseDashboardLayoutResult;
}

export function DashboardPresetToolbar({ layoutState }: DashboardPresetToolbarProps) {
  const { flush, replaceFromService } = layoutState;
  const [state, setState] = useState<DashboardPresetsResponse | null>(null);

  const apply = useCallback((res: DashboardPresetsResponse | null) => {
    if (res) setState(res);
  }, []);

  const reload = useCallback(() => {
    void fetchDashboardPresets().then(apply);
  }, [apply]);

  useEffect(reload, [reload]);
  useTopicCallback('prefs', true, reload);

  const presets = state?.presets ?? [];

  return (
    <PresetToolbar
      rail
      showHistory={false}
      presets={presets}
      activeId={state?.activeId ?? null}
      presetCount={presets.length}
      onLoad={id => { void replaceFromService(() => activateDashboardPreset(id)).then(apply); }}
      onCreate={async name => {
        await flush();
        const res = await createDashboardPreset(name);
        if (!res) return { error: true };
        setState(res);
        return { error: false };
      }}
      onRename={(id, name) => { void renameDashboardPreset(id, name).then(apply); }}
      onDelete={id => { void replaceFromService(() => deleteDashboardPreset(id)).then(apply); }}
    />
  );
}
