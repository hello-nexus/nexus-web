import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileImage, FileVideo, Folder, FolderPlus, ImageIcon, ImagePlus, Images, LayoutDashboard, ListPlus, ListVideo, Pencil, Play, Plus, Trash2, Undo2, X } from 'lucide-react';
import { ViewHeader } from '../../../../components/common/ViewHeader/ViewHeader';
import { Card } from '../../../../components/common/Card/Card';
import { Button } from '../../../../components/common/Button/Button';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { PromptModal } from '../../../../components/common/PromptModal/PromptModal';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { SectionHeader } from '../../../../components/common/SectionHeader/SectionHeader';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { fetchServiceBlob, isDirectActive, isRelayActive } from '../../../../api/service';
import { postGalleryDrop, subscribeGalleryDropPaths } from '../../../../app/windowActions';
import {
  addGallerySource,
  createGalleryPlaylist,
  GALLERY_ERROR_DUPLICATE,
  GALLERY_ERROR_LIMIT,
  GALLERY_PLAYLIST_NAME_MAX,
  GALLERY_PLAYLISTS_MAX,
  deleteGalleryPlaylist,
  deleteGallerySource,
  excludeGalleryItem,
  fetchGalleryItems,
  fetchGalleryPlaylistUsage,
  fetchGallerySources,
  galleryPlaylistItems,
  galleryThumbWidth,
  galleryItemFileUrl,
  pickGalleryPaths,
  restoreGalleryExclusions,
  toggleGalleryPlaylistItem,
  toggleGalleryPlaylistSource,
  updateGalleryPlaylist,
  type GalleryItem,
  type GalleryPlaylist,
  type GalleryPlaylistMutation,
  type GalleryPlaylistUse,
  type GallerySource,
} from '../../../../api/gallery';
import styles from './GalleryPage.module.scss';

const KIND_ICONS = {
  file: FileImage,
  folder: Folder,
} as const;

// A single-file source is one item; its icon follows that item's kind.
function sourceIcon(source: GallerySource, items: GalleryItem[]) {
  if (source.kind === 'file' && items.some(i => i.sourceId === source.id && i.kind === 'video')) return FileVideo;
  return KIND_ICONS[source.kind] ?? FileImage;
}

/**
 * Gallery management page. The source set is per-system shared (every panel
 * surface of this PC draws from it) and is pure REFERENCES - Nexus never
 * copies or deletes media bytes. Sources come from the OS-native picker or
 * from drag-n-drop (desktop app only: the shell bridge resolves dropped
 * files' real paths; browser tabs can't see them). Removing a folder's
 * item puts it on that source's exclusion list, restorable in one click.
 *
 * Playlists sit above the sources, master-detail style: "All media" is the
 * library itself, and picking a playlist turns the grid into its editor -
 * a click switches an item in or out, and a folder switched on whole keeps
 * bringing its new files along. Widgets pick a playlist in their edit sheet.
 */
