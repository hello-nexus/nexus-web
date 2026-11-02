import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { isStaleSize, mayRedraw, previewSizeFor, REDRAW_INTERVAL_MS, usePreviewSize, usePreviewSizeReporter } from '../../../components/views/BuildPage/previewSize';
import { SYSTEM_PREVIEW_CHANGED_EVENT } from '../../../api/systemPreview';
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
import { sizeShowsSpecs, type BuildSpecRow } from './buildSpecRows';
import { isY70CaseId } from './y70Cases';
import y70Dark from './assets/y70-touch-dark.png';
import y70Light from './assets/y70-touch-light.png';
// Every part draws in the accent, so one image serves both themes.
import openAir from './assets/open-air.png?inline';
import styles from './BuildWidget.module.scss';

const BuildPreviewSeed = lazy(() => import('./BuildPreviewSeed'));

// When each case and size pair was last redrawn by this context.
const redrawn = new Map<string, number>();

/** Test seam. */
export function resetResizedPreviews(): void {
  redrawn.clear();
}

interface BuildWidgetViewProps {
  view: BuildWidgetView;
  size: string;
  previewUrl: string | null;
  /** The stock image of a Y70 case, shown until the PC's own image is stored. */
  stock?: boolean;
  /** Spec rows listed beside the image; empty leaves the image alone. */
  rows?: BuildSpecRow[];
  /** Told how many CSS px across the picture's box is, once it settles after a mount, a resize or a scale change. */
  onImageWidth?: (cssWidth: number) => void;
}

// A tile is scaled by a transform, which a resize observer does not report, so the box is read again on a few later
// frames; a burst of reads settles before it is reported.
const MEASURE_DELAYS_MS = [400, 1200];
const MEASURE_SETTLE_MS = 250;
// How long the wanted size must hold still before a stored image is judged against it, so a resize drag redraws at most once.
const SEED_SETTLE_MS = 1500;
// The share of the picture's square left empty on each side; the stylesheet's own inset is the same until the tile is measured.
const INSET = 0.09;

/** The value once it has held still for `ms`; the first value is taken at once. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return undefined;
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}

/**
 * The tile's geometry, measured in JS so it holds on browsers without container units: on a wide tile the side of the picture's
 * square (the 2x2 content: the body's height, or half its width less the gap and the tile padding), and the width of the
 * picture itself in the CSS px the user sees (transform scale included), reported once settled.
 */
function useTileGeometry(wide: boolean, report: ((cssWidth: number) => void) | undefined) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const [side, setSide] = useState<number | null>(null);
  const reportRef = useRef(report);
  reportRef.current = report;
  const reporting = report !== undefined;
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    let settle: number | undefined;
    let first = true;
    const measure = () => {
      const width = body.offsetWidth;
      const height = body.offsetHeight;
      if (!(width > 0 && height > 0)) return;
      const scale = body.getBoundingClientRect().width / width;
      let box = width;
      if (wide) {
        const gap = gapRef.current?.offsetWidth ?? 0;
        const pad = parseFloat(getComputedStyle(body.parentElement ?? body).paddingLeft) || 0;
        box = Math.max(0, Math.min(height, (width - gap) / 2 - pad));
      }
      setSide(wide ? box : null);
      const inner = box * (1 - 2 * INSET) * scale;
      if (!reportRef.current || !(inner > 0)) return;
      window.clearTimeout(settle);
      if (first) {
        first = false;
        reportRef.current(inner);
        return;
      }
      settle = window.setTimeout(() => reportRef.current?.(inner), MEASURE_SETTLE_MS);
    };
    measure();
    const timers = MEASURE_DELAYS_MS.map((ms) => window.setTimeout(measure, ms));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(body);
    window.addEventListener('resize', measure);
    // A change of the device pixel ratio alone (a window moved to another display) fires no resize.
    let ratio: MediaQueryList | null = null;
    const watchRatio = () => {
      ratio?.removeEventListener('change', onRatio);
      ratio = typeof window.matchMedia === 'function' ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
      ratio?.addEventListener('change', onRatio);
    };
    function onRatio() {
      watchRatio();
      measure();
    }
    watchRatio();
    return () => {
      window.clearTimeout(settle);
      timers.forEach(window.clearTimeout);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      ratio?.removeEventListener('change', onRatio);
    };
  }, [wide, reporting]);
  return { bodyRef, gapRef, side };
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

