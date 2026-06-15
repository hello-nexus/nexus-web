import { useMemo, useState } from 'react';
import { Sparkles, Shapes, Smile } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { surfaceSupportsTextInput, type PanelSurface } from '../../types';
import { DECK_ICONS, DECK_ICON_NAMES } from '../deck/deckIcons';
import { CATEGORIES as EMOJI_CATEGORIES, CATEGORY_KEYS as EMOJI_CATEGORY_KEYS } from '../emoji/EmojiWidget';
import type { DeckIcon } from '../deck/types';
import styles from './IconPicker.module.scss';

const TAB_DEFS = [
  { key: 'auto', icon: Sparkles, labelKey: 'panel.iconPicker.auto' },
  { key: 'icons', icon: Shapes, labelKey: 'panel.iconPicker.icons' },
  { key: 'emoji', icon: Smile, labelKey: 'panel.iconPicker.emoji' },
] as const;

interface IconPickerProps {
  value?: DeckIcon;
  onChange: (icon: DeckIcon | undefined) => void;
  // Present when the slot launches an app; the Auto tab then shows the app's icon.
  appId?: string;
  // Surface being edited; the icon-name search is hidden on keyboard-less
  // surfaces (Y70 / Q-series). Undefined falls back to showing it.
  surface?: PanelSurface;
}

type Tab = 'auto' | 'icons' | 'emoji';

function tabForValue(value?: DeckIcon): Tab {
  if (value?.kind === 'lucide') return 'icons';
  if (value?.kind === 'emoji') return 'emoji';
  return 'auto'; // undefined or app icon → Auto
}

export function IconPicker({ value, onChange, surface }: IconPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(() => tabForValue(value));
  const [query, setQuery] = useState('');
  const [emojiCat, setEmojiCat] = useState(EMOJI_CATEGORY_KEYS[0]);
  const showSearch = !surface || surfaceSupportsTextInput(surface);

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
      <div className={styles.tabRow} role="tablist" aria-label={t('panel.settings.icon')}>
        {TAB_DEFS.map(({ key, icon: Icon, labelKey }) => (
          <IconLabelButton
            key={key}
            className={styles.tabButton}
            active={tab === key}
            icon={<Icon aria-hidden="true" />}
            label={t(labelKey)}
            onPress={() => onTab(key)}
          />
        ))}
      </div>

      {tab === 'auto' && (
        <div className={styles.autoHint}>{t('panel.iconPicker.autoHint')}</div>
      )}

      {tab === 'icons' && (
        <>
          {showSearch && (
            <SearchInput
              className={styles.search}
              value={query}
              onChange={setQuery}
              placeholder={t('panel.iconPicker.search')}
              ariaLabel={t('panel.iconPicker.search')}
            />
          )}
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
