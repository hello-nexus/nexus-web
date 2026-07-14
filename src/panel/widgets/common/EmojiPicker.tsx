import { useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { EMOJI_CATEGORIES, EMOJI_CATEGORY_KEYS, searchEmojis } from './emojiData';
import styles from './EmojiPicker.module.scss';

export interface EmojiPickerProps {
  value?: string;
  onSelect: (emoji: string) => void;
  // Renders a search input above the category tabs; while it holds a
  // non-empty query the tabs hide and the grid shows search results instead.
  searchable?: boolean;
  className?: string;
}

export function EmojiPicker({ value, onSelect, searchable, className }: EmojiPickerProps) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORY_KEYS[0]);
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  const searching = Boolean(searchable) && trimmedQuery.length > 0;

  const emojis = useMemo(
    () => (searching ? searchEmojis(trimmedQuery) : EMOJI_CATEGORIES[activeCategory].emojis),
    [searching, trimmedQuery, activeCategory],
  );

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      {searchable && (
        <SearchInput
          className={styles.search}
          value={query}
          onChange={setQuery}
          placeholder={t('panel.iconPicker.emojiSearch')}
          ariaLabel={t('panel.iconPicker.emojiSearch')}
        />
      )}
      {!searching && (
        <div className={styles.tabs}>
          {EMOJI_CATEGORY_KEYS.map(key => (
            <button
              key={key}
              type="button"
              className={`${styles.tab} ${activeCategory === key ? styles.activeTab : ''}`}
              onClick={() => setActiveCategory(key)}
              aria-label={key}
            >
              {EMOJI_CATEGORIES[key].icon}
            </button>
          ))}
        </div>
      )}
      <div className={styles.grid} data-panel-scrollable="true">
        {emojis.map((emoji, i) => (
          <button
            key={`${searching ? 'search' : activeCategory}-${i}`}
            type="button"
            className={`${styles.emojiBtn} ${value === emoji ? styles.activeEmoji : ''}`}
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export default EmojiPicker;
