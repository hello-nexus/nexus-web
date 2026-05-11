import { memo, useEffect, useRef, useState } from 'react';
import {
  startStatic, fetchScreenMonitors, startScreenMirror, fetchScreenEffect,
  type ScreenMonitor,
} from '../../../api/lighting';
import { fetchServiceBlob } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import type { LightingMode } from '../../../types/lighting';
import { EffectCard } from '../../EffectCard/EffectCard';
import { ConfirmDialog } from '../../ConfirmDialog/ConfirmDialog';
import { Select } from '../../Select/Select';
import styles from '../LightingView.module.scss';

/**
 * Mode-specific control rows rendered under the canvas when the user is NOT
 * on animate mode. Animate is handled separately because it uses a full grid
 * + the Effect-tab inspector on the right. Colour post-process (hue, colorize,
 * saturation, contrast) for Media and Screen Mirror also lives in the Effect
 * tab now, so this file only handles what sits UNDER the canvas: static
 * swatches, screen-mirror monitor picker, media library, off message.
 */
export const ModeControls = memo(function ModeControls({ mode, staticColor, onStaticChange }: {
  mode: LightingMode;
  staticColor: string;
  onStaticChange: (hex: string) => void;
}) {
  switch (mode) {
    case 'static': return <StaticControls color={staticColor} onChange={onStaticChange} />;
    case 'animate': return null;
    case 'screen': return <ScreenControls />;
    case 'gif': return <MediaControls />;
    case 'none': return <OffControls />;
  }
});

function StaticControls({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const applyColor = (hex: string) => {
    onChange(hex);
    startStatic(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  };
  const presets = ['#ff0000', '#ff7a00', '#ffe800', '#00ff2a', '#00c8ff', '#0033ff', '#8b5cf6', '#ff3bc0', '#ffffff'];
  const isPreset = presets.includes(color.toLowerCase());

  return (
    <div className={styles.staticBar}>
      <div className={styles.staticSwatches}>
        {presets.map(hex => (
          <button key={hex} type="button"
            className={`${styles.staticSwatch} ${hex.toLowerCase() === color.toLowerCase() ? styles.staticSwatchActive : ''}`}
            style={{ background: hex }} onClick={() => applyColor(hex)} aria-label={hex} />
        ))}
      </div>
      <label className={`${styles.customSwatch} ${!isPreset ? styles.staticSwatchActive : ''}`} title="Custom colour">
        <span className={styles.customRing} aria-hidden />
        {!isPreset && <span className={styles.customDot} style={{ background: color }} aria-hidden />}
        <input type="color" value={color} onChange={e => applyColor(e.target.value)} className={styles.customInput} />
      </label>
    </div>
  );
}

function ScreenControls() {
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

  return (
    <div className={styles.screenControls}>
      {monitors.length > 0 && (
        <div className={styles.monitorPicker}>
          <span className={styles.compactLabel}>{t('lighting.controls.monitor')}</span>
          <Select
            className={styles.monitorSelect}
            value={selectedMonitor}
            onChange={handleMonitorChange}
            ariaLabel={t('lighting.controls.monitor')}
          >
            {monitors.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

function MediaControls() {
  const { t } = useTranslation();
  const [items, setItems] = useState<import('../../../api/mediaLibrary').MediaItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const [lib, cur] = await Promise.all([
      import('../../../api/mediaLibrary').then(m => m.fetchMediaLibrary()),
      import('../../../api/mediaLibrary').then(m => m.fetchMediaCurrent()),
    ]);
    if (lib?.items) setItems(lib.items);
    if (cur?.mediaId) setActiveId(cur.mediaId);
  };

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
    const { importMedia } = await import('../../../api/mediaLibrary');
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
      const { playMedia } = await import('../../../api/mediaLibrary');
      const ok = await playMedia(newId);
      if (ok) setActiveId(newId);
    }
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    const { openMediaFolder } = await import('../../../api/mediaLibrary');
    await openMediaFolder();
  };

  const handlePlay = async (id: string) => {
    if (id === activeId) return;
    const { playMedia } = await import('../../../api/mediaLibrary');
    const ok = await playMedia(id);
    if (ok) setActiveId(id);
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = async (id: string) => {
    const { deleteMedia } = await import('../../../api/mediaLibrary');
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
        <button type="button" className={styles.manageFolderBtn} onClick={handleOpenFolder}
          aria-label={t('lighting.controls.mediaManageFolder')}
          title={t('lighting.controls.mediaManageFolder')}>
          <svg className={styles.manageFolderIcon} width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
            <path d="m3 10 2.5 9.2A2 2 0 0 0 7.4 21h10.2a2 2 0 0 0 1.93-1.47L22 11H6.4a2 2 0 0 0-1.93 1.47Z" />
          </svg>
          <span>{t('lighting.controls.mediaManageFolder')}</span>
        </button>
        <input ref={fileRef} type="file" className={styles.hiddenInput}
          accept="image/*,video/*,.gif" onChange={handleImport} />
      </div>
      {importError && (
        <p className={styles.mediaError}>{importError}</p>
      )}
      {items.length === 0 && !importing && !importError && (
        <p className={styles.mediaEmpty}>{t('lighting.controls.noMedia')}</p>
      )}
      <ConfirmDialog
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
