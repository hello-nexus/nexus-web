import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { BuildLogo } from '../../../components/common/BuildLogo/BuildLogo';
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

// The BUILD logo's drawing height in px: a small tag above the case image.
const LOGO_HEIGHT = 11;

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

interface ContentBox { aspect: number; inset: string }

/**
 * The drawn part of a transparent snapshot, found once the image loads: the picture is fitted into its square with empty
 * margins, so the logo above it would float apart from the drawing. Cropping the image's box to its content (object-view-box)
 * lets the logo sit just above the drawing, centered on it. Where the browser cannot read the pixels or crop the view
 * (an old kiosk Chromium), the box stays whole and the logo centers on it.
 */
function useContentBox(src: string | null): ContentBox | null {
  const [box, setBox] = useState<ContentBox | null>(null);
  useEffect(() => {
    setBox(null);
    if (!src || typeof document === 'undefined') return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      try {
        const side = 128;
        const canvas = document.createElement('canvas');
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext('2d');
        if (!ctx || !img.naturalWidth || !img.naturalHeight) return;
        ctx.drawImage(img, 0, 0, side, side);
        const { data } = ctx.getImageData(0, 0, side, side);
        let x0 = side, y0 = side, x1 = -1, y1 = -1;
        for (let y = 0; y < side; y++) {
          for (let x = 0; x < side; x++) {
            if (data[(y * side + x) * 4 + 3] > 8) {
              x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
          }
        }
        if (x1 < 0 || cancelled) return;
        const pct = (n: number) => `${((n / side) * 100).toFixed(2)}%`;
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        setBox({ aspect: (w * img.naturalWidth) / (h * img.naturalHeight), inset: `inset(${pct(y0)} ${pct(side - 1 - x1)} ${pct(side - 1 - y1)} ${pct(x0)})` });
      } catch {
        // The pixels are unreadable here; the whole box stays.
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return box;
}

const croppedStyle = (box: ContentBox | null) => (box ? ({ aspectRatio: String(box.aspect), objectViewBox: box.inset } as React.CSSProperties) : undefined);

export function BuildWidgetView({ view, size, previewUrl, stock = false, rows = [] }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  const scope = useScopeTheme();
  const showStock = stock && view === 'no-preview';
  // No case yet: the parts stand open-air, drawn by the same scene code as the case image.
  const isOpenAir = view === 'no-case';
  const drawing = view === 'preview' ? previewUrl : isOpenAir ? openAir : null;
  const content = useContentBox(drawing);
  const silhouette = (view === 'loading' || view === 'no-preview') && !showStock;
  return (
    <div ref={scope.ref} className={styles.widget} data-size={size} data-view={view} data-specs={rows.length > 0 ? '' : undefined}>
      <span className={styles.srOnly}>{t('panel.widget.build')}</span>
      <div className={styles.media}>
        <span className={styles.logoSlot} aria-hidden="true"><BuildLogo height={LOGO_HEIGHT} /></span>
        {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
        {view === 'preview' && previewUrl && <img className={styles.image} src={previewUrl} alt="" draggable={false} data-cropped={content ? '' : undefined} style={croppedStyle(content)} />}
        {showStock && <img className={styles.image} src={scope.theme === 'light' ? y70Light : y70Dark} alt="" draggable={false} data-stock={scope.theme} />}
        {isOpenAir && <img className={styles.image} src={openAir} alt="" draggable={false} data-open-air data-cropped={content ? '' : undefined} style={croppedStyle(content)} />}
        {silhouette && <BuildCaseSilhouette />}
      </div>
      {rows.length > 0 && (
        <ul className={styles.specs}>
          {rows.map((row) => (
            <li key={row.key} className={styles.spec}>
              <span className={styles.specLabel} aria-hidden="true">{t(row.labelKey)}</span>
              <span className={styles.srOnly}>{t(row.fullKey)}</span>
              <HoverTooltip title={t(row.fullKey)} body={row.value} side="top">
                <span className={styles.specValue}>{row.value}</span>
              </HoverTooltip>
            </li>
          ))}
        </ul>
      )}
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
