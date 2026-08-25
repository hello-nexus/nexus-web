import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Fan, LayoutGrid, PlugZap } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { Spinner } from '../Spinner/Spinner';
import { Toggle } from '../Toggle/Toggle';
import { FanControlImportSection, type FanControlImportHandle } from '../FanControlImport/FanControlImportSection';
import { Nexus2ImportSection, type Nexus2ImportHandle } from '../Nexus2WelcomeScreen/Nexus2ImportSection';
import { useFanControlStatus } from '../../../hooks/useFanControlStatus';
import { useNexus2WelcomeStatus } from '../../../hooks/useNexus2WelcomeStatus';
import styles from './ImportCenter.module.scss';

/** Apps Nexus can take a setup over from. Grow this by adding a case in `rowFor`. */
export type ImportSourceId = 'fancontrol' | 'nexus2';

export type ImportOutcome = 'clean' | 'failed';

/** Lets a host drive the import from its own footer (both onboarding screens do). */
export interface ImportCenterHandle {
  /** Runs every included source in list order. 'clean' only when they all succeeded. */
  runImport: () => Promise<ImportOutcome>;
}

/** One app's row in the left column, and what it shows on the right. */
interface SourceRow {
  id: ImportSourceId;
  name: string;
  icon: ReactNode;
  /** False when the app is not on this PC: the row still lists, and says why. */
  available: boolean;
  /** One line under the name: what was found, or why nothing can come over. */
  status: string;
  /** Rendered on the right while this row is the highlighted one. */
  panel: ReactNode;
}

const SOURCE_ICON_SIZE = 20;
const EMPTY_ICON_SIZE = 28;
const SPINNER_SIZE = 20;

export interface ImportCenterProps {
  /** Fetches each source's preview on every falsy-to-truthy edge. */
  open: boolean;
  /** Which apps to offer, in list order. An app with nothing to import still lists. */
  sources: ImportSourceId[];
  /** Blocks every control while a caller-owned flow is also in flight. */
  disabled?: boolean;
  /** Fires on every busy-state transition, so a host can gate its own actions. */
  onBusyChange?: (busy: boolean) => void;
  /** Reports whether anything would be imported, so a host can label its own action. */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** False hides the built-in action for hosts that drive the import from their own footer. */
  showAction?: boolean;
  /** Receives the apply runner for hosts with showAction=false. */
  handleRef?: RefObject<ImportCenterHandle | null>;
  /** Fires after a run that reached at least one source, clean or not. */
  onImported?: () => void;
  /** Detection a host already holds. Given, it is authoritative for that
   *  source: a host that opened because an app was found must not then be
   *  told by a second read that it is missing. */
  detected?: Partial<Record<ImportSourceId, SourceDetection>>;
}

/** What a host can hand over in place of this component's own detection. */
export interface SourceDetection {
  importAvailable: boolean;
  /** FanControl only: how many saved configurations were found. */
  configCount?: number;
}

/**
 * Every app a setup can come from, listed with a switch deciding whether it is
 * included, beside the highlighted app's own flow. An app that is not
 * installed still gets a row, greyed, with the reason.
 *
 * Each source owns its preview, category switches and results; this owns the
 * list, the include switches, and one run across them.
 */
