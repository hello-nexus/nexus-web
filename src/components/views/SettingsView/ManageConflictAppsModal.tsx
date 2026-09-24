import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { SearchInput } from '../../common/SearchInput/SearchInput';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { Toggle } from '../../common/Toggle/Toggle';
import {
  fetchConflictCatalog, fetchDynamicLighting, setDynamicLighting,
  type ConflictCatalogApp, type SetWindowsDynamicLightingBody, type WindowsDynamicLightingState,
} from '../../../api/conflicts';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { useTranslation } from '../../../lib/i18n';
import styles from './ManageConflictAppsModal.module.scss';

// Catalog Category values, in the order their groups are listed. Anything the
// service adds outside this set falls through to the "other" group rather
// than disappearing from the list.
const CATEGORY_ORDER = ['lighting', 'cooling', 'peripherals', 'monitoring'] as const;

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  lighting: 'settings.conflictApps.category.lighting',
  cooling: 'settings.conflictApps.category.cooling',
  peripherals: 'settings.conflictApps.category.peripherals',
  monitoring: 'settings.conflictApps.category.monitoring',
};

interface ManageConflictAppsModalProps {
  open: boolean;
  onClose: () => void;
  /** Master switch: shut down the enabled apps once at service start. */
  autoShutdown: boolean;
  onAutoShutdownChange: (enabled: boolean) => void;
  /** Catalog ids opted OUT. Every app not listed here is shut down. */
  exclusions: string[];
  onExclusionsChange: (ids: string[]) => void;
}

/**
 * Settings > General > Conflicting apps > "Manage". Lists every app the
 * service's catalog knows how to shut down, each with a toggle: on (the
 * default) means the startup shutdown ends it.
 *
 * Apps running right now are lifted into their own group at the top and
 * marked, so the common case - "close what is fighting Nexus on this PC" -
 * does not mean hunting the whole catalog for software the user never
 * installed.
 *
 * The list is opt-OUT: only the ids the user turned off are persisted, so an
 * app added to the catalog by a later service build is covered without the
 * client rewriting its stored list.
 */
export function ManageConflictAppsModal({
  open, onClose, autoShutdown, onAutoShutdownChange, exclusions, onExclusionsChange,
}: ManageConflictAppsModalProps) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ConflictCatalogApp[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  // The detected list drives the "running now" group only; subscribing just
  // while the modal is open keeps the socket topic off the settings page.
  const { conflicts } = useConflictApps(open);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setLoadFailed(false);
    let cancelled = false;
    fetchConflictCatalog().then(apps => {
      if (cancelled) return;
      // A failed read must not sit on "Loading" forever - the service can be
      // offline, and the row that opened this modal stays available.
      if (apps) setCatalog(apps);
      else setLoadFailed(true);
    });
    return () => { cancelled = true; };
  }, [open]);

  // A failed read leaves this null, which hides the section rather than
  // rendering toggles whose position is a guess.
  const [lighting, setLighting] = useState<WindowsDynamicLightingState | null>(null);
  // Writes race: each answers with a full re-read, so without a sequence the
  // slower of two quick toggles would land last and revert the newer one.
  const lightingRequest = useRef(0);

  useEffect(() => {
    if (!open) return;
    const seq = ++lightingRequest.current;
    fetchDynamicLighting().then(state => {
      if (seq === lightingRequest.current) setLighting(state);
    });
  }, [open]);

  const applyLighting = (body: SetWindowsDynamicLightingBody) => {
    const seq = ++lightingRequest.current;
    setDynamicLighting(body).then(state => {
      if (state && seq === lightingRequest.current) setLighting(state);
    });
  };

  const excluded = useMemo(() => new Set(exclusions), [exclusions]);
  const runningIds = useMemo(() => new Set(conflicts.map(c => c.id)), [conflicts]);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const byName = (a: ConflictCatalogApp, b: ConflictCatalogApp) => a.displayName.localeCompare(b.displayName);
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle.length === 0
      ? catalog
      : catalog.filter(a => a.displayName.toLocaleLowerCase().includes(needle));
    const running = matches.filter(a => runningIds.has(a.id)).sort(byName);
    const rest = matches.filter(a => !runningIds.has(a.id));

    const out: { key: string; label: string; running: boolean; apps: ConflictCatalogApp[] }[] = [];
    if (running.length > 0) {
      out.push({ key: 'running', label: t('settings.conflictApps.runningNow'), running: true, apps: running });
    }
    for (const category of CATEGORY_ORDER) {
      const apps = rest.filter(a => a.category === category).sort(byName);
      if (apps.length > 0) out.push({ key: category, label: t(CATEGORY_LABEL_KEYS[category]), running: false, apps });
    }
    const other = rest.filter(a => !CATEGORY_ORDER.includes(a.category as typeof CATEGORY_ORDER[number])).sort(byName);
    if (other.length > 0) {
      out.push({ key: 'other', label: t('settings.conflictApps.category.other'), running: false, apps: other });
    }
    return out;
  }, [catalog, runningIds, query, t]);

  const setEnabled = (id: string, enabled: boolean) => {
    const next = new Set(excluded);
    if (enabled) next.delete(id);
    else next.add(id);
    onExclusionsChange([...next]);
  };

  if (!open) return null;

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={t('settings.conflictApps.modal.title')}
      // Warning tone, not the modal's default accent tint: a conflict reads as
      // a warning everywhere else it appears (the badge, the onboarding screen).
      icon={<span className={styles.warnIcon}><AlertTriangle size={18} /></span>}
      large
    >
      <div className={styles.modal}>
        <SettingToggle
          label={t('settings.conflictApps.autoShutdown.label')}
          description={t('settings.conflictApps.autoShutdown.description')}
          checked={autoShutdown}
          onChange={onAutoShutdownChange}
          stackOnNarrow
        />

        {lighting?.available && lighting.deviceCount > 0 && (
          <SettingToggle
            label={t('settings.conflictApps.dynamicLighting.title')}
            description={t('settings.conflictApps.dynamicLighting.description')}
            checked={lighting.enabled}
            onChange={next => applyLighting({ enabled: next })}
            stackOnNarrow
          />
        )}

        <p className={styles.listIntro}>{t('settings.conflictApps.listIntro')}</p>

        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('settings.conflictApps.searchPlaceholder')}
        />

        {catalog === null ? (
          <p className={styles.empty}>
            {loadFailed ? t('settings.conflictApps.loadFailed') : t('settings.conflictApps.loading')}
          </p>
        ) : groups.length === 0 ? (
          <p className={styles.empty}>{t('settings.conflictApps.noMatches')}</p>
        ) : (
          <div className={styles.groups}>
            {groups.map(group => (
              <section
                key={group.key}
                className={group.running ? `${styles.group} ${styles.groupRunning}` : styles.group}
              >
                <h4 className={group.running ? `${styles.groupTitle} ${styles.groupTitleRunning}` : styles.groupTitle}>
                  {group.running && <AlertTriangle size={13} aria-hidden="true" />}
                  {group.label}
                </h4>
                <ul className={styles.list}>
                  {group.apps.map(app => (
                    <li
                      key={app.id}
                      className={group.running ? `${styles.appRow} ${styles.appRowRunning}` : styles.appRow}
                    >
                      <span className={styles.appName}>{app.displayName}</span>
                      <Toggle
                        checked={!excluded.has(app.id)}
                        onChange={next => setEnabled(app.id, next)}
                        ariaLabel={app.displayName}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </DeviceModal>
  );
}
