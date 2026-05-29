import { memo, useEffect, useRef, useState } from 'react';
import {
  fetchScreenMonitors, startScreenMirror, fetchScreenEffect, setScreenEffect,
  type ScreenMonitor, type PostProcessSettings,
} from '../../../../api/lighting';
import {
  deleteMedia,
  fetchMediaCurrent,
  fetchMediaLibrary,
  importMedia,
  openMediaFolder,
  playMedia,
  type MediaItem,
} from '../../../../api/mediaLibrary';
import { fetchServiceBlob } from '../../../../api/service';
import { useTranslation } from '../../../../lib/i18n';
import type { LightingMode } from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Select } from '../../../../components/common/Select/Select';
import { SCREEN_FILTERS, matchScreenFilter, screenFilterByKey, type ScreenFilterKey } from './screenFilters';
import styles from '../LightingPage.module.scss';

/**
 * Mode-specific control rows rendered under the canvas when the user is NOT
 * on animate mode. Animate is handled separately because it uses a full grid
 * + the Effect-tab inspector on the right. Colour post-process (hue, colorize,
 * saturation, contrast) for Media and Mirror also lives in the Effect tab,
 * so this file only handles what sits UNDER the canvas: mirror monitor picker
 * + filter presets, media library, off message.
 */
export const ModeControls = memo(function ModeControls({ mode, screenPP, onScreenPPChange }: {
  mode: LightingMode;
  screenPP: PostProcessSettings;
  onScreenPPChange: (pp: PostProcessSettings) => void;
}) {
  switch (mode) {
    case 'animate': return null;
    case 'screen': return <ScreenControls screenPP={screenPP} onScreenPPChange={onScreenPPChange} />;
    case 'gif': return <MediaControls />;
    case 'none': return <OffControls />;
  }
});