export function GalleryPage() {
  const { t, language } = useTranslation();
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
  const [playlists, setPlaylists] = useState<GalleryPlaylist[]>([]);
  // null is "All media" - the library itself.
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  // Playlist view only: the whole library to pick from, or just its members.
  const [playlistView, setPlaylistView] = useState<'all' | 'members'>('all');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [renamingPlaylist, setRenamingPlaylist] = useState(false);
  const [pendingPlaylistDelete, setPendingPlaylistDelete] = useState<GalleryPlaylist | null>(null);
  // Widgets playing the playlist up for deletion; null = the lookup failed.
  const [pendingPlaylistUses, setPendingPlaylistUses] = useState<GalleryPlaylistUse[] | null>(null);
  // Playlist edits (membership saves and deletes) run one after another on
  // this chain. A refetch that started before the latest edit may answer
  // with older playlists, so its playlists are taken only when no edit is in
  // flight AND none began since the request went out.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const editGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = editGenerationRef.current;
    const [src, itm] = await Promise.all([fetchGallerySources(), fetchGalleryItems()]);
    if (src?.sources) setSources(src.sources);
    if (itm?.items) setItems(itm.items);
    if (itm?.items && pendingSavesRef.current === 0 && generation === editGenerationRef.current) {
      setPlaylists(itm.playlists ?? []);
    }
  }, []);

  // Queues one playlist edit behind any in flight; the last one to settle
  // brings the page back in line with what the service stored.
  const queuePlaylistEdit = useCallback((edit: () => Promise<void>) => {
    editGenerationRef.current++;
    pendingSavesRef.current++;
    const run = saveChainRef.current.then(edit).finally(() => {
      pendingSavesRef.current--;
      if (pendingSavesRef.current === 0) void refresh();
    });
    saveChainRef.current = run;
    return run;
  }, [refresh]);

  useEffect(() => {
    // refresh()'s setState calls run after the fetches resolve, not in the
    // effect body.

    refresh();
  }, [refresh]);
  useTopicCallback('gallery', true, refresh);

  // Preview blob cache (panel auth is token-based, <img> can't hit the route
  // directly). Grid-sized derivatives, not originals: a folder source can hold
  // hundreds of photos and this cache never evicts, so full-resolution bytes
  // here cost gigabytes. For a video the derivative is its poster frame (the
  // service 404s rather than send the clip when it cannot make one). null
  // marks an unreadable file so the grid shows a placeholder, never retried.
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const thumbsRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (cancelled) return;
        if (item.id in thumbsRef.current) continue;
        const blob = await fetchServiceBlob(galleryItemFileUrl(item.id, galleryThumbWidth()));
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

  // Removing an item never touches the disk: a folder's item goes on the
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

  // A playlist deleted elsewhere drops the page back to the library.
  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) ?? null;
  const members = selectedPlaylist ? galleryPlaylistItems(items, selectedPlaylist) : items;
  const memberIds = new Set(members.map(i => i.id));
  const gridItems = selectedPlaylist && playlistView === 'members' ? members : items;

  const selectPlaylist = (playlist: GalleryPlaylist | null) => {
    setSelectedPlaylistId(playlist?.id ?? null);
    // An empty playlist opens on the whole library, ready to pick from; one
    // with content opens on what it already plays.
    setPlaylistView(playlist && galleryPlaylistItems(items, playlist).length > 0 ? 'members' : 'all');
  };

  const savePlaylist = (next: GalleryPlaylist) => {
    setPlaylists(ps => ps.map(p => (p.id === next.id ? next : p)));
    void queuePlaylistEdit(async () => {
      const saved = await updateGalleryPlaylist(next.id, {
        sourceIds: next.sourceIds,
        itemIds: next.itemIds,
        excludedIds: next.excludedIds,
      });
      if (!saved || saved.error) setActionError(t('gallery.page.playlistSaveFailed'));
    });
  };

  // The shared name rules (unique, capped) live in the service; its refusal
  // comes back as the prompt's field error.
  const playlistError = (res: GalleryPlaylistMutation | null) => {
    if (res?.code === GALLERY_ERROR_DUPLICATE) return t('gallery.page.playlistNameTaken');
    if (res?.code === GALLERY_ERROR_LIMIT) return t('gallery.page.playlistLimit');
    return t('gallery.page.playlistSaveFailed');
  };

  const createPlaylist = async (name: string) => {
    const res = await createGalleryPlaylist(name);
    if (!res?.playlist || res.error) return playlistError(res);
    setCreatingPlaylist(false);
    setPlaylists(ps => [...ps, res.playlist!]);
    setSelectedPlaylistId(res.playlist.id);
    setPlaylistView('all');
    await refresh();
    return undefined;
  };

  const renamePlaylist = async (name: string) => {
    if (!selectedPlaylist) return undefined;
    const res = await updateGalleryPlaylist(selectedPlaylist.id, { name });
    if (!res?.playlist || res.error) return playlistError(res);
    setRenamingPlaylist(false);
    await refresh();
    return undefined;
  };

  // The confirmation names every widget that would fall back to All media,
  // so the lookup runs before the dialog opens rather than inside it.
  const askPlaylistDelete = async (playlist: GalleryPlaylist) => {
    setPendingPlaylistUses(await fetchGalleryPlaylistUsage(playlist.id));
    setPendingPlaylistDelete(playlist);
  };

  const playlistUseLabel = (use: GalleryPlaylistUse) => {
    const where = use.surface === 'dashboard' ? t('gallery.page.usage.dashboard')
      : use.surface === 'desktop' ? t('gallery.page.usage.desktop')
      : use.name || t('gallery.page.usage.panel');
    return use.count > 1 ? t(pluralKey('gallery.page.usage.count', language, use.count), { name: where, count: use.count }) : where;
  };
  const pendingInUse = (pendingPlaylistUses?.length ?? 0) > 0;

  const confirmPlaylistDelete = async () => {
    if (!pendingPlaylistDelete) return;
    const id = pendingPlaylistDelete.id;
    setPendingPlaylistDelete(null);
    if (id === selectedPlaylistId) setSelectedPlaylistId(null);
    setPlaylists(ps => ps.filter(p => p.id !== id));
    // Behind any queued membership save, so none of them lands on the
    // deleted playlist and reports a failure the user did not cause.
    await queuePlaylistEdit(async () => {
      // The final refresh brings a playlist that failed to delete back; say why.
      if (!(await deleteGalleryPlaylist(id))) setActionError(t('gallery.page.playlistDeleteFailed'));
    });
  };

  // First member's thumbnail as the playlist card's cover.
  const coverFor = (playlistItems: GalleryItem[]) => {
    const first = playlistItems.find(i => thumbs[i.id]);
    return first ? thumbs[first.id] : null;
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
  const memberCountFor = (sourceId: string) => members.filter(i => i.sourceId === sourceId).length;

  const playlistCard = (playlist: GalleryPlaylist | null) => {
    const playlistItems = playlist ? galleryPlaylistItems(items, playlist) : items;
    const cover = coverFor(playlistItems);
    const active = (playlist?.id ?? null) === (selectedPlaylist?.id ?? null);
    return (
      <li key={playlist?.id ?? ''}>
        <button
          type="button"
          className={`${styles.sourceCard} ${styles.playlistCard} ${active ? styles.sourceCardHighlight : ''}`}
          aria-pressed={active}
          onClick={() => selectPlaylist(playlist)}
        >
          <span className={styles.playlistCover} aria-hidden="true">
            {cover
              ? <img src={cover} alt="" draggable={false} />
              : playlist ? <ListVideo size={16} /> : <Images size={16} />}
          </span>
          <span className={styles.playlistText}>
            <span className={styles.sourceName}>{playlist ? playlist.name : t('gallery.playlist.all')}</span>
            <span className={styles.sourceCount}>{t('gallery.page.itemCount', { count: playlistItems.length })}</span>
          </span>
        </button>
      </li>
    );
  };

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
          {(sources.length > 0 || playlists.length > 0) && (
            <div className={styles.playlistsBlock}>
              <SectionHeader className={styles.sourcesHeader}>{t('gallery.page.playlists')}</SectionHeader>
              <ul className={styles.sourceList}>
                {playlistCard(null)}
                {playlists.map(p => playlistCard(p))}
              </ul>
              {/* The dashed full-width add row the Lighting / Cooling
                  "New group" entries use; gone at the cap, like theirs. */}
              {playlists.length < GALLERY_PLAYLISTS_MAX && (
                <button type="button" className={styles.newPlaylist} onClick={() => setCreatingPlaylist(true)}>
                  <ListPlus size={18} aria-hidden />
                  <span>{t('gallery.page.newPlaylist')}</span>
                </button>
              )}
            </div>
          )}
          <SectionHeader className={styles.sourcesHeader}>{t('gallery.page.sources')}</SectionHeader>
          <div className={styles.sourceActions}>
            <Button icon={<ImagePlus size={16} />} disabled={pickingDisabled} onClick={() => pickAndAdd('file')}>
              {picking === 'file' ? t('gallery.page.picking') : t('gallery.page.addFile')}
            </Button>
            <Button icon={<FolderPlus size={16} />} disabled={pickingDisabled} onClick={() => pickAndAdd('folder')}>
              {picking === 'folder' ? t('gallery.page.picking') : t('gallery.page.addFolder')}
            </Button>
          </div>
          {actionError && <p className={styles.uploadError}>{actionError}</p>}
          {sources.length > 0 && (
            <ul className={styles.sourceList}>
              {sources.map(source => {
                const Icon = sourceIcon(source, items);
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
                        {selectedPlaylist
                          ? t('gallery.page.inPlaylistCount', { count: memberCountFor(source.id), total: countFor(source.id) })
                          : t('gallery.page.itemCount', { count: countFor(source.id) })}
                      </span>
                      <Button
                        size="sm"
                        tone="ghost"
                        icon={<Trash2 size={14} />}
                        aria-label={t('gallery.page.remove')}
                        onClick={() => setPendingDelete(source)}
                      />
                    </div>
                    {selectedPlaylist && source.kind === 'folder' && (
                      // Whole-folder membership follows the folder: files
                      // added to it later join the playlist on their own.
                      <label className={styles.wholeFolder}>
                        <span>{t('gallery.page.wholeFolder')}</span>
                        <Toggle
                          checked={selectedPlaylist.sourceIds.includes(source.id)}
                          ariaLabel={t('gallery.page.wholeFolder')}
                          onChange={() => savePlaylist(toggleGalleryPlaylistSource(selectedPlaylist, source.id, items))}
                        />
                      </label>
                    )}
                    {selectedPlaylist && source.kind === 'file' && (() => {
                      // A single-file source is one item: its switch is the
                      // same toggle as clicking its tile.
                      const item = items.find(i => i.sourceId === source.id);
                      return item ? (
                        <label className={styles.wholeFolder}>
                          <span>{t('gallery.page.inPlaylistToggle')}</span>
                          <Toggle
                            checked={memberIds.has(item.id)}
                            ariaLabel={t('gallery.page.inPlaylistToggle')}
                            onChange={() => savePlaylist(toggleGalleryPlaylistItem(selectedPlaylist, item))}
                          />
                        </label>
                      ) : null;
                    })()}
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
            {selectedPlaylist ? selectedPlaylist.name : t('gallery.page.library')}
            <span className={styles.libraryCount}>
              {selectedPlaylist
                ? t('gallery.page.playlistCount', { count: members.length, total: items.length })
                : t('gallery.page.itemCount', { count: items.length })}
            </span>
            {selectedPlaylist && (
              <span className={styles.playlistActions}>
                <Button
                  size="sm"
                  tone="ghost"
                  icon={<Pencil size={14} />}
                  aria-label={t('gallery.page.renamePlaylist')}
                  onClick={() => setRenamingPlaylist(true)}
                />
                <Button
                  size="sm"
                  tone="ghost"
                  icon={<Trash2 size={14} />}
                  aria-label={t('gallery.page.deletePlaylist')}
                  onClick={() => askPlaylistDelete(selectedPlaylist)}
                />
              </span>
            )}
          </SectionHeader>
          {selectedPlaylist && items.length > 0 && (
            <div className={styles.playlistToolbar}>
              <ChipGroup
                ariaLabel={t('gallery.page.playlistView')}
                activeKey={playlistView}
                onChange={key => setPlaylistView(key === 'members' ? 'members' : 'all')}
                options={[
                  // eslint-disable-next-line i18next/no-literal-string -- view key
                  { key: 'members', label: t('gallery.page.showMembers') },
                  // eslint-disable-next-line i18next/no-literal-string -- view key
                  { key: 'all', label: t('gallery.playlist.all') },
                ]}
              />
              <span className={styles.playlistHint}>{t('gallery.page.playlistHint')}</span>
            </div>
          )}
          <Card className={styles.libraryCard}>
            {sources.length === 0 ? (
              <EmptyState
                hero
                icon={<ImageIcon />}
                title={t('gallery.intro.title')}
                hint={t('gallery.intro.body')}
                points={[
                  { icon: <ImagePlus />, text: t('gallery.intro.pointDrop') },
                  { icon: <Images />, text: t('gallery.intro.pointFormats') },
                  { icon: <LayoutDashboard />, text: t('gallery.intro.pointWidget') },
                ]}
              />
            ) : items.length === 0 ? (
              <EmptyState
                compact
                icon={<ImageIcon size={22} />}
                title={t('gallery.page.empty')}
                hint={t('gallery.page.dropHint')}
              />
            ) : gridItems.length === 0 ? (
              <EmptyState
                compact
                icon={<ListVideo size={22} />}
                title={t('gallery.page.playlistEmpty')}
                hint={t('gallery.page.playlistEmptyHint')}
              />
            ) : (
              <div className={styles.grid}>
                {gridItems.map(item => {
                  const member = memberIds.has(item.id);
                  return (
                  <HoverTooltip
                    key={item.id}
                    title={item.kind === 'video' ? t('gallery.page.video') : undefined}
                    body={item.name}
                  >
                    <figure
                      className={[
                        styles.tile,
                        hoverSourceId === item.sourceId ? styles.tileHighlight : '',
                        selectedPlaylist && !member ? styles.tileOut : '',
                      ].join(' ')}
                    >
                      {thumbs[item.id] ? (
                        <img src={thumbs[item.id]!} alt={item.name} loading="lazy" draggable={false} />
                      ) : (
                        <span className={styles.tilePlaceholder}>
                          {item.kind === 'video'
                            ? <FileVideo size={20} aria-hidden="true" />
                            : <ImageIcon size={20} aria-hidden="true" />}
                        </span>
                      )}
                      {item.kind === 'video' && (
                        <span className={styles.tileVideoBadge} aria-label={t('gallery.page.video')} role="img">
                          <Play size={10} aria-hidden="true" />
                        </span>
                      )}
                      {selectedPlaylist ? (
                        // The whole tile is the switch; the badge only shows
                        // which way it is set.
                        <button
                          type="button"
                          className={styles.tileToggle}
                          aria-pressed={member}
                          aria-label={member ? t('gallery.page.removeFromPlaylist') : t('gallery.page.addToPlaylist')}
                          onClick={() => savePlaylist(toggleGalleryPlaylistItem(selectedPlaylist, item))}
                        >
                          <span className={styles.tileMember} data-member={member ? 'true' : 'false'} aria-hidden="true">
                            {member ? <Check size={12} /> : <Plus size={12} />}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.tileRemove}
                          aria-label={t('gallery.page.removeImage')}
                          onClick={() => removeItem(item)}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      )}
                      <figcaption className={styles.tileName}>{item.name}</figcaption>
                    </figure>
                  </HoverTooltip>
                  );
                })}
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

      <PromptModal
        open={creatingPlaylist}
        title={t('gallery.page.newPlaylist')}
        placeholder={t('gallery.page.playlistName')}
        maxLength={GALLERY_PLAYLIST_NAME_MAX}
        confirmLabel={t('gallery.page.create')}
        validate={v => (v.trim() ? null : t('gallery.page.playlistNameRequired'))}
        onConfirm={createPlaylist}
        onCancel={() => setCreatingPlaylist(false)}
      />

      <PromptModal
        open={renamingPlaylist}
        title={t('gallery.page.renamePlaylist')}
        placeholder={t('gallery.page.playlistName')}
        initialValue={selectedPlaylist?.name ?? ''}
        maxLength={GALLERY_PLAYLIST_NAME_MAX}
        validate={v => (v.trim() ? null : t('gallery.page.playlistNameRequired'))}
        onConfirm={renamePlaylist}
        onCancel={() => setRenamingPlaylist(false)}
      />

      <ConfirmModal
        open={pendingPlaylistDelete !== null}
        title={t('gallery.page.deletePlaylist')}
        message={t(pendingInUse ? 'gallery.page.deletePlaylistInUse' : 'gallery.page.deletePlaylistMessage', { name: pendingPlaylistDelete?.name ?? '' })}
        bullets={pendingInUse ? pendingPlaylistUses!.map(playlistUseLabel) : undefined}
        // The in-use message already says the widgets fall back; a known-empty
        // list says nothing plays it; a failed lookup keeps the neutral note.
        note={t(pendingInUse ? 'gallery.page.deletePlaylistFilesNote'
          : pendingPlaylistUses?.length === 0 ? 'gallery.page.deletePlaylistUnused'
          : 'gallery.page.deletePlaylistNote')}
        confirmLabel={t('common.delete')}
        onCancel={() => setPendingPlaylistDelete(null)}
        onConfirm={confirmPlaylistDelete}
      />
    </div>
  );
}

export default GalleryPage;
