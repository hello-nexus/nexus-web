import { useCallback, useEffect, useRef, useState } from 'react';
import { FileImage, Folder, FolderPlus, ImageIcon, ImagePlus, Trash2, Upload } from 'lucide-react';
import { ViewHeader } from '../../../../components/common/ViewHeader/ViewHeader';
import { Card } from '../../../../components/common/Card/Card';
import { Button } from '../../../../components/common/Button/Button';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { SectionHeader } from '../../../../components/common/SectionHeader/SectionHeader';
import { useTranslation } from '../../../../lib/i18n';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { fetchServiceBlob, isRelayActive } from '../../../../api/service';
import {
  addGallerySource,
  deleteGallerySource,
  fetchGalleryItems,
  fetchGallerySources,
  galleryItemFileUrl,
  galleryItemThumbUrl,
  importGalleryImage,
  pickGalleryPaths,
  type GalleryItem,
  type GallerySource,
} from '../../../../api/gallery';
import styles from './GalleryPage.module.scss';

const KIND_ICONS = {
  file: FileImage,
  folder: Folder,
  upload: Upload,
} as const;

/**
 * Gallery management page — the single place images are managed. The source
 * set is per-system shared: every panel surface of this PC (Y70, phone,
 * desktop) draws from what's configured here. Sources are referenced
 * files/folders picked via the OS-native dialog (opened on the host PC by
 * the service), plus direct uploads (file picker or drag-n-drop onto the
 * library card).
 */
