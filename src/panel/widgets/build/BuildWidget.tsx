import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { AppleIcon } from '../../../components/icons/PlatformIcons';
import { isMacAppShell } from '../../../app/windowActions';
import { DEV_TOOLS } from '../../../lib/devTools';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { BuildCaseSilhouette } from './BuildCaseSilhouette';
import { buildNoticeKey, selectBuildWidgetView, type BuildWidgetView } from './buildWidgetState';
import { useBuildPreview, useHostIsMac } from './useBuildPreview';
import { isY70CaseId } from './y70Cases';
import y70Dark from './assets/y70-touch-dark.png';
import y70Light from './assets/y70-touch-light.png';
import styles from './BuildWidget.module.scss';

const BuildPreviewSeed = lazy(() => import('./BuildPreviewSeed'));

interface BuildWidgetViewProps {
  view: BuildWidgetView;
  size: string;
  previewUrl: string | null;
  /** The stock image of a Y70 case, shown until the PC's own image is stored. */
  stock?: boolean;
}

// The tile is not interactive itself: the dashboard cell's click-through opens the Build page.
/** The theme of the nearest themed ancestor, which a panel root or the simulator can set apart from the page's. */
function useScopeTheme() {
  const ref = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const scope = ref.current?.closest('[data-theme]');
    if (!scope) return undefined;
    const read = () => setTheme(scope.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(scope, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return { ref, theme };
}

export function BuildWidgetView({ view, size, previewUrl, stock = false }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  const noticeKey = buildNoticeKey(view, size);
  const scope = useScopeTheme();
  const showStock = stock && view === 'no-preview';
  const silhouette = (view === 'loading' || view === 'no-case' || view === 'no-preview') && !showStock;
  return (
    <div ref={scope.ref} className={styles.widget} data-size={size} data-view={view}>
      <span className={styles.srOnly}>{t('panel.widget.build')}</span>
      {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
      {view === 'preview' && previewUrl && <img className={styles.image} src={previewUrl} alt="" draggable={false} />}
      {showStock && <img className={styles.image} src={scope.theme === 'light' ? y70Light : y70Dark} alt="" draggable={false} data-stock={scope.theme} />}
      {silhouette && <BuildCaseSilhouette />}
      {silhouette && size === '4x4' && <span className={styles.notice}>{noticeKey ? t(noticeKey) : ''}</span>}
    </div>
  );
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
  const seed = DEV_TOOLS && !preview && view === 'no-preview' && live.caseId;
  return (
    <>
      <BuildWidgetView view={view} size={widget.size} previewUrl={live.previewUrl} stock={isY70CaseId(live.caseId)} />
      {seed && <Suspense fallback={null}><BuildPreviewSeed key={seed} caseId={seed} /></Suspense>}
    </>
  );
}
