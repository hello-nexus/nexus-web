import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, Plus } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { PanelEmbeddedContent } from '../../../panel/PanelApp';
import { DESKTOP_GRID_COLUMNS } from '../../../panel/engine/panelGrid';
import { autoArrangeLayout } from '../../../panel/engine/paginate';
import { useDashboardLayout } from '../../../panel/engine/useDashboardLayout';
import { useSearchSignal } from '../../../search/signals';
import { ServiceRequired } from '../ServiceRequired';
import { Toggle } from '../../common/Toggle/Toggle';
import { OverlayWidgetsModal } from './OverlayWidgetsModal';
import { DashboardBanner } from './DashboardBanner';
import { listOverlayWidgets } from '../../../api/overlay';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import styles from './AppsView.module.scss';

interface DashboardTabProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onSectionNavigate?: DashboardSectionNavigate;
}

export function DashboardTab({ serviceOnline, connectionState, onSectionNavigate }: DashboardTabProps) {
  if (!serviceOnline) {
    return <DashboardOffline connectionState={connectionState} />;
  }
  return <DashboardOnline onSectionNavigate={onSectionNavigate} />;
}

function DashboardOnline({ onSectionNavigate }: { onSectionNavigate?: DashboardSectionNavigate }) {
  const { t } = useTranslation();
  const { settings, update: updateUiSettings, hydrated: uiHydrated } = useUiSettings();
  const layoutState = useDashboardLayout();
  const [addWidgetSignal, setAddWidgetSignal] = useState(0);
  const [desktopModalOpen, setDesktopModalOpen] = useState(false);
  const [desktopWidgetCount, setDesktopWidgetCount] = useState(0);
  const panelHostRef = useRef<HTMLDivElement>(null);

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

  // Search entries open these from anywhere: the palette navigates to the
  // dashboard first, then the pending signal lands here on mount.
  useSearchSignal('add-widget', useCallback(() => setAddWidgetSignal((value) => value + 1), []));
  useSearchSignal('desktop-widgets', useCallback(() => setDesktopModalOpen(true), []));

  const autoArrange = settings.dashboardAutoArrange;
  const toggleAutoArrange = () => {
    // Off keeps the arranged order, re-packed to the manual grid's width.
    if (autoArrange) layoutState.setLayout(autoArrangeLayout(layoutState.layout, DESKTOP_GRID_COLUMNS));
    updateUiSettings({ dashboardAutoArrange: !autoArrange });
  };

  return (
    <div className={styles.dashboard}>
      <div className={`${styles.dashboardBody} pageBodyFill`}>
        <div className={styles.headerActions}>
          <button
            type="button"
            className="chip-action"
            onClick={() => setAddWidgetSignal(value => value + 1)}
          >
            <Plus size={14} aria-hidden />
            <span>{t('devices.y70.editor.addWidget')}</span>
          </button>
          <button
            type="button"
            className="chip-action"
            onClick={() => setDesktopModalOpen(true)}
          >
            <Monitor size={14} aria-hidden />
            <span>{t('dashboard.desktopWidgets')}</span>
            {desktopWidgetCount > 0 && (
              <span className={styles.widgetCountBadge}>{desktopWidgetCount}</span>
            )}
          </button>
          <label className={styles.autoArrange}>
            <span>{t('dashboard.autoArrange')}</span>
            <Toggle
              checked={autoArrange}
              ariaLabel={t('dashboard.autoArrange')}
              disabled={!uiHydrated || !layoutState.loaded}
              onChange={toggleAutoArrange}
            />
          </label>
        </div>
        <DashboardBanner gridHostRef={panelHostRef} onOpen={() => onSectionNavigate?.('store')} />
        <div ref={panelHostRef} className={styles.panelHost}>
          <PanelEmbeddedContent layoutState={layoutState} openCatalogSignal={addWidgetSignal} appAccentColor={settings.accentColor} onSectionNavigate={onSectionNavigate} />
        </div>
      </div>
      <OverlayWidgetsModal open={desktopModalOpen} onClose={() => setDesktopModalOpen(false)} />
    </div>
  );
}

function DashboardOffline({ connectionState }: { connectionState?: ConnectionState }) {
  return (
    <div className={styles.dashboard}>
      <div className="pageBodyFill">
        <ServiceRequired page="nexus" state={connectionState} />
      </div>
    </div>
  );
}
