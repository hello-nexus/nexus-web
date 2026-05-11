import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './ComponentPicker.module.scss';

interface FilterOption {
  value: string;
  label?: string;
  count: number;
}

interface CheckboxFilterGroupProps {
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  maxVisible?: number;
  searchable?: boolean;
  /** Section title used to build a context-aware search placeholder ("Search Brand…"). */
  title?: string;
}

export function CheckboxFilterGroup({
  options,
  selected,
  onChange,
  maxVisible = 8,
  searchable,
  title,
}: CheckboxFilterGroupProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  const shouldShowSearch = searchable ?? options.length > 15;
  const needsShowMore = options.length > maxVisible;

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => (o.label ?? o.value).toLowerCase().includes(q));
  }, [options, search]);

  const visible = showAll || search ? filtered : filtered.slice(0, maxVisible);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className={styles.checkboxGroup}>
      {shouldShowSearch && (
        <div className={styles.checkboxSearch}>
          <Search size={12} className={styles.checkboxSearchIcon} />
          <input
            type="text"
            className={styles.checkboxSearchInput}
            placeholder={title ? t('builder.searchIn', { name: title }) : t('builder.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className={styles.checkboxList}>
        {visible.map(opt => (
          <label key={opt.value} className={styles.checkboxItem}>
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            <span className={styles.checkboxLabel}>{opt.label ?? opt.value}</span>
            <span className={styles.checkboxCount}>({opt.count})</span>
          </label>
        ))}
      </div>
      {needsShowMore && !search && (
        <button
          type="button"
          className={styles.showMoreBtn}
          onClick={() => setShowAll(s => !s)}
        >
          {showAll ? t('builder.filters.showLess') : t('builder.filters.showMore')}
        </button>
      )}
    </div>
  );
}
