import { useTranslation } from '../../../lib/i18n';
import { AppleIcon } from '../../../components/icons/PlatformIcons';
import { requestOpenBuild } from '../../../components/views/BuildPage/buildNav';
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
  onOpen: () => void;
}

export function BuildWidgetView({ view, size, previewUrl, onOpen }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  const noticeKey = buildNoticeKey(view, size);
  return (
    <button
      type="button"
      className={styles.widget}
      data-size={size}
      data-view={view}
      aria-label={t('panel.widget.build')}
      onClick={onOpen}
    >
      {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
      {view === 'preview' && previewUrl && <img className={styles.image} src={previewUrl} alt="" draggable={false} />}
      {(view === 'loading' || view === 'no-case' || view === 'no-preview') && (
        <>
          <BuildCaseSilhouette />
          {noticeKey && <span className={styles.notice}>{t(noticeKey)}</span>}
        </>
      )}
    </button>
  );
}

export function BuildWidget({ widget }: WidgetProps) {
  const preview = usePanelPreview();
  const isMac = useHostIsMac(!preview);
  const live = useBuildPreview(!preview && isMac === false);
  const view = preview
    ? 'no-case'
    : selectBuildWidgetView({ isMac, loaded: live.loaded, caseId: live.caseId, previewUrl: live.previewUrl });
  return <BuildWidgetView view={view} size={widget.size} previewUrl={live.previewUrl} onOpen={() => requestOpenBuild('/builder')} />;
}
