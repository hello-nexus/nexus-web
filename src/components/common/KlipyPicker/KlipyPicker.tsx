import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SearchInput } from '../SearchInput/SearchInput';
import { EffectCard } from '../EffectCard/EffectCard';
import { EmptyState } from '../EmptyState/EmptyState';
import { Spinner } from '../Spinner/Spinner';
import { klipyThumbUrl, searchKlipy, type KlipyGif } from '../../../api/klipy';
import styles from './KlipyPicker.module.scss';

const SEARCH_DEBOUNCE_MS = 300;

export function KlipyPicker({ open, busySlug, importError, thumbAspect, onPick, onClose }: {
  open: boolean;
  /** Slug currently importing; its card shows the spinner and the grid locks. */
  busySlug: string | null;
  /** A failed import renders here; the picker stays open over the page. */
  importError?: string | null;
  /** Card aspect (width / height). Match the surface's own crop so the grid
   *  previews what the import will produce; omit to inherit EffectCard's. */
  thumbAspect?: number;
  onPick: (gif: KlipyGif) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<KlipyGif[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Bumped per query so a slow page-1 response for an abandoned term cannot
  // land on top of a newer one.
  const runRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const load = useCallback(async (term: string, nextPage: number) => {
    const run = ++runRef.current;
    setLoading(true);
    const result = await searchKlipy(term, nextPage);
    if (runRef.current !== run) return;
    setLoading(false);
    if (!result || result.error) {
      setError(result?.msg || t('lighting.controls.klipyUnavailable'));
      if (nextPage === 1) setItems([]);
      setHasNext(false);
      return;
    }
    setError(null);
    setHasNext(result.hasNext);
    setPage(nextPage);
    // Klipy can repeat a slug across pages; a duplicate would collide on key.
    setItems(prev => {
      if (nextPage === 1) return result.items;
      const seen = new Set(prev.map(item => item.slug));
      return [...prev, ...result.items.filter(item => !seen.has(item.slug))];
    });
  }, [t]);

  useEffect(() => {
    if (!open) return;
    load(debounced, 1);
  }, [open, debounced, load]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setItems([]);
      setError(null);
      setPage(1);
      setHasNext(false);
    }
  }, [open]);

  // Append the next page when the sentinel scrolls into the grid's viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!open || !node || !hasNext || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) load(debounced, page + 1);
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasNext, loading, page, debounced, load]);

  if (!open) return null;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      className={styles.modal}
      ariaLabel={t('lighting.controls.klipyTitle')}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{t('lighting.controls.klipyTitle')}</h2>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('lighting.controls.klipySearchPlaceholder')}
          ariaLabel={t('lighting.controls.klipySearchPlaceholder')}
          className={styles.search}
        />
      </div>

      <div className={styles.body}>
        {error && items.length === 0 && (
          <EmptyState
            icon={<ImageOff size={28} aria-hidden />}
            title={t('lighting.controls.klipyUnavailable')}
            hint={error}
          />
        )}
        {!error && items.length === 0 && !loading && (
          <EmptyState
            icon={<ImageOff size={28} aria-hidden />}
            title={t('lighting.controls.klipyNoResults')}
          />
        )}
        {items.length > 0 && (
          <div className={styles.grid}>
            {items.map(gif => (
              <EffectCard
                key={gif.slug}
                overlay
                hideLabel
                label={gif.title || gif.slug}
                ariaLabel={gif.title || gif.slug}
                thumbUrl={klipyThumbUrl(gif.slug)}
                thumbAspect={thumbAspect}
                active={false}
                onClick={() => { if (!busySlug) onPick(gif); }}
                thumbOverlay={busySlug === gif.slug ? <Spinner size={22} /> : undefined}
              />
            ))}
          </div>
        )}
        {hasNext && <div ref={sentinelRef} className={styles.sentinel} aria-hidden />}
        {loading && (
          <div className={styles.loading}>
            <Spinner size={20} />
          </div>
        )}
      </div>

      <div className={styles.footer}>
        {importError && <p className={styles.importError} role="alert">{importError}</p>}
        <p className={styles.attribution}>{t('lighting.controls.klipyPoweredBy')}</p>
      </div>
    </Overlay>
  );
}