export function GalleryPage() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<GallerySource[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  // Which native dialog is open on the PC right now ('file' | 'folder').
  const [picking, setPicking] = useState<'file' | 'folder' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GallerySource | null>(null);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  // One error line for the sources card — set by upload or add-source
  // failures, cleared when the next action starts.
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Bidirectional hover link: hovering a source card highlights its images
  // in the grid, hovering an image highlights its source card.
  const [hoverSourceId, setHoverSourceId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [src, itm] = await Promise.all([fetchGallerySources(), fetchGalleryItems()]);
    if (src?.sources) setSources(src.sources);
    if (itm?.items) setItems(itm.items);
  }, []);

  useEffect(() => {
    // refresh()'s setState calls run after the fetches resolve, not in the
    // effect body.

    refresh();
  }, [refresh]);
  useTopicCallback('gallery', true, refresh);

  // Thumbnail blob cache (panel auth is token-based, <img> can't hit the
  // route directly). Loaded lazily per item; a missing thumbnail (no ffmpeg
  // on the host) falls back to the original image bytes — only when both
  // fail does the grid show the placeholder icon (null, never retried).
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const thumbsRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (cancelled) return;
        if (item.id in thumbsRef.current) continue;
        const blob = await fetchServiceBlob(galleryItemThumbUrl(item.id))
          ?? await fetchServiceBlob(galleryItemFileUrl(item.id));
        if (cancelled) return;
        if (item.id in thumbsRef.current) continue;
        const url = blob ? URL.createObjectURL(blob) : null;
        thumbsRef.current = { ...thumbsRef.current, [item.id]: url };
        setThumbs(thumbsRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) {
      if (url) URL.revokeObjectURL(url);
    }
    thumbsRef.current = {};
  }, []);

  // Open the native OS dialog on the PC; the request stays in flight until
  // the user closes the dialog, then the chosen paths become sources.
  const pickAndAdd = async (kind: 'file' | 'folder') => {
    if (picking) return;
    setPicking(kind);
    setActionError(null);
    try {
      const res = await pickGalleryPaths(kind === 'folder');
      if (!res || res.error) {
        setActionError(res?.msg || t('gallery.page.pickFailed'));
        return;
      }
      if (res.cancelled || !res.paths?.length) return;

      const failed: string[] = [];
      for (const path of res.paths) {
        const added = await addGallerySource(path, kind);
        if (!added || added.error) {
          failed.push(path.split(/[\\/]/).pop() || path);
        }
      }
      if (failed.length > 0) {
        setActionError(t('gallery.page.addFailed', { name: failed.join(', ') }));
      }
      await refresh();
    } finally {
      setPicking(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await deleteGallerySource(id);
    await refresh();
  };

  // Uploads go straight to the service (multipart, fails closed over the
  // relay) and the native dialog opens on the host PC's screen — both
  // affordances are disabled on remote (relay) sessions.
  const uploadsDisabled = isRelayActive();
  const pickingDisabled = uploadsDisabled || picking !== null;

  const uploadFiles = async (files: File[]) => {
    // One batch at a time — a second drop mid-upload would clobber the
    // in-flight indicator state.
    if (uploadingNames.length > 0) return;
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setActionError(null);
    setUploadingNames(images.map(f => f.name));
    const failed: string[] = [];
    for (const file of images) {
      const result = await importGalleryImage(file);
      if (!result || result.error) {
        failed.push(file.name);
      }
    }
    setUploadingNames([]);
    if (failed.length > 0) {
      setActionError(t('gallery.page.uploadFailed', { name: failed.join(', ') }));
    }
    await refresh();
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    uploadFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploadsDisabled) return;
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  const countFor = (sourceId: string) => items.filter(i => i.sourceId === sourceId).length;

  return (
    <div className={styles.app}>
      <ViewHeader title={t('panel.widget.gallery')} />
      <div className={styles.body}>
        {/* Static-width sources column (300px, matching the Lighting /
            Cooling device-column width); the library fills the rest. No
            bounding box — each source is its own card, cooling-page style. */}
        <div className={styles.sourcesColumn}>
          <SectionHeader>{t('gallery.page.sources')}</SectionHeader>
          <div className={styles.sourceActions}>
            <Button size="sm" icon={<ImagePlus size={14} />} disabled={pickingDisabled} onClick={() => pickAndAdd('file')}>
              {picking === 'file' ? t('gallery.page.picking') : t('gallery.page.addFile')}
            </Button>
            <Button size="sm" icon={<FolderPlus size={14} />} disabled={pickingDisabled} onClick={() => pickAndAdd('folder')}>
              {picking === 'folder' ? t('gallery.page.picking') : t('gallery.page.addFolder')}
            </Button>
            <Button
              size="sm"
              tone="accent"
              icon={<Upload size={14} />}
              onClick={() => fileRef.current?.click()}
              disabled={uploadsDisabled || uploadingNames.length > 0}
              title={uploadsDisabled ? t('gallery.page.uploadRelayHint') : undefined}
            >
              {uploadingNames.length > 0 ? t('gallery.page.uploading') : t('gallery.page.upload')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className={styles.hiddenInput}
              onChange={handleUploadInput}
            />
          </div>
          {actionError && <p className={styles.uploadError}>{actionError}</p>}
          {sources.length === 0 ? (
            <EmptyState
              compact
              icon={<ImageIcon size={22} />}
              title={t('gallery.page.noSources')}
              hint={t('gallery.page.noSourcesHint')}
            />
          ) : (
            <ul className={styles.sourceList}>
              {sources.map(source => {
                const Icon = KIND_ICONS[source.kind] ?? FileImage;
                return (
                  <li
                    key={source.id}
                    className={`${styles.sourceCard} ${hoverSourceId === source.id ? styles.sourceCardHighlight : ''}`}
                    onMouseEnter={() => setHoverSourceId(source.id)}
                    onMouseLeave={() => setHoverSourceId(null)}
                  >
                    <div className={styles.sourceHead}>
                      <Icon size={14} className={styles.sourceIcon} aria-hidden="true" />
                      <span className={styles.sourceName}>{source.name}</span>
                    </div>
                    {source.kind !== 'upload' && (
                      <span className={styles.sourcePath}>{source.path}</span>
                    )}
                    <div className={styles.sourceMeta}>
                      <span className={styles.sourceCount}>
                        {t('gallery.page.itemCount', { count: countFor(source.id) })}
                      </span>
                      <Button
                        size="sm"
                        tone="ghost"
                        icon={<Trash2 size={14} />}
                        aria-label={t('gallery.page.remove')}
                        onClick={() => setPendingDelete(source)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The entire library card is the drop target, not just the grid. */}
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dragOver : ''}`}
          onDragOver={e => {
            e.preventDefault();
            if (!uploadsDisabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Card
            title={t('gallery.page.library')}
            subtitle={t('gallery.page.itemCount', { count: items.length })}
            className={styles.libraryCard}
          >
            {items.length === 0 ? (
              <EmptyState
                compact
                icon={<ImageIcon size={22} />}
                title={t('gallery.page.empty')}
                hint={uploadsDisabled ? undefined : t('gallery.page.dropHint')}
              />
            ) : (
              <div className={styles.grid}>
                {items.map(item => (
                  <figure
                    key={item.id}
                    className={`${styles.tile} ${hoverSourceId === item.sourceId ? styles.tileHighlight : ''}`}
                    title={item.name}
                    onMouseEnter={() => setHoverSourceId(item.sourceId)}
                    onMouseLeave={() => setHoverSourceId(null)}
                  >
                    {thumbs[item.id] ? (
                      <img src={thumbs[item.id]!} alt={item.name} loading="lazy" draggable={false} />
                    ) : (
                      <span className={styles.tilePlaceholder}>
                        <ImageIcon size={20} aria-hidden="true" />
                      </span>
                    )}
                    <figcaption className={styles.tileName}>{item.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Card>
          {dragOver && <div className={styles.dropHint}>{t('gallery.page.dropHint')}</div>}
        </div>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('gallery.page.removeSourceTitle')}
        message={t('gallery.page.removeSourceMessage', { name: pendingDelete?.name ?? '' })}
        note={pendingDelete?.kind === 'upload'
          ? t('gallery.page.removeUploadNote')
          : t('gallery.page.removeSourceNote')}
        confirmLabel={t('gallery.page.remove')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default GalleryPage;
