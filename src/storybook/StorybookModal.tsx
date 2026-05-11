import { useMemo, useState } from 'react';
import { useTranslation } from '../lib/i18n';
import { DevicePopup } from '../components/DevicePopup/DevicePopup';
import { REGISTRY, type StorybookCategory } from './registry';
import { StorybookCard } from './StorybookCard';
import styles from './StorybookModal.module.scss';

const CATEGORIES: StorybookCategory[] = [
  'foundation',
  'inputs', 'editable', 'cards', 'modals', 'charts',
  'navigation', 'status', 'panel-kit',
];

export function StorybookModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<StorybookCategory>('foundation');

  const entries = useMemo(() => REGISTRY.filter(e => e.category === view), [view]);

  return (
    <DevicePopup open={open} onClose={onClose} fullscreen title={t('storybook.title')}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          {CATEGORIES.map(cat => {
            const count = REGISTRY.filter(e => e.category === cat).length;
            return (
              <button key={cat} type="button"
                className={`${styles.navItem} ${view === cat ? styles.navItemActive : ''}`}
                onClick={() => setView(cat)}>
                <span>{t('storybook.cat.' + cat)}</span>
                <span className={styles.navCount}>{count}</span>
              </button>
            );
          })}
        </aside>
        <main className={styles.main}>
          <p className={styles.subtitle}>{t('storybook.subtitle')}</p>
          {entries.length === 0 ? (
            <p className={styles.empty}>{t('storybook.empty')}</p>
          ) : (
            <div className={styles.grid}>
              {entries.map(entry => <StorybookCard key={entry.name} entry={entry} />)}
            </div>
          )}
        </main>
      </div>
    </DevicePopup>
  );
}
