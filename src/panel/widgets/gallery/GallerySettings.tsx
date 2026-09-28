import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import type { WidgetSettingsProps } from '../types';
import { SettingsRow, SettingsSelect, SettingsSection, SettingsToggle, SettingsHint } from '../common/SettingsRow/SettingsRow';
import { Button } from '../../../components/common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { DEFAULT_GALLERY_INTERVAL, galleryWidgetItems, readGalleryMediaFilter, readGalleryPlaylist, useGalleryItems } from './useGallery';
import { SLIDESHOW_INTERVALS, normalizeSlideshowInterval, slideshowIntervalLabel } from '../../slideshow/slideshow';
import styles from './GallerySettings.module.scss';

// Per-instance display settings only. The media sources and playlists are
// per-system shared and managed on the gallery page, never from the edit
// sheet; a widget only picks which playlist it plays.
export function GallerySettings({ widget, onUpdate, onSectionNavigate }: WidgetSettingsProps) {
  const { t, language } = useTranslation();
  const mode = ((widget.config?.mode as string | undefined) ?? 'single');
  const interval = String(normalizeSlideshowInterval(widget.config?.interval as number | undefined, DEFAULT_GALLERY_INTERVAL));
  const shuffle = ((widget.config?.shuffle as boolean | undefined) ?? false);
  const fit = ((widget.config?.fit as boolean | undefined) ?? false);
  const mediaFilter = readGalleryMediaFilter(widget.config);
  const finishVideos = ((widget.config?.finishVideos as boolean | undefined) ?? true);
  // Same config field the tile's nav arrows write, so a pick here and a pick
  // on the canvas or the device are the same edit.
  const pickedId = widget.config?.imageId as string | undefined;
  const { items: allItems, playlists } = useGalleryItems();
  // A stale id (playlist deleted) shows as the whole library, which is what
  // the tile falls back to.
  const playlist = readGalleryPlaylist(widget.config, playlists);
  // The picker steps through what the tile will actually show.
  const items = galleryWidgetItems(allItems, playlists, widget.config);
  const pickedIndex = pickedId ? items.findIndex(i => i.id === pickedId) : -1;
  const current = pickedIndex >= 0 ? pickedIndex : 0;
  const step = (delta: 1 | -1) => {
    if (items.length === 0) return;
    const next = items[((current + delta) % items.length + items.length) % items.length];
    onUpdate({ imageId: next.id });
  };

  return (
    <div className={styles.settings}>
      <SettingsSection title={t('gallery.settings.title')}>
        {/* Offered only once a playlist exists; until then every widget
            plays the whole library and there is nothing to choose. */}
        {playlists.length > 0 && (
          <SettingsSelect
            label={t('gallery.settings.playlist')}
            value={playlist?.id ?? ''}
            options={[
              { value: '', label: t('gallery.playlist.all') },
              ...playlists.map(p => ({ value: p.id, label: p.name })),
            ]}
            // The picked item may not be in the new playlist; the tile
            // starts from its first item instead of hunting for it.
            onChange={v => onUpdate({ playlistId: v || null, imageId: null })}
          />
        )}
        <SettingsSelect
          label={t('gallery.settings.media')}
          value={mediaFilter}
          options={[
            // eslint-disable-next-line i18next/no-literal-string -- config enum value
            { value: 'both', label: t('gallery.settings.mediaBoth') },
            // eslint-disable-next-line i18next/no-literal-string -- config enum value
            { value: 'images', label: t('gallery.settings.mediaImages') },
            // eslint-disable-next-line i18next/no-literal-string -- config enum value
            { value: 'videos', label: t('gallery.settings.mediaVideos') },
          ]}
          onChange={v => onUpdate({ media: v })}
        />
        <div className={styles.toggleReveal}>
          <SettingsSelect
            label={t('gallery.settings.mode')}
            value={mode}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- config enum value
              { value: 'single', label: t('gallery.settings.single') },
              // eslint-disable-next-line i18next/no-literal-string -- config enum value
              { value: 'slideshow', label: t('gallery.settings.slideshow') },
            ]}
            onChange={v => onUpdate({ mode: v })}
          />
          {mode === 'slideshow' && (
            <SettingsSelect
              label={t('slideshow.interval')}
              value={interval}
              options={SLIDESHOW_INTERVALS.map(s => ({
                value: String(s),
                label: slideshowIntervalLabel(t, language, s),
              }))}
              onChange={v => onUpdate({ interval: Number(v) })}
            />
          )}
          {mode === 'slideshow' && (
            <SettingsToggle
              label={t('slideshow.shuffle')}
              checked={shuffle}
              onChange={v => onUpdate({ shuffle: v })}
            />
          )}
          {mode === 'slideshow' && mediaFilter !== 'images' && (
            <SettingsToggle
              label={t('slideshow.finishVideos')}
              description={t('slideshow.finishVideosHint')}
              checked={finishVideos}
              onChange={v => onUpdate({ finishVideos: v })}
            />
          )}
        </div>
        {mode === 'single' && items.length > 0 && (
          <SettingsRow label={t('gallery.settings.item')} description={items[current]?.name} descriptionBelow>
            <div className={styles.picker}>
              <Button
                size="sm"
                tone="neutral"
                icon={<ChevronLeft size={14} />}
                aria-label={t('gallery.panel.prev')}
                disabled={items.length < 2}
                onClick={() => step(-1)}
              />
              <Button
                size="sm"
                tone="neutral"
                icon={<ChevronRight size={14} />}
                aria-label={t('gallery.panel.next')}
                disabled={items.length < 2}
                onClick={() => step(1)}
              />
            </div>
          </SettingsRow>
        )}
        <SettingsToggle
          label={t('gallery.settings.fit')}
          checked={fit}
          onChange={v => onUpdate({ fit: v })}
        />
      </SettingsSection>
      {onSectionNavigate ? (
        // Desktop editor: jump straight to the gallery page. On device the nav
        // callback is absent, so the text explanation stays.
        <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => onSectionNavigate('gallery')}>
          {t('gallery.manage')}
        </Button>
      ) : (
        <SettingsHint>{t('gallery.settings.manageHint')}</SettingsHint>
      )}
    </div>
  );
}

export default GallerySettings;
