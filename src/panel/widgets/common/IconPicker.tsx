import { useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { DECK_ICONS, DECK_ICON_NAMES } from '../deck/deckIcons';
import { useAppIcon } from './AppPicker';
import type { DeckIcon } from '../deck/types';
import styles from './IconPicker.module.scss';

interface IconPickerProps {
  value?: DeckIcon;
  onChange: (icon: DeckIcon | undefined) => void;
  // When the slot launches an app (or otherwise has an app id), offer "use app icon".
  appId?: string;
}

type Tab = 'icons' | 'emoji' | 'app';

export function IconPicker({ value, onChange, appId }: IconPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(value?.kind === 'emoji' ? 'emoji' : value?.kind === 'app' ? 'app' : 'icons');
  const [query, setQuery] = useState('');
  const appIconUrl = useAppIcon(appId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? DECK_ICON_NAMES.filter(n => n.toLowerCase().includes(q)) : DECK_ICON_NAMES;
  }, [query]);

  return (
    <div className={styles.picker}>
      <div className={styles.tabs}>
        <button type="button" className={tab === 'icons' ? styles.activeTab : ''} onClick={() => setTab('icons')}>{t('panel.iconPicker.icons')}</button>
        <button type="button" className={tab === 'emoji' ? styles.activeTab : ''} onClick={() => setTab('emoji')}>{t('panel.iconPicker.emoji')}</button>
        {appId ? <button type="button" className={tab === 'app' ? styles.activeTab : ''} onClick={() => setTab('app')}>{t('panel.iconPicker.useApp')}</button> : null}
        <button type="button" className={styles.auto} onClick={() => onChange(undefined)}>{t('panel.iconPicker.auto')}</button>
      </div>

      {tab === 'icons' && (
        <>
          <input
            className={styles.search}
            type="text"
            value={query}
            placeholder={t('panel.iconPicker.search')}
            onChange={e => setQuery(e.target.value)}
          />
          <div className={styles.grid} data-panel-scrollable="true">
            {filtered.map(name => {
              const Comp = DECK_ICONS[name];
              const active = value?.kind === 'lucide' && value.value === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`${styles.iconBtn} ${active ? styles.activeIcon : ''}`}
                  title={name}
                  onClick={() => onChange({ kind: 'lucide', value: name })}
                >
                  <Comp aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'emoji' && (
        <input
          className={styles.search}
          type="text"
          value={value?.kind === 'emoji' ? value.value : ''}
          placeholder="🚀"
          onChange={e => onChange(e.target.value ? { kind: 'emoji', value: e.target.value } : undefined)}
        />
      )}

      {tab === 'app' && appId && (
        <button type="button" className={styles.appOption} onClick={() => onChange({ kind: 'app', value: appId })}>
          {appIconUrl ? <img src={appIconUrl} alt="" /> : null}
          <span>{t('panel.iconPicker.useApp')}</span>
        </button>
      )}
    </div>
  );
}
