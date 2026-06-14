import { useEffect, useState } from 'react';
import { LampCeiling } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchSmartLights, type SmartLight } from '../../../api/smartLights';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { SMART_LIGHTS_PREVIEW } from './smartLightsPreviewData';
import styles from './SmartLightsWidget.module.scss';

const REFRESH_MS = 15_000;

/**
 * Glanceable smart-lights tile: a large smart-light icon over the online count.
 * On the desktop dashboard a tap opens the management Page (onSectionNavigate);
 * elsewhere the tile is summary-only and the panel handles fullscreen entry.
 */
export function SmartLightsWidget({ widget, onSectionNavigate }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [devices, setDevices] = useState<SmartLight[]>(preview ? SMART_LIGHTS_PREVIEW : []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const load = () => {
      void fetchSmartLights().then(res => {
        if (cancelled || !res?.devices) return;
        setDevices(res.devices);
      });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [preview]);

  const total = devices.length;
  const online = devices.filter(d => d.online).length;
  const iconSize = widget.size === '2x2' ? 44 : 56;
  const label = total === 0
    ? t('smartLights.noLightsYet')
    : t('smartLights.onlineOfTotal', { online, total });

  const content = (
    <>
      <LampCeiling size={iconSize} className={styles.icon} aria-hidden />
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
          onClick={() => onSectionNavigate('smart-lights')}
        >
          {content}
        </button>
      ) : (
        <div className={styles.center}>{content}</div>
      )}
    </div>
  );
}

export default SmartLightsWidget;
