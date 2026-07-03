import { useCallback, useEffect, useRef, useState } from 'react';
import { FileImage, Folder, FolderPlus, ImageIcon, ImagePlus, Trash2, Undo2, X } from 'lucide-react';
import { ViewHeader } from '../../../../components/common/ViewHeader/ViewHeader';
import { Card } from '../../../../components/common/Card/Card';
import { Button } from '../../../../components/common/Button/Button';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { SectionHeader } from '../../../../components/common/SectionHeader/SectionHeader';
import { useTranslation } from '../../../../lib/i18n';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { fetchServiceBlob, isDirectActive, isRelayActive } from '../../../../api/service';
import { postGalleryDrop, subscribeGalleryDropPaths } from '../../../../app/windowActions';
import {
  addGallerySource,
  GALLERY_ERROR_DUPLICATE,
  deleteGallerySource,
  excludeGalleryItem,
  fetchGalleryItems,
  fetchGallerySources,
  galleryItemFileUrl,
  pickGalleryPaths,
  restoreGalleryExclusions,
  type GalleryItem,
  type GallerySource,
} from '../../../../api/gallery';
import styles from './GalleryPage.module.scss';

const KIND_ICONS = {
  file: FileImage,
  folder: Folder,
} as const;

/**
 * Gallery management page. The source set is per-system shared (every panel
 * surface of this PC draws from it) and is pure REFERENCES - Nexus never
 * copies or deletes image bytes. Sources come from the OS-native picker or
 * from drag-n-drop (desktop app only: the shell bridge resolves dropped
 * files' real paths; browser tabs can't see them). Removing a folder's
 * image puts it on that source's exclusion list, restorable in one click.
 */
