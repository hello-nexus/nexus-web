import { useCallback, useEffect, useState } from 'react';
import { Monitor, Plus } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { PanelEmbeddedContent } from '../../../panel/PanelApp';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { OverlayWidgetsModal } from './OverlayWidgetsModal';
import { listOverlayWidgets } from '../../../api/overlay';
import type { DashboardSectionNavigate } from '../../../panel/panelLayoutHelpers';
import styles from './DashboardView.module.scss';

interface DashboardViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onSectionNavigate?: DashboardSectionNavigate;
}

export function DashboardView({ serviceOnline, connectionState, onSectionNavigate }: DashboardViewProps) {
  if (!serviceOnline) {
    return <DashboardOffline connectionState={connectionState} />;
  }
  return <DashboardOnline onSectionNavigate={onSectionNavigate} />;
}

function DashboardOnline({ onSectionNavigate }: { onSectionNavigate?: DashboardSectionNavigate }) {
  const { t } = useTranslation();
  const { settings } = useUiSettings();
  const [addWidgetSignal, setAddWidgetSignal] = useState(0);
  const [desktopModalOpen, setDesktopModalOpen] = useState(false);
  const [desktopWidgetCount, setDesktopWidgetCount] = useState(0);

  const refreshDesktopWidgetCount = useCallback(async () => {
    const list = await listOverlayWidgets();
    setDesktopWidgetCount(list.length);
  }, []);

  useEffect(() => {
    // Initial fetch + refresh when the (stable) refresher changes. The
    // refresher itself sets state; the lint rule sees that through the
    // closure.
     
    void refreshDesktopWidgetCount();
  }, [refreshDesktopWidgetCount]);

  useTopicCallback('prefs', true, () => { void refreshDesktopWidgetCount(); });

  return (
    <div className={styles.dashboard}>
      <ViewHeader
        title={t('nav.dashboard')}
      />
      <div className={`${styles.dashboardBody} pageBodyFill`}>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.addWidgetButton}
            onClick={() => setAddWidgetSignal(value => value + 1)}
          >
            <Plus size={14} aria-hidden="true" />
            <span>{t('devices.y70.editor.addWidget')}</span>
          </button>
          <button
            type="button"
            className={styles.addWidgetButton}
            onClick={() => setDesktopModalOpen(true)}
          >
            <Monitor size={14} aria-hidden="true" />
            <span>Desktop Widgets</span>
            {desktopWidgetCount > 0 && (
              <span className={styles.widgetCountBadge}>{desktopWidgetCount}</span>
            )}
          </button>
        </div>
        <div className={styles.panelHost}>
          <PanelEmbeddedContent openCatalogSignal={addWidgetSignal} appAccentColor={settings.accentColor} onSectionNavigate={onSectionNavigate} />
        </div>
      </div>
      <OverlayWidgetsModal open={desktopModalOpen} onClose={() => setDesktopModalOpen(false)} />
    </div>
  );
}

function DashboardOffline({ connectionState }: { connectionState?: ConnectionState }) {
  const { t } = useTranslation();
  return (
    <div className={styles.dashboard}>
      <ViewHeader title={t('nav.dashboard')} />
      <div className="pageBodyFill">
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    </div>
  );
}
