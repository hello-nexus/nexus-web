import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { PanelArrowButton } from '../../chrome/PanelArrowButton';
import { PanelWidgetEmpty } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { previewWallpaperUri } from '../common/previewAssets';
import { Button } from '../../../components/common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import {
  recallGalleryPosition,
  rememberGalleryPosition,
  useGalleryImageLoader,
  useGalleryItems,
  useGalleryRenderWidth,
} from './useGallery';
import type { WidgetProps } from '../types';
import styles from './GalleryWidget.module.scss';

const ARROW_HIDE_DELAY_MS = 2500;

// Catalog preview fixture - one abstract-wallpaper data-URI, zero network.
// Keep in sync with the viewer render; previewMode.test.tsx is the
// fixture-sync gate.
const GALLERY_PREVIEW_URL = previewWallpaperUri(210);

/**
 * Letterboxed image viewer over the per-system shared gallery. Images render
 * whole (object-fit: contain, black bars as needed). Prev/next tap zones span
 * the left/right thirds; the chevrons fade in on use and back out after an
 * idle moment so the image stays clean. The center third carries no
 * interactive element - center-tap still enters immersive on panels and
 * click-through opens the gallery page on the desktop dashboard.
 */
export function GalleryWidget({ widget, immersive, onSectionNavigate, onUpdate, editorPreview }: WidgetProps & { immersive?: boolean }) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const mode = ((widget.config?.mode as string | undefined) ?? 'single');
  const intervalMs = (((widget.config?.interval as number | undefined) ?? 10) * 1000);
  // Tiles fill the cell (cover, no bars) unless the per-instance "fit" switch
  // is on; fullscreen always letterboxes so the whole photo is visible.
  const fitWhole = immersive || ((widget.config?.fit as boolean | undefined) ?? false);
  // The picked photo, persisted in config so the choice survives a reload and
  // reaches every other view of this widget - the device, the editing canvas,
  // and the edit sheet all read and write this one field.
  const pickedId = widget.config?.imageId as string | undefined;
  // Held in a ref, NOT read from the closure: PanelApp mints a new onUpdate on
  // every render, and goTo is what the slideshow interval is keyed on - taking
  // the callback as a dependency re-armed that interval from zero on each
  // parent render, so a panel polling /ping never reached its own interval.
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const { items, loaded } = useGalleryItems();
  // Images are fetched at the size this viewer actually paints, not at the
  // photo's own resolution: a full-resolution phone JPEG is megabytes the
  // panel has to pull over its transport and decode in its WebView.
  const { boxRef, width } = useGalleryRenderWidth();
  const { getUrl, load, retain } = useGalleryImageLoader(width);

  const [index, setIndex] = useState(0);
  const count = items.length;
  const current = items[index] ?? null;

  // The index the UI intends to show next. Lets rapid taps accumulate (N taps
  // = N steps) instead of all computing from the not-yet-swapped state.
  const pointerRef = useRef(0);
  // Monotonic nav token: only the latest goTo may swap the index, so a slow
  // uncached load can't land after (and visually undo) a newer navigation.
  const navSeqRef = useRef(0);

  // Resume at the photo this widget instance last showed - most importantly,
  // the immersive view opens on the image the tile is displaying.
  const positionRestoredRef = useRef(false);
  // Set while a restore jump is scheduled: the same commit's retain/prefetch
  // pass still sees index 0 and would fetch (and pin) the wrong neighborhood
  // of full-res blobs; it skips once and runs against the restored index.
  const pendingRestoreRef = useRef(false);
  useEffect(() => {
    if (positionRestoredRef.current || preview || count === 0) return;
    positionRestoredRef.current = true;
    const savedId = pickedId ?? recallGalleryPosition(widget.id);
    const savedIndex = savedId ? items.findIndex(i => i.id === savedId) : -1;
    if (savedIndex > 0) {
      pendingRestoreRef.current = true;
      pointerRef.current = savedIndex;
      setIndex(savedIndex);
    }
  }, [preview, count, items, widget.id, pickedId]);

  // A pick made elsewhere (edit sheet, the device, the editing canvas) arrives
  // as a config change; follow it so the views never disagree. Setting the
  // index it already holds is a no-op, so this cannot loop with the write in
  // goTo above.
  useEffect(() => {
    // Slideshow ignores it: nothing clears imageId on a mode switch, so a
    // leftover pick would otherwise snap the rotation back on every gallery
    // topic refresh.
    if (!pickedId || preview || count === 0 || mode !== 'single') return;
    const target = items.findIndex(i => i.id === pickedId);
    if (target < 0) return;
    // Same reason the restore path sets it: this commit's retain/prefetch pass
    // still sees the old index and would pin the wrong blob window.
    pendingRestoreRef.current = true;
    pointerRef.current = target;
    setIndex(target);
  }, [pickedId, items, count, preview, mode]);

  // Items that didn't resolve to a renderable image (deleted from disk,
  // decode failure). Reset whenever the item list changes.
  const failedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    failedRef.current.clear();
  }, [items]);

  useEffect(() => {
    if (index >= count && count > 0) {
      pointerRef.current = 0;
      setIndex(0);
    }
  }, [count, index]);

  /**
   * Advance to `target`, walking `dir` past dead items (at most one lap).
   * The destination blob is awaited before the index swaps so the viewer
   * never flashes black mid-transition.
   */
  const goTo = useCallback(async (target: number, dir: 1 | -1, persist = false) => {
    if (count === 0) return;
    const seq = ++navSeqRef.current;
    let next = ((target % count) + count) % count;
    for (let hops = 0; hops < count; hops++) {
      const item = items[next];
      if (!failedRef.current.has(item.id)) {
        const url = await load(item.id);
        if (seq !== navSeqRef.current) return;
        if (url) {
          pointerRef.current = next;
          rememberGalleryPosition(widget.id, item.id);
          setIndex(next);
          // Only a deliberate move is written back. The slideshow's own
          // ticking must not, or a running panel would rewrite the layout
          // every few seconds.
          if (persist && mode === 'single') onUpdateRef.current?.({ imageId: item.id });
          return;
        }
        failedRef.current.add(item.id);
      }
      next = (next + dir + count) % count;
    }
  }, [count, items, load, widget.id, mode]);

  // Keep prev/current/next alive and prefetch them so manual nav and the
  // slideshow swap without a loading gap. The window stays narrow: the service
  // serves the untouched original for formats it will not flatten
  // (animated/alpha), and those are heavy on the panel WebViews.
  useEffect(() => {
    if (preview || !current) return;
    if (pendingRestoreRef.current) {
      pendingRestoreRef.current = false;
      return;
    }
    const prev = items[(index - 1 + count) % count];
    const next = items[(index + 1) % count];
    const keep = [current.id, prev?.id, next?.id].filter((id): id is string => Boolean(id));
    retain(keep);
    // Fetches resolve asynchronously; renders ride the loader's bump.

    for (const id of keep) load(id);
  }, [preview, current, items, index, count, retain, load]);

  // Slideshow auto-advance. An interval (not a re-armed timeout) so a lap
  // that lands back on the same index can't strand the slideshow; manual nav
  // resets the cadence via navEpoch.
  const [navEpoch, setNavEpoch] = useState(0);
  useEffect(() => {
    if (preview || mode !== 'slideshow' || count < 2) return;
    const timer = setInterval(() => {
      goTo(pointerRef.current + 1, 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [preview, mode, count, intervalMs, navEpoch, goTo]);

  // Arrow visibility: revealed by any nav tap, hidden again after idle.
  const [arrowsVisible, setArrowsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const navigate = useCallback((delta: 1 | -1) => {
    setArrowsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setArrowsVisible(false), ARROW_HIDE_DELAY_MS);
    setNavEpoch(e => e + 1);
    pointerRef.current = ((pointerRef.current + delta) % count + count) % count;
    goTo(pointerRef.current, delta, true);
  }, [goTo, count]);

  if (preview) {
    return (
      <div className={styles.viewer}>
        <img src={GALLERY_PREVIEW_URL} alt="" className={styles.image} data-fit="cover" draggable={false} />
      </div>
    );
  }

  if (loaded && count === 0) {
    // Desktop replaces the "add images on the gallery page" text with a button
    // straight to that page; device (no onSectionNavigate) keeps the text since
    // there is nowhere to navigate to.
    return (
      <PanelWidgetEmpty
        icon={<ImageIcon size={22} />}
        title={t('gallery.empty.title')}
        text={onSectionNavigate ? undefined : t('gallery.empty.text')}
        action={onSectionNavigate ? (
          <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => onSectionNavigate('gallery')}>
            {t('gallery.manage')}
          </Button>
        ) : undefined}
      />
    );
  }

  const url = current ? getUrl(current.id) : null;

  return (
    <div
      ref={boxRef}
      className={styles.viewer}
      data-arrows-visible={arrowsVisible ? 'true' : 'false'}
      data-editor-preview={editorPreview ? 'true' : undefined}
    >
      {url && current && (
        <img
          key={current.id}
          src={url}
          alt=""
          className={styles.image}
          data-fit={fitWhole ? 'contain' : 'cover'}
          draggable={false}
          onError={() => {
            failedRef.current.add(current.id);
            goTo(index + 1, 1);
          }}
        />
      )}
      {count > 1 && (
        <>
          <PanelArrowButton
            side="prev"
            className={styles.arrowBtn}
            onClick={e => { e.stopPropagation(); navigate(-1); }}
            ariaLabel={t('gallery.panel.prev')}
          />
          <PanelArrowButton
            side="next"
            className={styles.arrowBtn}
            onClick={e => { e.stopPropagation(); navigate(1); }}
            ariaLabel={t('gallery.panel.next')}
          />
        </>
      )}
    </div>
  );
}

export default GalleryWidget;