export function GalleryPage() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<GallerySource[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  // Which native dialog is open on the PC right now ('file' | 'folder').
  const [picking, setPicking] = useState<'file' | 'folder' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GallerySource | null>(null);
  // One error line for the sources column, cleared when the next action starts.
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Hovering a source card highlights its images in the grid (one-way only -
  // image hover deliberately lights nothing up).
  const [hoverSourceId, setHoverSourceId] = useState<string | null>(null);

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

  // Preview blob cache (panel auth is token-based, <img> can't hit the route
  // directly). Original bytes only - no server-side conversion exists; null
  // marks an unreadable file so the grid shows a placeholder, never retried.
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const thumbsRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (cancelled) return;
        if (item.id in thumbsRef.current) continue;
        const blob = await fetchServiceBlob(galleryItemFileUrl(item.id));
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

  const addPaths = useCallback(async (paths: string[], kind: 'file' | 'folder' | 'auto') => {
    setActionError(null);
    const failed: string[] = [];
    const duplicates: string[] = [];
    for (const path of paths) {
      const added = await addGallerySource(path, kind);
      if (!added || added.error) {
        const name = path.split(/[\\/]/).pop() || path;
        (added?.code === GALLERY_ERROR_DUPLICATE ? duplicates : failed).push(name);
      }
    }
    const messages = [
      duplicates.length > 0 ? t('gallery.page.alreadyAdded', { name: duplicates.join(', ') }) : null,
      failed.length > 0 ? t('gallery.page.addFailed', { name: failed.join(', ') }) : null,
    ].filter(Boolean);
    if (messages.length > 0) {
      setActionError(messages.join(' · '));
    }
    await refresh();
  }, [refresh, t]);

  // Shell drop bridge: the host resolves dropped files' disk paths and posts
  // them back; they enter through the same add flow as the native picker. An
  // empty reply means the shell couldn't resolve paths (old WebView2 runtime)
  // - surface the same hint as a bridge-less drop instead of silence.
  useEffect(() => subscribeGalleryDropPaths(paths => {
    // addPaths' setState calls run after its awaits, not synchronously.

    if (paths.length === 0) {
      setActionError(t('gallery.page.dropNeedsApp'));
      return;
    }
    addPaths(paths, 'auto');
  }), [addPaths, t]);

  // The native dialog opens on the host PC's screen; both buttons disable
  // while one is open. Remote sessions (cloud relay or the WebRTC direct
  // upgrade off one) can't summon it.
  const pickingDisabled = picking !== null || isRelayActive() || isDirectActive();

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
      await addPaths(res.paths, kind);
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

  // Removing an image never touches the disk: a folder's image goes on the
  // source's exclusion list (restorable), a single-file source is dropped.
  const removeItem = async (item: GalleryItem) => {
    const source = sources.find(s => s.id === item.sourceId);
    if (!source) return;
    if (source.kind === 'folder') {
      await excludeGalleryItem(source.id, item.id);
    } else {
      await deleteGallerySource(source.id);
    }
    await refresh();
  };

  const restore = async (source: GallerySource) => {
    await restoreGalleryExclusions(source.id);
    await refresh();
  };

  // Whole-page drop target. dragenter/leave fire for every child crossed,
  // so a depth counter (not a boolean) decides when the pointer truly left.
  const dragDepth = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current++;
    setDragOver(true);
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    setActionError(null);
    if (!postGalleryDrop(files)) {
      // Plain browser tab: the sandbox hides dropped files' paths, so a
      // reference can't be made here - point at the native picker instead.
      setActionError(t('gallery.page.dropNeedsApp'));
    }
  };

  const countFor = (sourceId: string) => items.filter(i => i.sourceId === sourceId).length;

  return (
    <div
      className={`${styles.app} ${dragOver ? styles.dragOver : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={e => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ViewHeader title={t('panel.widget.gallery')} />
      <div className={`${styles.body} pageBody`}>
        {/* Static-width sources column (300px, matching the Lighting /
            Cooling device-column width); the library fills the rest. No
            bounding box - each source is its own card, cooling-page style. */}
        <div className={styles.sourcesColumn}>
          <SectionHeader className={styles.sourcesHeader}>{t('gallery.page.sources')}</SectionHeader>
          <div className={styles.sourceActions}>
            <Button size="sm" icon={<ImagePlus size={14} />} disabled={pickingDisabled} onClick={() => pickAndAdd('file')}>
              {picking === 'file' ? t('gallery.page.picking') : t('gallery.page.addFile')}
            </Button>
            <Button size="sm" icon={<FolderPlus size={14} />} disabled={pickingDisabled} onClick={() => pickAndAdd('folder')}>
              {picking === 'folder' ? t('gallery.page.picking') : t('gallery.page.addFolder')}
            </Button>
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
                    <span className={styles.sourcePath}>{source.path}</span>
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
                    {(source.excluded?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        className={styles.excludedChip}
                        onClick={() => restore(source)}
                      >
                        <Undo2 size={12} aria-hidden="true" />
                        {t('gallery.page.excludedCount', { count: source.excluded.length })}
                        <span className={styles.excludedRestore}>{t('gallery.page.restore')}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.dropZone}>
          <SectionHeader className={styles.libraryHeader}>
            {t('gallery.page.library')}
            <span className={styles.libraryCount}>{t('gallery.page.itemCount', { count: items.length })}</span>
          </SectionHeader>
          <Card className={styles.libraryCard}>
            {items.length === 0 ? (
              <EmptyState
                compact
                icon={<ImageIcon size={22} />}
                title={t('gallery.page.empty')}
                hint={t('gallery.page.dropHint')}
              />
            ) : (
              <div className={styles.grid}>
                {items.map(item => (
                  <figure
                    key={item.id}
                    className={`${styles.tile} ${hoverSourceId === item.sourceId ? styles.tileHighlight : ''}`}
                    title={item.name}
                  >
                    {thumbs[item.id] ? (
                      <img src={thumbs[item.id]!} alt={item.name} loading="lazy" draggable={false} />
                    ) : (
                      <span className={styles.tilePlaceholder}>
                        <ImageIcon size={20} aria-hidden="true" />
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.tileRemove}
                      aria-label={t('gallery.page.removeImage')}
                      onClick={() => removeItem(item)}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                    <figcaption className={styles.tileName}>{item.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {dragOver && <div className={styles.dropHint}>{t('gallery.page.dropHint')}</div>}

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('gallery.page.removeSourceTitle')}
        message={t('gallery.page.removeSourceMessage', { name: pendingDelete?.name ?? '' })}
        note={t('gallery.page.removeSourceNote')}
        confirmLabel={t('gallery.page.remove')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default GalleryPage;
