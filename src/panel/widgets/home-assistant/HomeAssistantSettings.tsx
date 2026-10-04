import { useEffect, useState } from 'react';
import type { WidgetSettingsProps } from '../types';
import { SettingsSection, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { useTranslation } from '../../../lib/i18n';
import { fetchHaDashboard } from '../../../api/homeAssistant';
import { dashboardTitle, useHaDashboards, viewTitle } from './HomeAssistantDashboard';
import { parseLovelaceConfig, type HaLayoutView } from './lovelaceLayout';
import { readHomeAssistantConfig } from './homeAssistantConfig';

export function HomeAssistantSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const config = readHomeAssistantConfig(widget.config);
  const dashboards = useHaDashboards(true);
  const [views, setViews] = useState<HaLayoutView[]>([]);

  useEffect(() => {
    if (!config.dashboard) { setViews([]); return; }
    let cancelled = false;
    void fetchHaDashboard(config.dashboard).then(res => {
      if (cancelled) return;
      const layout = res && !res.error ? parseLovelaceConfig(res.config) : null;
      setViews(layout?.kind === 'views' ? layout.views : []);
    });
    return () => { cancelled = true; };
  }, [config.dashboard]);

  const sourceOptions = [
    { value: '', label: t('homeAssistant.source.rooms') },
    ...(dashboards ?? []).map(d => ({ value: d.id, label: dashboardTitle(d, t) })),
  ];
  // A saved dashboard that is gone (or HA offline) still has to render as a valid option.
  if (config.dashboard && !sourceOptions.some(o => o.value === config.dashboard)) {
    sourceOptions.push({ value: config.dashboard, label: config.dashboardTitle || config.dashboard });
  }

  const viewOptions = [
    { value: '', label: t('panel.widget.home-assistant.settings.allViews') },
    ...views.map((v, i) => ({ value: v.key, label: viewTitle(v, i, t) })),
  ];
  if (config.view && !viewOptions.some(o => o.value === config.view)) {
    viewOptions.push({ value: config.view, label: config.view });
  }

  return (
    <SettingsSection title={t('homeAssistant.title')}>
      <SettingsSelect
        label={t('homeAssistant.source')}
        value={config.dashboard}
        options={sourceOptions}
        onChange={v => {
          const picked = dashboards?.find(d => d.id === v);
          onUpdate({ dashboard: v, dashboardTitle: picked?.title ?? '', view: '' });
        }}
      />
      {config.dashboard && (views.length > 1 || config.view) && (
        <SettingsSelect
          label={t('panel.widget.home-assistant.settings.view')}
          value={config.view}
          options={viewOptions}
          onChange={v => onUpdate({ view: v })}
        />
      )}
    </SettingsSection>
  );
}

export default HomeAssistantSettings;
