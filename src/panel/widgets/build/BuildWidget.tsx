import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { DrawingImage } from './DrawingImage';
import { AppleIcon } from '../../../components/icons/PlatformIcons';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { isMacAppShell } from '../../../app/windowActions';
import { DEV_TOOLS } from '../../../lib/devTools';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { BuildCaseSilhouette } from './BuildCaseSilhouette';
import { selectBuildWidgetView, type BuildWidgetView } from './buildWidgetState';
import { useBuildPreview, useHostIsMac } from './useBuildPreview';
import { useBuildSpecs } from './useBuildSpecs';
import type { BuildSpecRow } from './buildSpecRows';
import { isY70CaseId } from './y70Cases';
import y70Dark from './assets/y70-touch-dark.png';
import y70Light from './assets/y70-touch-light.png';
// Every part draws in the accent, so one image serves both themes.
import openAir from './assets/open-air.png?inline';
import styles from './BuildWidget.module.scss';

// Temporary exploration switch: the BUILD label's look, read from a dev override so one bundle shoots every variant.
export const LABEL_VARIANTS = ['plain', 'outline-1-tight', 'outline-15-pill', 'outline-1-loose', 'outline-1-tight-dim', 'outline-15-tight'] as const;
export type LabelVariant = (typeof LABEL_VARIANTS)[number];
export const LABEL_VARIANT_KEY = 'nexus.dev.buildLabel';
function labelVariant(): LabelVariant {
  try {
    const raw = localStorage.getItem(LABEL_VARIANT_KEY);
    if (raw && (LABEL_VARIANTS as readonly string[]).includes(raw)) return raw as LabelVariant;
  } catch {
    // Storage is unusable; the default stays.
  }
  return 'outline-1-tight';
}

const BuildPreviewSeed = lazy(() => import('./BuildPreviewSeed'));

interface BuildWidgetViewProps {
  view: BuildWidgetView;
  size: string;
  previewUrl: string | null;
  /** The stock image of a Y70 case, shown until the PC's own image is stored. */
  stock?: boolean;
  /** Spec rows listed beside the image; empty leaves the image alone. */
  rows?: BuildSpecRow[];
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

export function BuildWidgetView({ view, size, previewUrl, stock = false, rows = [] }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  const scope = useScopeTheme();
  const showStock = stock && view === 'no-preview';
  // No case yet: the parts stand open-air, drawn by the same scene code as the case image.
  const isOpenAir = view === 'no-case';
  const silhouette = (view === 'loading' || view === 'no-preview') && !showStock;
  return (
    <div ref={scope.ref} className={styles.widget} data-size={size} data-view={view}>
      <span className={styles.srOnly}>{t('panel.widget.build')}</span>
      <div className={styles.body} data-specs={rows.length > 0 ? '' : undefined}>
      <div className={styles.media}>
        {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
        {view === 'preview' && previewUrl && <DrawingImage className={styles.image} src={previewUrl} />}
        {showStock && <img className={styles.image} src={scope.theme === 'light' ? y70Light : y70Dark} alt="" draggable={false} data-stock={scope.theme} />}
        {isOpenAir && <DrawingImage className={styles.image} src={openAir} openAir />}
        {silhouette && <BuildCaseSilhouette />}
      </div>
      {rows.length > 0 && (
        <div className={styles.side}>
          <span className={styles.label} data-variant={labelVariant()} aria-hidden="true">{t('panel.widget.build.badge')}</span>
          <ul className={styles.specs}>
            {rows.map((row) => (
              <li key={row.key} className={styles.spec}>
                <span className={styles.specLabel} aria-hidden="true">{t(row.labelKey)}</span>
                <span className={styles.srOnly}>{t(row.fullKey)}</span>
                <HoverTooltip title={t(row.fullKey)} body={row.full} side="top">
                  <span className={styles.specValue}>{row.value}</span>
                </HoverTooltip>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
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
  const rows = useBuildSpecs(!preview && isMac === false, widget.size);
  const seed = !preview && view === 'no-preview' && live.caseId;
  return (
    <>
      <BuildWidgetView view={view} size={widget.size} previewUrl={live.previewUrl} stock={isY70CaseId(live.caseId)} rows={rows} />
      {seed && <Suspense fallback={null}><BuildPreviewSeed key={seed} caseId={seed} /></Suspense>}
    </>
  );
}