export function BuildWidgetView({ view, size, previewUrl, stock = false, rows = [], onImageWidth }: BuildWidgetViewProps) {
  const { t } = useTranslation();
  // The layout is known from the tile's size, not from the spec rows having loaded, so the first report is already the final square.
  const wide = sizeShowsSpecs(size);
  const withSpecs = rows.length > 0;
  const geometry = useTileGeometry(wide, onImageWidth);
  const scope = useScopeTheme();
  const showStock = stock && view === 'no-preview';
  // No case yet: the parts stand open-air, drawn by the same scene code as the case image.
  const isOpenAir = view === 'no-case';
  // A wide tile's picture square, from the measured side; until then the stylesheet's own sizes apply.
  const mediaStyle: CSSProperties | undefined = withSpecs && geometry.side !== null ? { flex: '0 0 auto', width: geometry.side, padding: geometry.side * INSET } : undefined;
  const silhouette = (view === 'loading' || view === 'no-preview') && !showStock;
  return (
    <div ref={scope.ref} className={styles.widget} data-size={size} data-view={view}>
      <span className={styles.srOnly}>{t('panel.widget.build')}</span>
      <div ref={geometry.bodyRef} className={styles.body} data-specs={withSpecs ? '' : undefined}>
      {wide && <span ref={geometry.gapRef} className={styles.gapProbe} aria-hidden="true" />}
      <div className={styles.media} style={mediaStyle}>
        {view === 'mac' && <span className={styles.logo}><AppleIcon size={64} /></span>}
        {view === 'preview' && previewUrl && <DrawingImage className={styles.image} src={previewUrl} />}
        {showStock && <img className={styles.image} src={scope.theme === 'light' ? y70Light : y70Dark} alt="" draggable={false} data-stock={scope.theme} />}
        {isOpenAir && <DrawingImage className={styles.image} src={openAir} openAir />}
        {silhouette && <BuildCaseSilhouette />}
      </div>
      {withSpecs && (
        <div className={styles.side}>
          <span className={styles.label} aria-hidden="true">{t('panel.widget.build.badge')}</span>
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
  // The image is drawn by the portal at the size this tile shows it in, so the lines meet the screen pixel for pixel.
  const wanted = usePreviewSize();
  const measuring = !preview && isMac === false;
  const reportSize = usePreviewSizeReporter(measuring);
  const onImageWidth = measuring ? (cssWidth: number) => reportSize(previewSizeFor(cssWidth, window.devicePixelRatio || 1)) : undefined;
  // A stored image narrower than a size that has held still is drawn again, at most once per interval for each case and size, so a portal that ignores the size, or another context's smaller save, cannot loop.
  const settled = useSettled(wanted, SEED_SETTLE_MS);
  const staleKey = live.caseId && settled ? `${live.caseId}|${settled}` : null;
  const tooSmall = view === 'preview' && staleKey !== null && live.previewWidth !== null && isStaleSize(live.previewWidth, settled ?? 0);
  const [redrawing, setRedrawing] = useState<string | null>(null);
  const [due, setDue] = useState(0);
  useEffect(() => {
    if (!tooSmall || !staleKey || redrawing !== null) return undefined;
    const last = redrawn.get(staleKey);
    if (mayRedraw(last, Date.now())) {
      redrawn.set(staleKey, Date.now());
      setRedrawing(staleKey);
      return undefined;
    }
    // Still too small once the interval has passed: look again then.
    const timer = window.setTimeout(() => setDue((n) => n + 1), REDRAW_INTERVAL_MS - (Date.now() - (last ?? 0)));
    return () => window.clearTimeout(timer);
  }, [tooSmall, staleKey, redrawing, due]);
  // The attempt ends when the portal's image is stored, even when its bytes (so the stored ETag) did not change, or when what is stored is no longer too small.
  useEffect(() => {
    if (redrawing === null) return undefined;
    if (!tooSmall) { setRedrawing(null); return undefined; }
    const done = () => setRedrawing(null);
    window.addEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, done);
    return () => window.removeEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, done);
  }, [redrawing, tooSmall]);
  const stale = redrawing !== null;
  const seed = !preview && (view === 'no-preview' || stale) && live.caseId;
  return (
    <>
      <BuildWidgetView view={view} size={widget.size} previewUrl={live.previewUrl} stock={isY70CaseId(live.caseId)} rows={rows} onImageWidth={onImageWidth} />
      {seed && <Suspense fallback={null}><BuildPreviewSeed key={seed} caseId={seed} size={settled ?? wanted} /></Suspense>}
    </>
  );
}
