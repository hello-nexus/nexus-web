import { useEffect, useState } from 'react';
import { House } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchHaEntities, HA_DEFAULT_DASHBOARD_ID, type HaEntity } from '../../../api/homeAssistant';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { HOME_ASSISTANT_PREVIEW } from './homeAssistantPreviewData';
import { isRoomEntity } from './haDomains';
import { readHomeAssistantConfig } from './homeAssistantConfig';
import styles from './HomeAssistantWidget.module.scss';

const REFRESH_MS = 15_000;

export function HomeAssistantWidget({ widget, onSectionNavigate }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [entities, setEntities] = useState<HaEntity[]>(preview ? HOME_ASSISTANT_PREVIEW : []);
  const [connected, setConnected] = useState(preview);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const load = () => {
      void fetchHaEntities().then(res => {
        if (cancelled || !res) return;
        setConnected(res.connected);
        if (res.entities) setEntities(res.entities);
      });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [preview]);

  const config = readHomeAssistantConfig(widget.config);
  const iconSize = widget.size === '2x2' ? 44 : 56;
  const rooms = entities.filter(isRoomEntity);
  const total = rooms.length;
  const on = rooms.filter(e => e.on).length;
  const label = !connected
    ? t('homeAssistant.notConfigured')
    : config.dashboard
      ? config.dashboardTitle || (config.dashboard === HA_DEFAULT_DASHBOARD_ID ? t('homeAssistant.dashboard.overview') : config.dashboard)
      : total === 0
        ? t('homeAssistant.noEntities')
        : t('homeAssistant.onOfTotal', { on, total });

  const content = (
    <>
      <div className={styles.iconWrap}>
        <House size={iconSize} className={styles.icon} aria-hidden />
        <span
          className={styles.statusDot}
          data-connected={connected ? 'true' : 'false'}
          aria-hidden
        />
      </div>
      <span className={styles.label}>{label}</span>
    </>
  );

  return (
    <div className={styles.widget} data-size={widget.size}>
      {onSectionNavigate ? (
        <button
          type="button"
          className={styles.center}
          data-clickable="true"
          onClick={() => onSectionNavigate('home-assistant', config.dashboard ? { tab: config.dashboard } : undefined)}
        >
          {content}
        </button>
      ) : (
        <div className={styles.center}>{content}</div>
      )}
    </div>
  );
}

export default HomeAssistantWidget;
