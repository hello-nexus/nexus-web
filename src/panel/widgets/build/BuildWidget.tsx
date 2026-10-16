import { useTranslation } from '../../../lib/i18n';
import { AppleIcon } from '../../../components/icons/PlatformIcons';
import { isMacAppShell } from '../../../app/windowActions';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { BuildCaseSilhouette } from './BuildCaseSilhouette';
import { buildNoticeKey, selectBuildWidgetView, type BuildWidgetView } from './buildWidgetState';
import { useBuildPreview, useHostIsMac } from './useBuildPreview';
import styles from './BuildWidget.module.scss';

interface BuildWidgetViewProps {
  view: BuildWidgetView;
  size: string;
  previewUrl: string | null;
}

// The tile is not interactive itself: the dashboard cell's click-through opens the Build page.
export function BuildWidgetView({ view, size, previewUrl }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  const noticeKey = buildNoticeKey(view, size);
  const silhouette = view === 'loading' || view === 'no-case' || view === 'no-preview';
  return (
    <div className={styles.widget} data-size={size} data-view={view}>
      <span className={styles.srOnly}>{t('panel.widget.build')}</span>
      {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
      {view === 'preview' && previewUrl && <img className={styles.image} src={previewUrl} alt="" draggable={false} />}
      {silhouette && <BuildCaseSilhouette />}
      {silhouette && size === '4x4' && <span className={styles.notice}>{noticeKey ? t(noticeKey) : ''}</span>}
    </div>
  );
}

export function BuildWidget({ widget }: WidgetProps) {
  const preview = usePanelPreview();
  const isMac = useHostIsMac(!preview);
  const live = useBuildPreview(!preview && isMac === false);
  let view: BuildWidgetView;
  if (preview) view = isMacAppShell() ? 'mac' : 'no-case';
  else view = selectBuildWidgetView({ isMac, loaded: live.loaded, caseId: live.caseId, previewUrl: live.previewUrl });
  return <BuildWidgetView view={view} size={widget.size} previewUrl={live.previewUrl} />;
}
