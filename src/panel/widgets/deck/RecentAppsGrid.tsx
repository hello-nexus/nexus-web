import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useAppIcon } from '../common/AppPicker';
import { useProcessIcon } from '../../../hooks/useProcessIcon';
import { categoryColor } from './deckIcons';
import type { RecentAppKey, RecentAppsViewPage } from './recentAppsView';
import styles from './DeckGrid.module.scss';

function RecentAppCell({ appKey, onPress }: { appKey: RecentAppKey; onPress: (processKey: string) => void }) {
  const shortcutIcon = useAppIcon(appKey.shortcutId);
  const processIcon = useProcessIcon(appKey.shortcutId ? undefined : appKey.processKey);
  const iconUrl = shortcutIcon ?? processIcon;
  // A loaded icon is the whole key face, as DeckGrid renders a bound app key on
  // the touch widget; the initial-letter fallback keeps the accent fill.
  const accent = iconUrl ? 'transparent' : categoryColor('launch');
  const cellClass = appKey.focused ? `${styles.cell} ${styles.selectable} ${styles.selected}` : styles.cell;

  return (
    <button
      type="button"
      className={cellClass}
      style={{ '--deck-accent': accent } as CSSProperties}
      aria-label={appKey.name}
      aria-pressed={appKey.focused}
      onClick={() => { if (!appKey.focused) onPress(appKey.processKey); }}
    >
      <span className={styles.iconWrap}>
        {iconUrl ? (
          <img src={iconUrl} className={styles.appIconFull} alt="" />
        ) : (
          <span className={styles.emoji} aria-hidden="true">{appKey.name.charAt(0).toUpperCase()}</span>
        )}
      </span>
    </button>
  );
}

function RecentNavCell({ direction, ariaLabel, onPress }: { direction: 'next' | 'prev'; ariaLabel: string; onPress: () => void }) {
  const Icon = direction === 'next' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      className={styles.cell}
      style={{ '--deck-accent': categoryColor('navigation') } as CSSProperties}
      aria-label={ariaLabel}
      onClick={onPress}
    >
      <span className={styles.iconWrap}>
        <span className={styles.icon}>
          {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
          <Icon aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function RecentBlankCell() {
  return <div className={`${styles.cell} ${styles.empty}`} />;
}

export interface RecentAppsGridProps {
  pages: RecentAppsViewPage[];
  cols: number;
  rows: number;
  onPress: (processKey: string) => void;
  ariaLabel?: string;
}

/** Read-only key grid for Recent Apps mode: reuses DeckGrid's cell classes for
 *  pixel parity, owns its own page index (clamped as the ring reorders), and
 *  never renders drag/slot-selection affordances - there is no per-key
 *  editing in this mode. */
export function RecentAppsGrid({ pages, cols, rows, onPress, ariaLabel }: RecentAppsGridProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const maxPage = Math.max(0, pages.length - 1);
  const clampedPage = Math.min(page, maxPage);
  useEffect(() => { if (page !== clampedPage) setPage(clampedPage); }, [page, clampedPage]);
  const keys = pages[clampedPage] ?? [];

  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` } as CSSProperties}
      role="group"
      aria-label={ariaLabel}
    >
      {keys.map((key, i) => {
        if (key.kind === 'blank') return <RecentBlankCell key={i} />;
        if (key.kind === 'navNext') {
          return (
            <RecentNavCell
              key={i}
              direction="next"
              ariaLabel={t('panel.settings.deck.recentApps.nextPage')}
              onPress={() => setPage(p => Math.min(p + 1, maxPage))}
            />
          );
        }
        if (key.kind === 'navPrev') {
          return (
            <RecentNavCell
              key={i}
              direction="prev"
              ariaLabel={t('panel.settings.deck.recentApps.prevPage')}
              onPress={() => setPage(p => Math.max(p - 1, 0))}
            />
          );
        }
        return <RecentAppCell key={key.processKey} appKey={key} onPress={onPress} />;
      })}
    </div>
  );
}
