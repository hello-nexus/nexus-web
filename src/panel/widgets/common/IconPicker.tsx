import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Shapes, Smile, ImagePlus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Button } from '../../../components/common/Button/Button';
import { canEditFreeText, type PanelSurface } from '../../types';
import { DECK_ICONS, DECK_ICON_NAMES } from '../deck/deckIcons';
import { EmojiPicker } from './EmojiPicker';
import { useDeckImage } from '../deck/useDeckImage';
import { resizeDeckImage } from '../deck/resizeDeckImage';
import { uploadDeckImage } from '../../../api/deckImages';
import type { DeckIcon } from '../deck/types';
import styles from './IconPicker.module.scss';

const TAB_DEFS = [
  { key: 'auto', icon: Sparkles, labelKey: 'panel.iconPicker.auto' },
  { key: 'icons', icon: Shapes, labelKey: 'panel.iconPicker.icons' },
  { key: 'emoji', icon: Smile, labelKey: 'panel.iconPicker.emoji' },
  { key: 'custom', icon: ImagePlus, labelKey: 'panel.iconPicker.custom' },
] as const;

interface IconPickerProps {
  value?: DeckIcon;
  onChange: (icon: DeckIcon | undefined) => void;
  // Present when the slot launches an app; the Auto tab then shows the app's icon.
  appId?: string;
  // Surface being edited; the icon-name search is hidden on keyboard-less
  // surfaces (Y70 / Q-series). Undefined falls back to showing it.
  surface?: PanelSurface;
  // True when rendered in a desktop editor context; keeps the search input
  // visible even when the target surface has no keyboard.
  desktopEditor?: boolean;
  // Fires whenever the active tab changes, including the tab computed at
  // mount - a caller uses this to react to the Custom tab being active (e.g.
  // dimming a tile-color control a full-bleed image would ignore).
  onTabChange?: (tab: Tab) => void;
}

export type Tab = 'auto' | 'icons' | 'emoji' | 'custom';

export function tabForValue(value?: DeckIcon): Tab {
  if (value?.kind === 'lucide') return 'icons';
  if (value?.kind === 'emoji') return 'emoji';
  if (value?.kind === 'image') return 'custom';
  return 'auto'; // undefined or app icon → Auto
}

export function IconPicker({ value, onChange, surface, desktopEditor, onTabChange }: IconPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(() => tabForValue(value));
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const showSearch = canEditFreeText(surface, desktopEditor);
  const previewUrl = useDeckImage(value?.kind === 'image' ? value.value : undefined);

  // Remembers the last uploaded/selected image id across a round trip through
  // Auto (or any other tab) and back to Custom, so switching away and back
  // doesn't read as "the image was cleared".
  const lastImageId = useRef<string | undefined>(value?.kind === 'image' ? value.value : undefined);
  if (value?.kind === 'image') lastImageId.current = value.value;

  useEffect(() => {
    onTabChange?.(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? DECK_ICON_NAMES.filter(n => n.toLowerCase().includes(q)) : DECK_ICON_NAMES;
  }, [query]);

  const onTab = (key: string) => {
    const k = key as Tab;
    setTab(k);
    if (k === 'auto') { onChange(undefined); return; } // Auto = no explicit icon (derives from the action / app)
    if (k === 'custom' && value?.kind !== 'image' && lastImageId.current) {
      onChange({ kind: 'image', value: lastImageId.current });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);
    setUploading(true);
    try {
      const resized = await resizeDeckImage(file);
      const id = await uploadDeckImage(resized);
      if (!id) { setUploadError(t('panel.iconPicker.uploadFailed')); return; }
      onChange({ kind: 'image', value: id });
    } catch {
      setUploadError(t('panel.iconPicker.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.picker}>
      <div className={styles.tabRow} role="tablist" aria-label={t('panel.settings.icon')}>
        {TAB_DEFS.map(({ key, icon: Icon, labelKey }) => (
          <IconLabelButton
            key={key}
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
        <EmojiPicker
          value={value?.kind === 'emoji' ? value.value : undefined}
          onSelect={emoji => onChange({ kind: 'emoji', value: emoji })}
          searchable={showSearch}
        />
      )}

      {tab === 'custom' && (
        <div className={styles.customTab}>
          {value?.kind === 'image' && (
            <div className={styles.customPreview}>
              {previewUrl
                ? <img src={previewUrl} alt="" className={styles.customPreviewImg} />
                : <span className={styles.customPreviewSkeleton} aria-hidden="true" />}
            </div>
          )}
          <Button type="button" tone="neutral" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            {t('panel.iconPicker.uploadImage')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={handleFileChange}
          />
          {!value && !uploading && <div className={styles.autoHint}>{t('panel.iconPicker.customHint')}</div>}
          {uploadError && <div className={styles.uploadError}>{uploadError}</div>}
        </div>
      )}
    </div>
  );
}
