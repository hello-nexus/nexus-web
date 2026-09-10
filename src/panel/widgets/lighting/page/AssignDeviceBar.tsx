import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  assignDeviceMapping, fetchLedMap, fetchMappingCatalog, revertDeviceMapping,
  type AppliedMappingSummary, type BuiltInMappingSummary,
} from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { useToast } from '../../../../components/common/Toast/Toast';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import styles from './AssignDeviceBar.module.scss';

/** Debounce on the catalog query, ms. Local lookup, so this can be short. */
const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 50;

/**
 * "Assign device" picker at the top of the LED map editor.
 *
 * An ARGB header reports a LED count and nothing else - never what is wired to
 * it - so the user has to say. Picking a product here applies its shipped
 * layout; the user's own edits (positions, disabled LEDs, groups) are stored
 * separately and keep layering on top, so assigning never destroys their work
 * and re-assigning always restores the shipped layout underneath it.
 *
 * The catalog is served from the service binary, so this works with no network
 * and no account.
 */
export function AssignDeviceBar({ deviceId, disabled, onLedMapChanged, confirmDiscardEdits }: {
  /** The selected zone's card id - the same id the community panel targets. */
  deviceId: string;
  disabled?: boolean;
  /** Called after assign or clear so the editor refetches structure + map. */
  onLedMapChanged: () => void;
  /** Routes a destructive action through the editor's unsaved-edits confirm. */
  confirmDiscardEdits: (proceed: () => void) => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [applied, setApplied] = useState<AppliedMappingSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<BuiltInMappingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // The applied mapping comes from the led-map route, which resolves it from
  // local settings - no registry call, unlike the community list.
  const loadApplied = useCallback(async () => {
    const map = await fetchLedMap(deviceId);
    if (!mountedRef.current) return;
    setApplied(map?.applied ?? null);
  }, [deviceId]);

  useEffect(() => { void loadApplied(); }, [loadApplied]);

  // Debounced catalog lookup. An empty query is a valid search - it returns the
  // head of the catalog, so the list is never blank on first open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void fetchMappingCatalog(query, undefined, RESULT_LIMIT).then(resp => {
        if (cancelled || !mountedRef.current) return;
        setItems(resp?.items ?? []);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query]);

  // Close on an outside click or Escape. Escape is captured so the editor
  // modal does not also close on the same key.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const handlePick = useCallback(async (item: BuiltInMappingSummary) => {
    setBusy(true);
    const resp = await assignDeviceMapping(deviceId, item.key);
    if (!mountedRef.current) return;
    setBusy(false);
    if (!resp || resp.error) {
      push({ title: t('lighting.ledMap.assignFailed') });
      return;
    }
    setOpen(false);
    setQuery('');
    await loadApplied();
    onLedMapChanged();
  }, [deviceId, loadApplied, onLedMapChanged, push, t]);

  const handleClear = useCallback(() => {
    confirmDiscardEdits(() => {
      void (async () => {
        setBusy(true);
        // "switched": the user chose to stop using this layout, which is not
        // the auto-apply veto that "undo" signals.
        await revertDeviceMapping(deviceId, 'switched');
        if (!mountedRef.current) return;
        setBusy(false);
        await loadApplied();
        onLedMapChanged();
      })();
    });
  }, [confirmDiscardEdits, deviceId, loadApplied, onLedMapChanged]);

  return (
    <div className={styles.bar} ref={rootRef}>
      <span className={styles.label}>{t('lighting.ledMap.assignDevice')}</span>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled || busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lighting.ledMap.assignDevice')}
        onClick={() => setOpen(v => !v)}
      >
        <span className={`${styles.triggerLabel} ${applied ? '' : styles.placeholder}`}>
          {applied ? applied.name : t('lighting.ledMap.assignNone')}
        </span>
        <ChevronDown size={13} className={styles.chevron} aria-hidden />
      </button>
      {applied && (
        <button
          type="button"
          className={styles.clear}
          disabled={disabled || busy}
          aria-label={t('lighting.ledMap.assignClear')}
          onClick={handleClear}
        >
          <X size={12} aria-hidden />
          {t('lighting.ledMap.assignClear')}
        </button>
      )}
      {open && (
        <div className={styles.popover}>
          <SearchInput
            value={query}
            onChange={setQuery}
            autoFocus
            placeholder={t('lighting.ledMap.assignSearch')}
            ariaLabel={t('lighting.ledMap.assignSearch')}
          />
          <div className={styles.results} role="listbox">
            {items.map(item => (
              <button
                type="button"
                key={item.key}
                role="option"
                aria-selected={applied?.mappingId === item.key}
                className={`${styles.result} ${applied?.mappingId === item.key ? styles.active : ''}`}
                disabled={busy}
                onClick={() => void handlePick(item)}
              >
                <span className={styles.resultName}>{item.name}</span>
                <span className={styles.resultMeta}>
                  {t('lighting.ledMap.assignLeds', { count: item.ledCount })}
                </span>
              </button>
            ))}
            {!loading && items.length === 0 && (
              <div className={styles.empty}>{t('lighting.ledMap.assignNoResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
