import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useTranslation } from '../../../lib/i18n';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import { DashboardTab } from './DashboardTab';

interface AppsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onSectionNavigate?: DashboardSectionNavigate;
}

export function AppsView({ serviceOnline, connectionState, onSectionNavigate }: AppsViewProps) {
  const { t } = useTranslation();

  return (
    <section className="appsView">
      <ViewHeader title={t('sidebar.section.apps')} />
      <DashboardTab
        serviceOnline={serviceOnline}
        connectionState={connectionState}
        onSectionNavigate={onSectionNavigate}
      />
    </section>
  );
}
