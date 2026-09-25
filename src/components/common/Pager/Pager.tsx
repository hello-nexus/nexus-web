import { useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../Button/Button';
import styles from './Pager.module.scss';

interface PagerProps {
  /** Zero-based. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Previous / "Page N of M" / Next. Renders nothing for a single page. */
export function Pager({ page, pageCount, onPageChange, className }: PagerProps) {
  const { t } = useTranslation();
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<HTMLButtonElement | null>(null);

  // Reaching either end disables the clicked button, dropping focus to the body; the opposite
  // button is focused only after the render that enables it.
  useLayoutEffect(() => {
    pendingFocus.current?.focus();
    pendingFocus.current = null;
  }, [page]);

  if (pageCount <= 1) return null;

  const go = (target: number) => {
    pendingFocus.current = target <= 0 ? nextRef.current : target >= pageCount - 1 ? prevRef.current : null;
    onPageChange(target);
  };

  return (
    <div className={classNames(styles.pager, className)}>
      <Button ref={prevRef} size="sm" tone="ghost" icon={<ChevronLeft size={16} />} aria-label={t('common.pager.prev')} disabled={page <= 0} onClick={() => go(page - 1)} />
      <span className={styles.pageLabel} aria-live="polite">
        {t('common.pager.pageOf', { n: String(page + 1), total: String(pageCount) })}
      </span>
      <Button ref={nextRef} size="sm" tone="ghost" icon={<ChevronRight size={16} />} aria-label={t('common.pager.next')} disabled={page >= pageCount - 1} onClick={() => go(page + 1)} />
    </div>
  );
}
