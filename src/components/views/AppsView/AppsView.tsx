import { useState } from 'react';
import { LayoutDashboard, ShoppingBag } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useTranslation } from '../../../lib/i18n';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import { DashboardTab } from './DashboardTab';
import { StoreTab } from './StoreTab';

type TabKey = 'dashboard' | 'store';

interface AppsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onSectionNavigate?: DashboardSectionNavigate;
}

export function AppsView({ serviceOnline, connectionState, onSectionNavigate }: AppsViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  const tabs = [
    { key: 'dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard size={14} /> },
    { key: 'store', label: t('apps.tabs.store'), icon: <ShoppingBag size={14} /> },
  ] as const;

  return (
    <section className="appsView">
      <ViewHeader
        title={t('nav.dashboard')}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(k) => setActiveTab(k as TabKey)}
      />
      {activeTab === 'dashboard' && (
        <DashboardTab
          serviceOnline={serviceOnline}
          connectionState={connectionState}
          onSectionNavigate={onSectionNavigate}
        />
      )}
      {activeTab === 'store' && <StoreTab />}
    </section>
  );
}