function ScreenControls({ screenPP, onScreenPPChange }: {
  screenPP: PostProcessSettings;
  onScreenPPChange: (pp: PostProcessSettings) => void;
}) {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<ScreenMonitor[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState('');

  useEffect(() => {
    fetchScreenMonitors().then(data => {
      if (data?.monitors?.length) {
        setMonitors(data.monitors);
        setSelectedMonitor(data.monitors[0].id);
      }
    });
  }, []);

  const handleMonitorChange = async (id: string) => {
    setSelectedMonitor(id);
    const effect = await fetchScreenEffect();
    await startScreenMirror(
      effect?.saturation ?? 1,
      effect?.contrast ?? 1,
      id,
      effect?.hue ?? 0,
      effect?.colorize ?? 0,
    );
  };

  const activeFilter: ScreenFilterKey | null = matchScreenFilter(screenPP);

  const applyFilter = async (key: ScreenFilterKey) => {
    const def = screenFilterByKey(key);
    const nextPP: PostProcessSettings = {
      hue: def.pp.hue,
      colorize: def.pp.colorize,
      saturation: def.pp.saturation,
      contrast: def.pp.contrast,
      flipX: def.pp.flipX,
      flipY: def.pp.flipY,
    };
    onScreenPPChange(nextPP);
    await setScreenEffect(nextPP, true);
    // Re-arm the running mirror effect so the new flip/colour state takes
    // effect immediately on the live frame stream.
    await startScreenMirror(
      nextPP.saturation,
      nextPP.contrast,
      selectedMonitor,
      nextPP.hue,
      nextPP.colorize,
    );
  };

  return (
    <div className={styles.screenControls}>
      <div className={styles.filtersRow}>
        <span className={styles.compactLabel}>{t('lighting.filters.title')}</span>
        <div className={styles.filterChips}>
          {SCREEN_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={styles.filterChip}
              data-active={activeFilter === f.key ? 'true' : 'false'}
              onClick={() => applyFilter(f.key)}
              aria-pressed={activeFilter === f.key}
              title={t(f.i18nKey)}
            >
              {t(f.i18nKey)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.monitorPicker}>
        <span className={styles.compactLabel}>{t('lighting.controls.monitor')}</span>
        <Select
          className={styles.monitorSelect}
          value={selectedMonitor}
          onChange={handleMonitorChange}
          ariaLabel={t('lighting.controls.monitor')}
          disabled={monitors.length === 0}
        >
          {monitors.length === 0
            ? <option value="">{t('lighting.controls.noMonitors')}</option>
            : monitors.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
        </Select>
      </div>
    </div>
  );
}

function MediaControls() {
  const { t } = useTranslation();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const [lib, cur] = await Promise.all([
      fetchMediaLibrary(),
      fetchMediaCurrent(),
    ]);
    if (lib?.items) setItems(lib.items);
    if (cur?.mediaId) setActiveId(cur.mediaId);
  };

  // Initial load: pull library + currently playing media from the service
  // on mount. `refresh()` resolves a Promise and seeds items/activeId via
  // setState, which is the canonical "subscribe to external system"
  // pattern - the effect lifts service responses into React state.
   
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    thumbsRef.current = thumbs;
  }, [thumbs]);

  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) {
      URL.revokeObjectURL(url);
    }
    thumbsRef.current = {};
  }, []);

  useEffect(() => {
    const itemIds = new Set(items.map(item => item.id));
    setThumbs(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [id, url] of Object.entries(prev)) {
        if (!itemIds.has(id)) {
          URL.revokeObjectURL(url);
          delete next[id];
          changed = true;
        }
      }
      if (changed) thumbsRef.current = next;
      return changed ? next : prev;
    });
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (thumbsRef.current[item.id]) continue;
        const blob = await fetchServiceBlob(`/media/${encodeURIComponent(item.id)}/thumbnail`);
        if (cancelled) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          setThumbs(prev => {
            if (prev[item.id]) {
              URL.revokeObjectURL(url);
              return prev;
            }
            const next = { ...prev, [item.id]: url };
            thumbsRef.current = next;
            return next;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const [importingName, setImportingName] = useState<string | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportingName(file.name);
    setImportError(null);
    const result = await importMedia(file);
    setImporting(false);
    setImportingName(null);
    if (!result) {
      setImportError(t('lighting.controls.importNetworkError'));
    } else if (result.error || !result.item) {
      setImportError(result.msg || t('lighting.controls.importFailed'));
    } else {
      const newId = result.item.id;
      await refresh();
      const ok = await playMedia(newId);
      if (ok) setActiveId(newId);
    }
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    await openMediaFolder();
  };

  const handlePlay = async (id: string) => {
    if (id === activeId) return;
    const ok = await playMedia(id);
    if (ok) setActiveId(id);
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = async (id: string) => {
    const deleted = await deleteMedia(id);
    if (!deleted) {
      await refresh();
      return;
    }
    setItems(prev => prev.filter(item => item.id !== id));
    setThumbs(prev => {
      const url = prev[id];
      if (url) URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[id];
      thumbsRef.current = next;
      return next;
    });
    if (activeId === id) {
      setActiveId(null);
    }
    await refresh();
  };

  const requestDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await handleDelete(id);
  };

  return (
    <div className={styles.mediaSection}>
      <div className={styles.mediaHeader}>
        <button type="button" className={styles.importBtn} onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? t('lighting.controls.importing') : t('lighting.controls.import')}
        </button>
        <HoverTooltip body={t('lighting.controls.mediaManageFolder')} side="bottom">
          <button type="button" className={styles.manageFolderBtn} onClick={handleOpenFolder}
            aria-label={t('lighting.controls.mediaManageFolder')}>
            <svg className={styles.manageFolderIcon} width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
              <path d="m3 10 2.5 9.2A2 2 0 0 0 7.4 21h10.2a2 2 0 0 0 1.93-1.47L22 11H6.4a2 2 0 0 0-1.93 1.47Z" />
            </svg>
            <span>{t('lighting.controls.mediaManageFolder')}</span>
          </button>
        </HoverTooltip>
        <input ref={fileRef} type="file" className={styles.hiddenInput}
          accept="image/*,video/*,.gif" onChange={handleImport} />
      </div>
      {importError && (
        <p className={styles.mediaError}>{importError}</p>
      )}
      {items.length === 0 && !importing && !importError && (
        <p className={styles.mediaEmpty}>{t('lighting.controls.noMedia')}</p>
      )}
      <ConfirmModal
        open={pendingDelete !== null}
        title={t('lighting.controls.mediaDeleteTitle')}
        message={t('lighting.controls.mediaDeleteMessage', { name: pendingDelete?.name ?? '' })}
        note={t('lighting.controls.mediaDeleteNote')}
        confirmLabel={t('lighting.controls.mediaDeleteConfirm')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
      <div className={styles.mediaGrid}>
        {importingName && (
          <EffectCard
            asDiv
            label={importingName.replace(/\.[^.]+$/, '')}
            thumbUrl={null}
            active={false}
            onClick={() => { /* no-op while importing */ }}
            meta={t('lighting.controls.importing')}
            thumbOverlay={<span className={styles.mediaSpinner} role="status" aria-label={t('lighting.controls.importing')} />}
            ariaLabel={importingName}
          />
        )}
        {items.map(item => {
          const label = item.name.replace(/\.[^.]+$/, '');
          const meta = item.type === 'animated'
            ? `${(item.frames / Math.max(item.fps, 1)).toFixed(1)}s`
            : t('lighting.controls.mediaStatic');
          return (
            <EffectCard
              key={item.id}
              asDiv
              label={label}
              thumbUrl={thumbs[item.id] ?? null}
              active={item.id === activeId}
              onClick={() => handlePlay(item.id)}
              meta={meta}
              onDelete={() => requestDelete(item.id, label)}
              deleteAriaLabel={t('lighting.controls.mediaDelete')}
              ariaLabel={label}
            />
          );
        })}
      </div>
    </div>
  );
}

function OffControls() {
  const { t } = useTranslation();
  return <p className={styles.offMessage}>{t('lighting.off.message')}</p>;
}
