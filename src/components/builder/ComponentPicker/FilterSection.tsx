import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './ComponentPicker.module.scss';

interface FilterSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}

export function FilterSection({ title, children, defaultOpen = true, count }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.filterSection}>
      <button
        type="button"
        className={styles.filterSectionHeader}
        onClick={() => setOpen(o => !o)}
      >
        <span className={styles.filterSectionTitle}>{title}</span>
        {count != null && (
          <span className={styles.filterSectionCount}>{count}</span>
        )}
        <ChevronDown
          size={14}
          className={`${styles.filterSectionChevron} ${open ? styles.filterSectionChevronOpen : ''}`}
        />
      </button>
      {open && (
        <div className={styles.filterSectionBody}>
          {children}
        </div>
      )}
    </div>
  );
}