export function ImportCenter({
  open, sources, disabled, onBusyChange, onSelectionChange, showAction = true, handleRef, onImported, detected,
}: ImportCenterProps) {
  const { t, language } = useTranslation();
  const fanControl = useFanControlStatus();
  const nexus2 = useNexus2WelcomeStatus();
  // Both null until the user touches them, so the defaults below (highlight
  // and include everything installed) follow detection as it resolves instead
  // of latching whatever was known on the first render.
  const [highlightOverride, setHighlightOverride] = useState<ImportSourceId | null>(null);
  // Only the sources the user has actually decided on. A source left alone
  // keeps following detection, so one that answers late is still included.
  const [includeOverride, setIncludeOverride] = useState<Partial<Record<ImportSourceId, boolean>>>({});
  // Per-source: whether that section currently has any category selected.
  const [sourceHasSelection, setSourceHasSelection] = useState<Partial<Record<ImportSourceId, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const fanControlHandle = useRef<FanControlImportHandle | null>(null);
  const nexus2Handle = useRef<Nexus2ImportHandle | null>(null);
  const listLabelId = useId();

  const available: Record<ImportSourceId, boolean> = {
    fancontrol: detected?.fancontrol?.importAvailable ?? fanControl.payload?.importAvailable === true,
    nexus2: detected?.nexus2?.importAvailable ?? nexus2.payload?.importAvailable === true,
  };
  // Detection is a request, so until it answers a source is neither here nor
  // missing; claiming "not found" in that window shows the wrong answer and
  // then takes it back. A host-supplied answer needs no waiting.
  const resolved: Record<ImportSourceId, boolean> = {
    fancontrol: detected?.fancontrol !== undefined || fanControl.status !== 'unknown',
    nexus2: detected?.nexus2 !== undefined || nexus2.status !== 'unknown',
  };

  // Re-read detection on every open: the user may have just installed the app
  // this is asking about. Also drops both overrides, so a reopened surface
  // starts from the defaults rather than the last visit's choices.
  const { refresh: refreshFanControl } = fanControl;
  const { refresh: refreshNexus2 } = nexus2;
  // Whether the hooks' mount fetch already covers the first open.
  const mountedOpen = useRef(open);
  const openedOnce = useRef(false);
  const listsFanControl = sources.includes('fancontrol') && detected?.fancontrol === undefined;
  const listsNexus2 = sources.includes('nexus2') && detected?.nexus2 === undefined;
  useEffect(() => {
    if (!open) return;
    setHighlightOverride(null);
    setIncludeOverride({});
    setSourceHasSelection({});
    // The hooks fetch once on mount, which covers a surface that was already
    // open then; every other open needs a fresh read, since the user may have
    // installed the app since. Only what this surface lists is re-read.
    const coveredByMount = !openedOnce.current && mountedOpen.current;
    openedOnce.current = true;
    if (!coveredByMount) {
      if (listsFanControl) refreshFanControl();
      if (listsNexus2) refreshNexus2();
    }
  }, [open, listsFanControl, listsNexus2, refreshFanControl, refreshNexus2]);

  // Every installed source is included by default: the common case is "bring
  // everything over", and an app that is not here can never be.
  const isIncluded = (id: ImportSourceId) => includeOverride[id] ?? available[id];
  const setIncluded = (id: ImportSourceId, next: boolean) => {
    setIncludeOverride(prev => ({ ...prev, [id]: next }));
  };
  const checking = <div className={styles.checking}><Spinner size={SPINNER_SIZE} /></div>;

  // Stable per source: each section re-runs its selection effect whenever this
  // identity changes, which an inline closure does on every render.
  const noteFanControlSelection = useCallback((has: boolean) => {
    setSourceHasSelection(prev => (prev.fancontrol === has ? prev : { ...prev, fancontrol: has }));
  }, []);
  const noteNexus2Selection = useCallback((has: boolean) => {
    setSourceHasSelection(prev => (prev.nexus2 === has ? prev : { ...prev, nexus2: has }));
  }, []);

  const runnable = (id: ImportSourceId) => isIncluded(id) && available[id] && sourceHasSelection[id] === true;
  const anyRunnable = sources.some(runnable);

  useEffect(() => {
    onSelectionChange?.(anyRunnable);
  }, [anyRunnable, onSelectionChange]);

  // Guards on its own in-flight state only, never the host's `disabled`: a host
  // driving this from its own button sets that flag in the same tick, and
  // consulting it here would make the call a silent no-op.
  const runImport = async (): Promise<ImportOutcome> => {
    if (busy) return 'failed';
    const targets = sources.filter(runnable);
    if (targets.length === 0) return 'failed';
    setBusy(true);
    onBusyChange?.(true);
    let allClean = true;
    // Sequential, not concurrent: list order decides who writes last where two
    // sources touch the same setting.
    for (const id of targets) {
      const handle = id === 'fancontrol' ? fanControlHandle.current : nexus2Handle.current;
      const outcome = handle ? await handle.runImport() : 'failed';
      if (outcome !== 'clean') allClean = false;
    }
    setBusy(false);
    onBusyChange?.(false);
    // Not gated on success: a run that half-applied still changed what the
    // host is showing, so it has to refetch either way.
    onImported?.();
    return allClean ? 'clean' : 'failed';
  };

  // No dep list: the handle must always close over the latest selection state.
  useImperativeHandle(handleRef, () => ({ runImport }));

  const locked = busy || !!disabled;

  const notInstalled = (id: ImportSourceId) => (
    <EmptyState
      icon={<PlugZap size={EMPTY_ICON_SIZE} />}
      title={t('importCenter.notFound.title', { app: t(`importCenter.source.${id}`) })}
      hint={t(`importCenter.notFound.hint.${id}`)}
    />
  );

  const rowFor = (id: ImportSourceId): SourceRow => {
    if (id === 'fancontrol') {
      const count = detected?.fancontrol?.configCount ?? fanControl.payload?.configs.length ?? 0;
      return {
        id,
        name: t('importCenter.source.fancontrol'),
        icon: <Fan size={SOURCE_ICON_SIZE} />,
        available: available.fancontrol,
        status: !resolved.fancontrol
          ? t('importCenter.source.checking')
          : available.fancontrol
            ? t(pluralKey('importCenter.source.fancontrol.found', language, count), { count })
            : t('importCenter.source.missing'),
        panel: !resolved.fancontrol
          ? checking
          : available.fancontrol
          ? (
            <FanControlImportSection
              open={open}
              configs={fanControl.payload?.configs ?? []}
              disabled={locked}
              showAction={false}
              onSelectionChange={noteFanControlSelection}
              handleRef={fanControlHandle}
              wide
            />
          )
          : notInstalled(id),
      };
    }
    return {
      id,
      name: t('importCenter.source.nexus2'),
      icon: <LayoutGrid size={SOURCE_ICON_SIZE} />,
      available: available.nexus2,
      status: !resolved.nexus2
        ? t('importCenter.source.checking')
        : available.nexus2 ? t('importCenter.source.ready') : t('importCenter.source.missing'),
      panel: !resolved.nexus2
        ? checking
        : available.nexus2
        ? (
          <Nexus2ImportSection
            open={open}
            disabled={locked}
            showAction={false}
            onSelectionChange={noteNexus2Selection}
            handleRef={nexus2Handle}
            wide
          />
        )
        : notInstalled(id),
    };
  };

  const rows = sources.map(rowFor);
  if (rows.length === 0) return null;
  // Highlight the first app that actually has something, so the panel is not
  // an empty state while an installed one sits further down the list.
  const current = rows.find(r => r.id === highlightOverride)
    ?? rows.find(r => r.available || !resolved[r.id])
    ?? rows[0];

  return (
    <div className={styles.body}>
      <div className={styles.sourceColumn}>
        <span className={styles.sourceHeader} id={listLabelId}>{t('importCenter.sourceLabel')}</span>
        {/* A group, not a radiogroup: each row also carries an include switch,
            which a radiogroup cannot own. `aria-current` marks the shown one. */}
        <div className={styles.sourceList} role="group" aria-labelledby={listLabelId}>
          {rows.map(row => (
            <div
              key={row.id}
              className={`${styles.sourceRow} ${row.id === current.id ? styles.sourceRowActive : ''}`}
            >
              <button
                type="button"
                className={styles.sourceMain}
                aria-current={row.id === current.id ? 'true' : undefined}
                onClick={() => setHighlightOverride(row.id)}
              >
                <span className={`${styles.sourceIcon} ${row.available ? '' : styles.sourceIconOff}`} aria-hidden>
                  {row.icon}
                </span>
                <span className={styles.sourceText}>
                  <span className={styles.sourceName}>{row.name}</span>
                  <span className={styles.sourceStatus}>{row.status}</span>
                </span>
              </button>
              <Toggle
                checked={isIncluded(row.id)}
                disabled={!row.available || locked}
                ariaLabel={t('importCenter.include', { app: row.name })}
                onChange={next => setIncluded(row.id, next)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.panel}>
        {/* Every source stays mounted, not just the highlighted one: a source
            can be included without ever being looked at, and its flow is what
            holds the preview and the runner that an import needs. */}
        {rows.map(row => (
          <div key={row.id} className={styles.sourcePanel} hidden={row.id !== current.id}>
            {row.panel}
          </div>
        ))}
        {showAction && (
          <div className={styles.footer}>
            <Button
              tone="neutral"
              size="sm"
              loading={busy}
              loadingHidesLabel
              disabled={!anyRunnable || locked}
              onClick={runImport}
            >
              {t('importCenter.action')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
