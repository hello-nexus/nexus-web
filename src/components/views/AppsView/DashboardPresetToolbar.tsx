import { useCallback, useEffect, useRef, useState } from 'react';
import { PresetToolbar } from '../../common/PresetToolbar/PresetToolbar';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import {
  activateDashboardPreset,
  createDashboardPreset,
  deleteDashboardPreset,
  fetchDashboardPresets,
  renameDashboardPreset,
  seedDashboardPresets,
  type DashboardPresetsResponse,
} from '../../../api/dashboardPresets';
import { DASHBOARD_SAMPLE_PRESET_IDS, dashboardSamplePresetLayout } from '../../../panel/engine/dashboardPresets';
import type { UseDashboardLayoutResult } from '../../../panel/engine/useDashboardLayout';

interface DashboardPresetToolbarProps {
  layoutState: UseDashboardLayoutResult;
}

/** The dashboard's presets: load, save as new, rename, delete. */
export function DashboardPresetToolbar({ layoutState }: DashboardPresetToolbarProps) {
  const { t } = useTranslation();
  const { flush } = layoutState;
  const [state, setState] = useState<DashboardPresetsResponse | null>(null);
  const seeding = useRef(false);

  const apply = useCallback((res: DashboardPresetsResponse | null) => {
    if (res) setState(res);
  }, []);

  const reload = useCallback(() => {
    void fetchDashboardPresets().then(apply);
  }, [apply]);

  useEffect(reload, [reload]);
  useTopicCallback('prefs', true, reload);

  // The starter set is named in the UI language, so the client sends it, again
  // after a switch to an unseeded profile. The current dashboard becomes the
  // active Default: a null layout tracks the live one until the first switch.
  useEffect(() => {
    if (!state || state.seeded || seeding.current) return;
    seeding.current = true;
    void seedDashboardPresets([
      { name: t('dashboard.presets.default'), layout: null },
      ...DASHBOARD_SAMPLE_PRESET_IDS.map(id => ({
        name: t(`dashboard.presets.${id}`),
        layout: dashboardSamplePresetLayout(id),
      })),
    ]).then(apply).catch(() => {}).finally(() => { seeding.current = false; });
  }, [state, t, apply]);

  const presets = state?.presets ?? [];

  return (
    <PresetToolbar
      rail
      showHistory={false}
      presets={presets}
      activeId={state?.activeId ?? null}
      presetCount={presets.length}
      onLoad={id => {
        void flush().then(() => activateDashboardPreset(id)).then(apply);
      }}
      onCreate={async name => {
        await flush();
        const res = await createDashboardPreset(name);
        if (!res) return { error: true };
        setState(res);
        return { error: false };
      }}
      onRename={(id, name) => { void renameDashboardPreset(id, name).then(apply); }}
      onDelete={id => { void deleteDashboardPreset(id).then(apply); }}
    />
  );
}
