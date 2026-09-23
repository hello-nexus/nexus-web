import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, CalendarRange, Calendar, AppWindow, LayoutDashboard } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { NexusControlCard } from '../../../components/common/NexusControlCard/NexusControlCard';
import { getTrackingStatus, setTrackingEnabled } from '../../../hooks/useScreenTimeBrowse';
import { ScreenTimeIcon } from './screentimeIcon';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useTranslation } from '../../../lib/i18n';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { GenericSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import {
  SCREEN_TIME_MODES,
  ScreenTimeBrowse,
  type ScreenTimeMode,
} from '../../../components/views/ScreenTimeBrowse/ScreenTimeBrowse';
import { ScreenTimeDataControl } from '../../../components/views/ScreenTimeBrowse/ScreenTimeDataControl';
import styles from './ScreentimePage.module.scss';

const SCREEN_TIME_TAB_ICONS: Record<ScreenTimeMode, ReactNode> = {
  day: <CalendarDays size={14} />,
  week: <CalendarRange size={14} />,
  month: <Calendar size={14} />,
  app: <AppWindow size={14} />,
};

interface ScreentimePageProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function ScreentimePage({ serviceOnline, connectionState, tab: urlTab, onTabChange }: ScreentimePageProps) {
  const { t } = useTranslation();
  const tab: ScreenTimeMode = urlTab && SCREEN_TIME_MODES.includes(urlTab as ScreenTimeMode)
    ? urlTab as ScreenTimeMode : 'day';

  const [dataControlOpen, setDataControlOpen] = useState(false);
  const [browseRefresh, setBrowseRefresh] = useState(0);
  // null until the service answers; only an explicit false swaps in the intro.
  const [tracking, setTracking] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    getTrackingStatus().then(s => { if (!cancelled && s) setTracking(s.enabled); });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  const handleEnable = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      const resp = await setTrackingEnabled(true);
      if (resp) setTracking(resp.enabled);
    } finally {
      setEnabling(false);
    }
  };

  const tabs = SCREEN_TIME_MODES.map(m => ({ key: m, label: t(`screentime.tab.${m}`), icon: SCREEN_TIME_TAB_ICONS[m] }));

  if (!serviceOnline) {
    return (
      <div className={styles.screentime}>
        <ViewHeader title={t('screentime.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.screentime}>
      <ViewHeader
        title={t('screentime.title')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={onTabChange}
        tabActions={(
          <Button size="sm" tone="neutral" onClick={() => setDataControlOpen(true)}>
            {t('screentime.manageData')}
          </Button>
        )}
      />
      <div className={`${styles.tabContent} pageBody`}>
        {tracking === false ? (
          <EmptyState
            hero
            icon={<ScreenTimeIcon />}
            title={t('screentime.intro.title')}
            hint={t('screentime.intro.body')}
            points={[
              { icon: <AppWindow />, text: t('screentime.intro.pointApps') },
              { icon: <CalendarRange />, text: t('screentime.intro.pointViews') },
              { icon: <LayoutDashboard />, text: t('screentime.intro.pointWidget') },
            ]}
            action={(
              <NexusControlCard
                checked={enabling}
                disabled={enabling}
                icon={<ScreenTimeIcon size={13} aria-hidden />}
                label={t('settings.screentime.tracking')}
                onChange={() => { void handleEnable(); }}
              />
            )}
          />
        ) : (
          <ScreenTimeBrowse key={browseRefresh} mode={tab} onModeChange={onTabChange} />
        )}
      </div>
      <ScreenTimeDataControl
        open={dataControlOpen}
        onClose={() => setDataControlOpen(false)}
        onChanged={() => setBrowseRefresh(v => v + 1)}
      />
    </div>
  );
}
