import { useCallback, useRef, useState } from 'react';
import { Monitor, Plus, Store } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { PanelEmbeddedContent } from '../../../panel/PanelApp';
import { useDashboardLayout } from '../../../panel/engine/useDashboardLayout';
import { useSearchSignal } from '../../../search/signals';
import { ServiceRequired } from '../ServiceRequired';
import { DashboardPresetToolbar } from './DashboardPresetToolbar';
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
  const { settings } = useUiSettings();
  const layoutState = useDashboardLayout();
  const [addWidgetSignal, setAddWidgetSignal] = useState(0);
  const panelHostRef = useRef<HTMLDivElement>(null);

  // Search entries open these from anywhere: the palette navigates to the
  // dashboard first, then the pending signal lands here on mount.
  useSearchSignal('add-widget', useCallback(() => setAddWidgetSignal((value) => value + 1), []));
  useSearchSignal('desktop-widgets', useCallback(() => onSectionNavigate?.('devices', { tab: 'displays' }), [onSectionNavigate]));

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
            onClick={() => onSectionNavigate?.('devices', { tab: 'displays' })}
          >
            <Monitor size={14} aria-hidden />
            <span>{t('dashboard.displayPanels')}</span>
          </button>
          <button
            type="button"
            className="chip-action"
            onClick={() => onSectionNavigate?.('store')}
          >
            <Store size={14} aria-hidden />
            <span>{t('apps.tabs.store')}</span>
          </button>
          <div className={styles.presetRail}>
            <DashboardPresetToolbar layoutState={layoutState} />
          </div>
        </div>
        <div ref={panelHostRef} className={styles.panelHost}>
          <PanelEmbeddedContent layoutState={layoutState} openCatalogSignal={addWidgetSignal} appAccentColor={settings.accentColor} onSectionNavigate={onSectionNavigate} />
        </div>
      </div>
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
