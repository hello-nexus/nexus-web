import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../../lib/i18n';
import { Tabs, type TabDef } from '../../../components/common/Tabs/Tabs';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import styles from './DeckPageStrip.module.scss';

export interface DeckPageStripProps {
  pageCount: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
  onAddPage: () => void;
  onRemoveCurrentPage: () => void;
  /** Whether the current page already holds configured buttons - gates a confirm before deleting it. */
  currentPageHasContent: boolean;
  className?: string;
}

/**
 * Page strip for a deck's pagination: one tab per page (switches the grid +
 * inspector to that page, resetting any open folder), an add-page control,
 * and a remove-current-page control guarded against dropping the deck's last
 * page and confirmed when the page being removed has content. Shared by the
 * touch widget's settings sheet (DeckEditor) and the physical deck's
 * Customize tab (StreamDeckDevicePage).
 */
export function DeckPageStrip({
  pageCount, currentPage, onSelectPage, onAddPage, onRemoveCurrentPage, currentPageHasContent, className,
}: DeckPageStripProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canRemove = pageCount > 1;

  const tabs: TabDef[] = Array.from({ length: pageCount }, (_, i) => ({
    key: String(i),
    label: t('panel.settings.deck.page.tab', { n: i + 1 }),
  }));

  const requestRemove = () => {
    if (!canRemove) return;
    if (currentPageHasContent) setConfirmOpen(true);
    else onRemoveCurrentPage();
  };

  return (
    <div className={classNames(styles.strip, className)}>
      <div className={styles.tabsScroll}>
        <Tabs
          tabs={tabs}
          activeKey={String(currentPage)}
          onChange={k => onSelectPage(Number(k))}
          ariaLabel={t('panel.settings.deck.page.stripAria')}
        />
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.iconBtn} aria-label={t('panel.settings.deck.page.add')} onClick={onAddPage}>
          {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('panel.settings.deck.page.remove')}
          disabled={!canRemove}
          onClick={requestRemove}
        >
          {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <ConfirmModal
        open={confirmOpen}
        title={t('panel.settings.deck.page.removeConfirmTitle')}
        message={t('panel.settings.deck.page.removeConfirmBody')}
        destructive
        onConfirm={() => { setConfirmOpen(false); onRemoveCurrentPage(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
