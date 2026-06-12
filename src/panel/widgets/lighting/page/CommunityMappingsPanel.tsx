import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, CloudOff, Download, RefreshCw, Upload } from 'lucide-react';
import {
  applyDeviceMapping, exportDeviceMapping, fetchDeviceMappings, importDeviceMapping,
  publishDeviceMapping, revertDeviceMapping,
  PUBLISH_NEEDS_ANONYMOUS_MSG,
  type CommunityMapping, type DeviceMappingsResponse, type MappingArtifact,
} from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { useToast } from '../../../../components/common/Toast/Toast';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { MappingPreview } from './MappingPreview';
import { PublishMappingDialog, type PublishMappingFields } from './PublishMappingDialog';
import { looksLikeMappingArtifact, sanitizeFileName } from './mappingUtils';
import styles from './CommunityMappings.module.scss';

/**
 * Community tab of the LED map editor: ranked registry layouts with live
 * previews, apply/revert, refresh, publish, and .nexusmap import/export.
 * Only rendered for devices with a non-empty deviceKey.
 */
export function CommunityMappingsPanel({ deviceId, deviceName, onLedMapChanged, onDialogOpenChange, confirmDiscardEdits }: {
  deviceId: string;
  deviceName: string;
  /** Called after any action that changes the device's resolved LED map so the editor refetches. */
  onLedMapChanged: () => void;
  /** Mirrors the publish dialog's open state up so the editor modal ignores Esc while it is open. */
  onDialogOpenChange: (open: boolean) => void;
  /** Routes apply / import / remove through the editor's unsaved-edits confirm; runs the action immediately when the editor is clean. */
  confirmDiscardEdits: (proceed: () => void) => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [data, setData] = useState<DeviceMappingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const resp = await fetchDeviceMappings(deviceId, refresh);
    if (!mountedRef.current) return;
    setData(resp);
    // A null response is a service error, not "no layouts" - the two need
    // distinct empty states so a failure doesn't read as an empty registry.
    setLoadFailed(resp === null || resp.error);
    setLoading(false);
    setRefreshing(false);
  }, [deviceId]);

  useEffect(() => { void load(false); }, [load]);

  const setPublishDialogOpen = (open: boolean) => {
    setPublishOpen(open);
    onDialogOpenChange(open);
  };

  const appliedId = data?.applied?.mappingId ?? null;
  const items = data?.items ?? [];
  // An applied mapping that isn't in the list (file import, or a registry
  // item that has since disappeared) still needs a revert affordance.
  const appliedOutsideList = data?.applied != null
    && !items.some(item => item.id === appliedId);

  const applyMapping = async (mapping: CommunityMapping) => {
    setBusyId(mapping.id);
    const resp = await applyDeviceMapping(deviceId, mapping.id);
    if (!mountedRef.current) return;
    setBusyId(null);
    if (!resp || resp.error) {
      push({ title: t('lighting.mappings.applyFailed') });
      return;
    }
    await load(false);
    onLedMapChanged();
  };

  const handleApply = (mapping: CommunityMapping) => {
    confirmDiscardEdits(() => { void applyMapping(mapping); });
  };

  const revertMapping = async () => {
    setBusyId('revert');
    const resp = await revertDeviceMapping(deviceId, 'switched');
    if (!mountedRef.current) return;
    setBusyId(null);
    if (!resp || resp.error) {
      push({ title: t('lighting.mappings.removeFailed') });
      return;
    }
    await load(false);
    onLedMapChanged();
  };

  const handleRevert = () => {
    confirmDiscardEdits(() => { void revertMapping(); });
  };

  const handleExport = async () => {
    const resp = await exportDeviceMapping(deviceId);
    if (!resp || resp.error || !resp.artifact) {
      push({ title: t('lighting.mappings.exportFailed') });
      return;
    }
    const blob = new Blob([JSON.stringify(resp.artifact, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(deviceName)}.nexusmap`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importArtifact = async (artifact: MappingArtifact) => {
    const resp = await importDeviceMapping(deviceId, artifact);
    if (!mountedRef.current) return;
    if (!resp || resp.error) {
      push({ title: t('lighting.mappings.importFailed') });
      return;
    }
    push({ title: t('lighting.mappings.importSuccess') });
    await load(false);
    onLedMapChanged();
  };

  const handleImportFile = async (file: File) => {
    let artifact: MappingArtifact;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!looksLikeMappingArtifact(parsed)) {
        push({ title: t('lighting.mappings.importInvalid') });
        return;
      }
      artifact = parsed;
    } catch {
      push({ title: t('lighting.mappings.importInvalid') });
      return;
    }
    // Confirm only after the file parsed: an invalid pick should not ask the
    // user to discard their edits for nothing.
    confirmDiscardEdits(() => { void importArtifact(artifact); });
  };

  const handlePublish = async (fields: PublishMappingFields) => {
    setPublishing(true);
    const resp = await publishDeviceMapping(deviceId, fields);
    if (!mountedRef.current) return;
    setPublishing(false);
    // Keep the dialog (and the user's typed name / description) open on
    // failure so a retry doesn't start from scratch; close only on success.
    if (!resp) {
      push({ title: t('lighting.mappings.publishFailedTitle'), body: t('lighting.mappings.publishFailedBody') });
      return;
    }
    if (resp.error) {
      push({
        title: t('lighting.mappings.publishFailedTitle'),
        body: resp.msg === PUBLISH_NEEDS_ANONYMOUS_MSG
          ? t('lighting.mappings.publishNeedsAnonymous')
          : t('lighting.mappings.publishFailedBody'),
      });
      return;
    }
    setPublishDialogOpen(false);
    if (resp.alreadyExisted) {
      push({ title: t('lighting.mappings.publishExistsTitle'), body: t('lighting.mappings.publishExistsBody') });
    } else {
      push({ title: t('lighting.mappings.publishSuccessTitle'), body: t('lighting.mappings.publishSuccessBody') });
    }
    // The fresh publish (or its existing twin) should appear in the list.
    void load(true);
  };

  const toggleExpanded = (id: string) =>
    setExpandedId(prev => prev === id ? null : id);

  const renderItem = (mapping: CommunityMapping) => {
    const isApplied = appliedId !== null && mapping.id === appliedId;
    const busy = busyId !== null;
    return (
      <div key={mapping.id} className={`${styles.item} ${isApplied ? styles.itemApplied : ''}`}>
        <MappingPreview artifact={mapping.payload} label={t('lighting.mappings.previewLabel')} />
        <div className={styles.itemBody}>
          <div className={styles.itemTitleRow}>
            <span className={styles.itemName}>{mapping.name}</span>
            {mapping.origin === 'verified' && (
              <span className={styles.verifiedBadge}>
                <BadgeCheck size={11} aria-hidden />
                {t('lighting.mappings.verified')}
              </span>
            )}
          </div>
          <span className={styles.itemMeta}>
            {t('lighting.mappings.byAuthor', { author: mapping.authorName || t('lighting.mappings.anonymous') })}
            {' - '}
            {t('lighting.mappings.adopters', { count: mapping.adopterCount })}
          </span>
          {mapping.description && (
            <p
              className={`${styles.itemDescription} ${expandedId === mapping.id ? styles.itemDescriptionExpanded : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={expandedId === mapping.id}
              onClick={() => toggleExpanded(mapping.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpanded(mapping.id);
                }
              }}
            >
              {mapping.description}
            </p>
          )}
        </div>
        <div className={styles.itemActions}>
          {isApplied ? (
            <>
              <span className={styles.appliedTag}>
                <BadgeCheck size={13} aria-hidden />
                {t('lighting.mappings.appliedBadge')}
              </span>
              <button type="button" className={styles.btn} disabled={busy} onClick={handleRevert}>
                {t('lighting.mappings.remove')}
              </button>
            </>
          ) : (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}
              onClick={() => handleApply(mapping)}>
              {t('lighting.mappings.apply')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        {data?.offline && (
          <span className={styles.offlineNote}>
            <CloudOff size={12} aria-hidden />
            {t('lighting.mappings.offlineNote')}
          </span>
        )}
        <div className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={() => fileInputRef.current?.click()}>
          <Upload size={13} aria-hidden />
          {t('lighting.mappings.import')}
        </button>
        <button type="button" className={styles.btn} onClick={() => { void handleExport(); }}>
          <Download size={13} aria-hidden />
          {t('lighting.mappings.export')}
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setPublishDialogOpen(true)}>
          {t('lighting.mappings.publish')}
        </button>
        <HoverTooltip body={t('lighting.mappings.refresh')} side="bottom">
          <button type="button" className={styles.iconBtn} disabled={loading || refreshing}
            aria-label={t('lighting.mappings.refresh')}
            onClick={() => { void load(true); }}>
            <RefreshCw size={14} className={refreshing ? styles.refreshing : undefined} />
          </button>
        </HoverTooltip>
      </div>

      {appliedOutsideList && data?.applied && (
        <div className={styles.appliedFileRow}>
          <span>{t('lighting.mappings.currentApplied', { name: data.applied.name })}</span>
          <div className={styles.spacer} />
          <button type="button" className={styles.btn} disabled={busyId !== null} onClick={handleRevert}>
            {t('lighting.mappings.remove')}
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingNote}>{t('lighting.mappings.loading')}</div>
      ) : loadFailed ? (
        <div className={styles.errorNote}>{t('lighting.mappings.loadFailed')}</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyNote}>{t('lighting.mappings.empty')}</div>
      ) : (
        <div className={styles.list}>
          {items.map(renderItem)}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".nexusmap,application/json"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          // Reset so picking the same file again re-fires the change event.
          e.target.value = '';
          if (file) void handleImportFile(file);
        }}
      />

      <PublishMappingDialog
        open={publishOpen}
        busy={publishing}
        onSubmit={fields => { void handlePublish(fields); }}
        onCancel={() => setPublishDialogOpen(false)}
      />
    </div>
  );
}
