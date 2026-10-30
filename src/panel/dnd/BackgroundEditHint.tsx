import { useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Wallpaper } from 'lucide-react';
import { EditHint } from '../../components/common/EditHint/EditHint';
import { useTranslation } from '../../lib/i18n';
import { fitNoticeContent, type HintRect, type NoticeFit } from '../engine/hintGeometry';
import styles from '../PanelApp.module.scss';

export interface BackgroundMenuPoint { x: number; y: number; }

/**
 * The whole-background highlight of a multi-widget preview. The scrim is cut into the free
 * rectangles around the widgets, so the widgets themselves stay undimmed; the notice sits in `area`, or centered.
 */
export function BackgroundHoverLayer({ active, area, pieces }: { active: boolean; area: HintRect | null; pieces: readonly HintRect[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.bgLayer} data-active={active ? 'true' : undefined} aria-hidden="true">
      {pieces.map(r => (
        <div key={`${r.left}:${r.top}:${r.width}:${r.height}`} className={styles.bgScrim} style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
      ))}
      <EditHint bare icon={Wallpaper} label={t('panel.background.edit')} area={area ?? undefined} />
    </div>
  );
}

interface BackgroundSplitHintProps {
  orientation: 'stacked' | 'side';
  round: boolean;
  /** False on an empty slot, where the background half is the whole canvas. */
  widgetHalf: boolean;
  onActivate: (point: BackgroundMenuPoint) => void;
}

function useBoxSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setSize(prev => (prev && prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight }));
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

/**
 * A single-widget canvas in the device-page preview: hovering anywhere shows both
 * notices at once, "Edit widget" and "Edit background", each sized to fit its half
 * (inside the circle on round glass); the half under the pointer is highlighted.
 */
export function BackgroundSplitHint({ orientation, round, widgetHalf, onActivate }: BackgroundSplitHintProps) {
  const { t } = useTranslation();
  const { ref, size } = useBoxSize();
  const editWidget = t('panel.widget.editWidget');
  const editBackground = t('panel.background.edit');
  const fitFor = (part: 'start' | 'end' | 'full', label: string): NoticeFit | undefined => {
    if (!size || size.width <= 0 || size.height <= 0) return undefined;
    const half = part === 'full'
      ? size
      : orientation === 'stacked' ? { width: size.width, height: size.height / 2 } : { width: size.width / 2, height: size.height };
    return fitNoticeContent({
      width: half.width,
      height: half.height,
      round,
      part,
      labelChars: label.length,
      diameter: Math.min(size.width, size.height),
    });
  };
  return (
    <div ref={ref} className={styles.hintSplit} data-orientation={orientation} data-round={round ? 'true' : undefined}>
      {widgetHalf && (
        <div className={styles.hintHalf}>
          <EditHint icon={Pencil} label={editWidget} fit={fitFor('start', editWidget)} />
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={editBackground}
        className={`${styles.hintHalf} ${styles.bgHint}`}
        onClick={e => { e.stopPropagation(); onActivate({ x: e.clientX, y: e.clientY }); }}
        onKeyDown={e => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onActivate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }}
      >
        <EditHint icon={Wallpaper} label={editBackground} fit={fitFor(widgetHalf ? 'end' : 'full', editBackground)} />
      </div>
    </div>
  );
}
