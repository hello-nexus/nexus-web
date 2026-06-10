import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, Check, FileImage, Folder } from 'lucide-react';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { useTranslation } from '../../../../lib/i18n';
import { browseGallery, type GalleryBrowseResponse } from '../../../../api/gallery';
import styles from './FileBrowserDialog.module.scss';

interface FileBrowserDialogProps {
  open: boolean;
  // 'file' multi-selects images; 'folder' confirms the directory being viewed.
  mode: 'file' | 'folder';
  onClose: () => void;
  onSelect: (paths: string[]) => void;
}

/**
 * Service-backed filesystem picker. Browsing happens on the host PC via
 * GET /gallery/browse (desktop-tier route) — the dialog never sees anything
 * but directory names and image files, and the service only accepts the
 * returned absolute paths through the source allowlist validation.
 */
export function FileBrowserDialog({ open, mode, onClose, onSelect }: FileBrowserDialogProps) {
  const { t } = useTranslation();
  const [listing, setListing] = useState<GalleryBrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const navigate = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    const res = await browseGallery(path || undefined);
    setLoading(false);
    if (!res || res.error) {
      setError(res?.msg || t('gallery.browse.error'));
      return;
    }
    setListing(res);
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setListing(null);
    setSelected(new Set());
    setError(null);
    // navigate()'s setState calls run after the fetch resolves.

    navigate('');
  }, [open, navigate]);

  const toggleFile = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const atRoot = !listing || listing.path === '';
  const confirmDisabled = mode === 'folder' ? atRoot : selected.size === 0;

  const confirm = () => {
    if (mode === 'folder') {
      if (listing && listing.path) onSelect([listing.path]);
      return;
    }
    onSelect([...selected]);
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      ariaLabel={mode === 'folder' ? t('gallery.browse.titleFolder') : t('gallery.browse.titleFile')}
      className={styles.dialog}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>
          {mode === 'folder' ? t('gallery.browse.titleFolder') : t('gallery.browse.titleFile')}
        </h3>
        <div className={styles.pathRow}>
          <Button
            size="sm"
            tone="ghost"
            icon={<ArrowUp size={14} />}
            aria-label={t('gallery.browse.up')}
            disabled={atRoot || loading}
            onClick={() => navigate(listing?.parent ?? '')}
          />
          <span className={styles.path} title={listing?.path || undefined}>
            {atRoot ? t('gallery.browse.roots') : listing?.path}
          </span>
        </div>
      </header>

      <div className={styles.listing}>
        {error && <p className={styles.error}>{error}</p>}
        {!error && listing && listing.dirs.length === 0 && listing.files.length === 0 && !loading && (
          <EmptyState compact icon={<FileImage size={20} />} title={t('gallery.browse.empty')} />
        )}
        {!error && listing && (
          <ul className={styles.rows}>
            {listing.dirs.map(dir => (
              <li key={dir.path}>
                <button type="button" className={styles.row} onClick={() => navigate(dir.path)} disabled={loading}>
                  <Folder size={15} className={styles.rowIcon} aria-hidden="true" />
                  <span className={styles.rowName}>{dir.name}</span>
                </button>
              </li>
            ))}
            {mode === 'file' && listing.files.map(file => {
              const isSelected = selected.has(file.path);
              return (
                <li key={file.path}>
                  <button
                    type="button"
                    className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                    onClick={() => toggleFile(file.path)}
                    aria-pressed={isSelected}
                  >
                    <FileImage size={15} className={styles.rowIcon} aria-hidden="true" />
                    <span className={styles.rowName}>{file.name}</span>
                    {isSelected && <Check size={14} className={styles.rowCheck} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className={styles.footer}>
        <Button size="sm" tone="ghost" onClick={onClose}>
          {t('gallery.browse.cancel')}
        </Button>
        <Button size="sm" tone="accent" disabled={confirmDisabled} onClick={confirm}>
          {mode === 'folder'
            ? t('gallery.browse.useFolder')
            : t('gallery.browse.addSelected', { count: selected.size })}
        </Button>
      </footer>
    </Overlay>
  );
}

export default FileBrowserDialog;
