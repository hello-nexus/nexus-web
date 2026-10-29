import { Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { AppleIcon } from '../../../components/icons/PlatformIcons';
import { Button } from '../../../components/common/Button/Button';
import { isMacAppShell } from '../../../app/windowActions';
import { DEV_TOOLS } from '../../../lib/devTools';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { BuildCaselessScene } from './BuildCaselessScene';
import { BuildCaseSilhouette } from './BuildCaseSilhouette';
import { hasCaselessParts, partsStrip, type CaselessParts } from './caselessParts';
import { CASELESS_FIXTURES, type CaselessFixture, type CaselessFixtureId } from './mockup/caselessFixtures';
import { buildNoticeKey, selectBuildWidgetView, type BuildWidgetView } from './buildWidgetState';
import { useBuildPreview, useHostIsMac } from './useBuildPreview';
import type { SceneLayout } from '../../../lib/scene/pcScene';
import styles from './BuildWidget.module.scss';

interface BuildWidgetViewProps {
  view: BuildWidgetView;
  size: string;
  previewUrl: string | null;
  /** The detected parts and a case-less layout of them; the large no-case tile draws them in place of the silhouette. */
  caseless?: { parts: CaselessParts; layout: SceneLayout } | null;
}

// The tile is not interactive itself: the dashboard cell's click-through opens the Build page.
export function BuildWidgetView({ view, size, previewUrl, caseless = null }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  const noticeKey = buildNoticeKey(view, size);
  const silhouette = view === 'loading' || view === 'no-case' || view === 'no-preview';
  const showParts = view === 'no-case' && size === '4x4' && caseless !== null && hasCaselessParts(caseless.parts);
  const [line1, line2] = caseless ? partsStrip(caseless.parts, t('panel.widget.build.airCooler')) : ['', ''];
  return (
    <div className={styles.widget} data-size={size} data-view={view} data-caseless={showParts ? 'true' : undefined}>
      <span className={styles.srOnly}>{t('panel.widget.build')}</span>
      {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
      {view === 'preview' && previewUrl && <img className={styles.image} src={previewUrl} alt="" draggable={false} />}
      {showParts && caseless && (
        <>
          <BuildCaselessScene layout={caseless.layout} parts={caseless.parts} label={t('panel.widget.build.partsLabel')} />
          <Button className={styles.pickCase} size="sm" tone="accent" pill icon={<Plus size={14} aria-hidden="true" />} tabIndex={-1}>
            {t('panel.widget.build.pickCase')}
          </Button>
          <div className={styles.strip}>
            <span className={styles.stripLine}>{line1 || ' '}</span>
            <span className={styles.stripLine}>{line2 || ' '}</span>
          </div>
        </>
      )}
      {silhouette && !showParts && <BuildCaseSilhouette />}
      {silhouette && !showParts && size === '4x4' && <span className={styles.notice}>{noticeKey ? t(noticeKey) : ''}</span>}
    </div>
  );
}

// Until the service reports the detected parts to the dashboard, the add-widget preview and the mockup read a fixture set named by the widget's config.
function previewCaseless(widget: WidgetProps['widget']): CaselessFixture {
  const id = widget.config?.previewSet;
  return typeof id === 'string' && id in CASELESS_FIXTURES ? CASELESS_FIXTURES[id as CaselessFixtureId] : CASELESS_FIXTURES.aio;
}

export function BuildWidget({ widget }: WidgetProps) {
  const preview = usePanelPreview();
  // Dev-tools builds treat macOS as a PC so the snapshot flow can be exercised there.
  const hostIsMac = useHostIsMac(!preview && !DEV_TOOLS);
  const isMac = DEV_TOOLS ? false : hostIsMac;
  const live = useBuildPreview(!preview && isMac === false);
  let view: BuildWidgetView;
  if (preview) view = !DEV_TOOLS && isMacAppShell() ? 'mac' : 'no-case';
  else view = selectBuildWidgetView({ isMac, loaded: live.loaded, caseId: live.caseId, previewUrl: live.previewUrl });
  return <BuildWidgetView view={view} size={widget.size} previewUrl={live.previewUrl} caseless={preview ? previewCaseless(widget) : null} />;
}
