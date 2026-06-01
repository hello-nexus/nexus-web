import { useEffect, useState, useRef, useMemo } from 'react';
import { ImageIcon } from 'lucide-react';
import type { WidgetProps } from '../types';
import styles from './GalleryWidget.module.scss';

function parseUrls(raw?: string): string[] {
  if (!raw) return [];
  return raw.split('\n').map(u => u.trim()).filter(Boolean);
}

export function GalleryWidget({ widget }: WidgetProps) {
  const mode = ((widget.config?.mode as string | undefined) ?? 'single');
  const interval = (((widget.config?.interval as number | undefined) ?? 10) * 1000);
  const urls = useMemo(() => parseUrls(widget.config?.urls as string | undefined), [widget.config?.urls]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [showIndex, setShowIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    // On url-count change, reset to the first frame so we never index
    // off the end, and clear any mid-transition fade.
     
    setActiveIndex(0);
    setShowIndex(0);
    setFading(false);
  }, [urls.length]);

  // Slideshow auto-advance
  useEffect(() => {
    if (mode !== 'slideshow' || urls.length < 2) return;

    timerRef.current = setInterval(() => {
      setFading(true);
      // After fade starts, swap the visible image
      setTimeout(() => {
        setActiveIndex(prev => {
          const next = (prev + 1) % urls.length;
          setShowIndex(next);
          return next;
        });
        setFading(false);
      }, 500);
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, interval, urls.length]);

  if (urls.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <ImageIcon size={40} strokeWidth={1.2} className={styles.placeholderIcon} />
          <span className={styles.placeholderText}>Add images in settings</span>
        </div>
      </div>
    );
  }

  if (mode === 'single' || urls.length === 1) {
    return (
      <div className={styles.container}>
        <img
          src={urls[0]}
          alt=""
          className={styles.image}
          draggable={false}
        />
      </div>
    );
  }

  // Slideshow with crossfade
  return (
    <div className={styles.container}>
      <img
        key={showIndex}
        src={urls[showIndex]}
        alt=""
        className={`${styles.image} ${styles.slideImage} ${fading ? styles.fadeOut : styles.fadeIn}`}
        draggable={false}
      />
      <div className={styles.dots}>
        {urls.map((_, i) => (
          <span
            key={i}
            className={`${styles.dot} ${i === activeIndex ? styles.activeDot : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

export default GalleryWidget;
