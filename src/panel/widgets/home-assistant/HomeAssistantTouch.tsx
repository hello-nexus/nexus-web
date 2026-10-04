import { useState, type ReactNode } from 'react';
import { Tabs } from '../../../components/common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useHomeAssistant, HomeAssistantSetupForm, HomeAssistantEntityList, type HomeAssistantController } from './HomeAssistantPage';
import { HaDashboardMessage, HaDashboardViewBody, useHaDashboard, viewTitle } from './HomeAssistantDashboard';
import { pickView } from './lovelaceLayout';
import { readHomeAssistantConfig } from './homeAssistantConfig';
import type { WidgetProps } from '../types';
import styles from './HomeAssistantPage.module.scss';

function DashboardCell({ ctrl, dashboard, pinnedView }: { ctrl: HomeAssistantController; dashboard: string; pinnedView: string }) {
  const { t } = useTranslation();
  const state = useHaDashboard(dashboard, ctrl.connected, ctrl.refetch);
  const [viewKey, setViewKey] = useState('');
  const view = state.status === 'ready' ? pickView(state.views, pinnedView || viewKey) : null;
  if (!view) return <HaDashboardMessage status={state.status} empty />;
  const showTabs = !pinnedView && state.views.length > 1;
  return (
    <div className={styles.dashboardImmersive}>
      {showTabs && (
        <Tabs
          tabs={state.views.map((v, i) => ({ key: v.key, label: viewTitle(v, i, t) }))}
          activeKey={view.key}
          onChange={setViewKey}
          ariaLabel={t('homeAssistant.title')}
        />
      )}
      <HaDashboardViewBody ctrl={ctrl} view={view} immersive />
    </div>
  );
}

export function HomeAssistantTouch({ widget, immersiveGrid }: WidgetProps) {
  const config = readHomeAssistantConfig(widget.config);
  const ctrl = useHomeAssistant(config.dashboard !== '');

  const cells: ReactNode[] = ctrl.showSetup
    ? [<HomeAssistantSetupForm ctrl={ctrl} immersive />]
    : config.dashboard
      ? [<DashboardCell ctrl={ctrl} dashboard={config.dashboard} pinnedView={config.view} />]
      : [<HomeAssistantEntityList ctrl={ctrl} immersive />];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

export default HomeAssistantTouch;
