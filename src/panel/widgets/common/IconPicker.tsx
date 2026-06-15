import { useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Tabs } from '../../../components/common/Tabs/Tabs';
import { DECK_ICONS, DECK_ICON_NAMES } from '../deck/deckIcons';
import { CATEGORIES as EMOJI_CATEGORIES, CATEGORY_KEYS as EMOJI_CATEGORY_KEYS } from '../emoji/EmojiWidget';
import type { DeckIcon } from '../deck/types';
import styles from './IconPicker.module.scss';

interface IconPickerProps {
  value?: DeckIcon;
  onChange: (icon: DeckIcon | undefined) => void;
  // Present when the slot launches an app; the Auto tab then shows the app's icon.
  appId?: string;
}

type Tab = 'auto' | 'icons' | 'emoji';

function tabForValue(value?: DeckIcon): Tab {
  if (value?.kind === 'lucide') return 'icons';
  if (value?.kind === 'emoji') return 'emoji';
  return 'auto'; // undefined or app icon → Auto
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(() => tabForValue(value));
  const [query, setQuery] = useState('');
  const [emojiCat, setEmojiCat] = useState(EMOJI_CATEGORY_KEYS[0]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? DECK_ICON_NAMES.filter(n => n.toLowerCase().includes(q)) : DECK_ICON_NAMES;
  }, [query]);

  const onTab = (key: string) => {
    const k = key as Tab;
    setTab(k);
    if (k === 'auto') onChange(undefined); // Auto = no explicit icon (derives from the action / app)
  };

  return (
    <div className={styles.picker}>
      <Tabs
        ariaLabel={t('panel.settings.icon')}
        activeKey={tab}
        onChange={onTab}
        tabs={[
          // eslint-disable-next-line i18next/no-literal-string -- tab id, not display text
          { key: 'auto', label: t('panel.iconPicker.auto') },
          // eslint-disable-next-line i18next/no-literal-string -- tab id, not display text
          { key: 'icons', label: t('panel.iconPicker.icons') },
          // eslint-disable-next-line i18next/no-literal-string -- tab id, not display text
          { key: 'emoji', label: t('panel.iconPicker.emoji') },
        ]}
      />

      {tab === 'auto' && (
        <div className={styles.autoHint}>{t('panel.iconPicker.autoHint')}</div>
      )}

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
        <>
          <div className={styles.emojiCats}>
            {EMOJI_CATEGORY_KEYS.map(key => (
              <button
                key={key}
                type="button"
                className={`${styles.emojiCatBtn} ${emojiCat === key ? styles.activeIcon : ''}`}
                aria-label={key}
                onClick={() => setEmojiCat(key)}
              >
                {EMOJI_CATEGORIES[key].icon}
              </button>
            ))}
          </div>
          <div className={styles.emojiGrid} data-panel-scrollable="true">
            {EMOJI_CATEGORIES[emojiCat].emojis.map((emoji, i) => {
              const active = value?.kind === 'emoji' && value.value === emoji;
              return (
                <button
                  key={`${emojiCat}-${i}`}
                  type="button"
                  className={`${styles.emojiBtn} ${active ? styles.activeIcon : ''}`}
                  onClick={() => onChange({ kind: 'emoji', value: emoji })}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
