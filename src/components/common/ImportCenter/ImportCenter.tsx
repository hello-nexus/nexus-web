import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Fan, LayoutDashboard, PlugZap } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { Spinner } from '../Spinner/Spinner';
import { SectionHeader } from '../SectionHeader/SectionHeader';
import { Toggle } from '../Toggle/Toggle';
import { FanControlImportSection, type FanControlImportHandle } from '../FanControlImport/FanControlImportSection';
import { Nexus2ImportSection, type Nexus2ImportHandle } from '../Nexus2WelcomeScreen/Nexus2ImportSection';
import type { ImportGroupId } from '../Nexus2WelcomeScreen/nexus2WelcomeUtils';
import { useFanControlStatus } from '../../../hooks/useFanControlStatus';
import { useNexus2WelcomeStatus } from '../../../hooks/useNexus2WelcomeStatus';
import styles from './ImportCenter.module.scss';

/** Apps Nexus can take a setup over from. Grow this by adding a case in `rowFor`. */
export type ImportSourceId = 'fancontrol' | 'nexus2';

/** 'needsReview': nothing ran; a fan curve list the user has not seen was about to import, so its panel was revealed instead. */
export type ImportOutcome = 'clean' | 'failed' | 'needsReview';

export interface ImportRunOptions {
  /** Nexus 2's fan curve list had not been seen when the press happened (read before any wait). */
  fanListUnseenAtPress?: boolean;
}

/** After a reveal, import presses are ignored this long, so a double tap cannot act on a list that only just appeared. */
const REVEAL_GUARD_MS = 600;

/** Lets a host drive the import from its own footer (both onboarding screens do). */
export interface ImportCenterHandle {
  /** Runs every included source in list order. 'clean' only when they all succeeded. */
  runImport: (options?: ImportRunOptions) => Promise<ImportOutcome>;
  /** True when Nexus 2 is listed and its fan curve list has not been seen yet. */
  fanListUnseen: () => boolean;
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
  /** Reports whether anything would be imported, so a host can label its own action. `settled` is false while an included source's preview is still loading, when the answer is not yet known. */
  onSelectionChange?: (hasSelection: boolean, settled: boolean) => void;
  /** False hides the built-in action for hosts that drive the import from their own footer. */
  showAction?: boolean;
  /** Receives the apply runner for hosts with showAction=false. */
  handleRef?: RefObject<ImportCenterHandle | null>;
  /** Fires after a run that reached at least one source, clean or not. */
  onImported?: () => void;
  /** Rendered inside a source's card, under its name. */
  rowFooter?: Partial<Record<ImportSourceId, ReactNode>>;
  /** Which sources start included. Defaults to every available one; a host
   *  that lists a source it is not offering passes false for it. */
  includedByDefault?: Partial<Record<ImportSourceId, boolean>>;
  /** Detection a host already holds. Given, it is authoritative for that
   *  source: a host that opened because an app was found must not then be
   *  told by a second read that it is missing. */
  detected?: Partial<Record<ImportSourceId, SourceDetection>>;
  /** Nexus 2 groups to leave out (the cooling fan curves when Cooling is off). */
  excludeNexus2Groups?: readonly ImportGroupId[];
}

/** What a host can hand over in place of this component's own detection. */
export interface SourceDetection {
  importAvailable: boolean;
  /** FanControl only: how many saved configurations were found. */
  configCount?: number;
}

/**
 * Every app a setup can come from, each with a switch deciding whether it is
 * included, beside the highlighted app's own flow. Each source owns its
 * preview and results; this owns the list and one run across them.
 */
export function ImportCenter({
  open, sources, disabled, onBusyChange, onSelectionChange, showAction = true, handleRef, onImported, detected,
  includedByDefault, rowFooter, excludeNexus2Groups,
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
  const revealGuardUntil = useRef(0);
  const listLabelId = useId();

  const available: Record<ImportSourceId, boolean> = {
    fancontrol: detected?.fancontrol?.importAvailable ?? fanControl.payload?.importAvailable === true,
    nexus2: detected?.nexus2?.importAvailable ?? nexus2.payload?.importAvailable === true,
  };
  // Until detection answers, a source is neither here nor missing; claiming
  // "not found" in that window shows an answer that is then taken back.
  const resolved: Record<ImportSourceId, boolean> = {
    fancontrol: detected?.fancontrol !== undefined || fanControl.status !== 'unknown',
    nexus2: detected?.nexus2 !== undefined || nexus2.status !== 'unknown',
  };

  // Re-read detection on every open, and drop the user's choices with it: the
  // app may have been installed since.
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
    // The mount fetch covers a surface that was already open then; any other
    // open needs a fresh read, for the sources this surface lists.
    const coveredByMount = !openedOnce.current && mountedOpen.current;
    openedOnce.current = true;
    if (!coveredByMount) {
      if (listsFanControl) refreshFanControl();
      if (listsNexus2) refreshNexus2();
    }
  }, [open, listsFanControl, listsNexus2, refreshFanControl, refreshNexus2]);

  // Every installed source is included by default: the common case is "bring
  // everything over", and an app that is not here can never be.
  const isIncluded = (id: ImportSourceId) => includeOverride[id] ?? includedByDefault?.[id] ?? available[id];
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

  const sourcesKey = sources.join(',');
  const runnable = (id: ImportSourceId) => isIncluded(id) && available[id] && sourceHasSelection[id] === true;
  const anyRunnable = sources.some(runnable);
  const settled = !sources.some(id => isIncluded(id) && available[id] && sourceHasSelection[id] === undefined);

  // `open` is a dependency so a host that resets its copy of this when a late
  // detection lands is told the current value again, not only on a change.
  useEffect(() => {
    if (!open) return;
    onSelectionChange?.(anyRunnable, settled);
  }, [open, anyRunnable, settled, sourcesKey, onSelectionChange]);

  // Guards on its own in-flight state only, never the host's `disabled`: a host
  // driving this from its own button sets that flag in the same tick, and
  // consulting it here would make the call a silent no-op.
  const runImport = async (options?: ImportRunOptions): Promise<ImportOutcome> => {
    if (busy) return 'failed';
    if (Date.now() < revealGuardUntil.current) return 'needsReview';
    const targets = sources.filter(runnable);
    if (targets.length === 0) return 'failed';
    // Fan curves are only imported once their list has been on screen; until
    // then a press brings it up instead of acting.
    if (targets.includes('nexus2') && nexus2Handle.current?.fanCurvesNeedReview(options?.fanListUnseenAtPress)) {
      setHighlightOverride('nexus2');
      revealGuardUntil.current = Date.now() + REVEAL_GUARD_MS;
      // Once the panel is showing: bring the group into view and restart the guard from the paint.
      requestAnimationFrame(() => {
        nexus2Handle.current?.revealFanCurves();
        revealGuardUntil.current = Date.now() + REVEAL_GUARD_MS;
      });
      return 'needsReview';
    }
    setBusy(true);
    onBusyChange?.(true);
    let allClean = true;
    // Sequential, not concurrent: list order decides who writes last where two
    // sources touch the same setting.
    for (const id of targets) {
      const outcome = id === 'fancontrol'
        ? await fanControlHandle.current?.runImport() ?? 'failed'
        : await nexus2Handle.current?.runImport() ?? 'failed';
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
  useImperativeHandle(handleRef, () => ({
    runImport,
    fanListUnseen: () => (nexus2Handle.current ? !nexus2Handle.current.fanListSeen() : false),
  }));

  const locked = busy || !!disabled;

  const notInstalled = (id: ImportSourceId) => (
    <EmptyState
      icon={<PlugZap size={EMPTY_ICON_SIZE} />}
      title={t('importCenter.notFound.title', { app: t(`importCenter.source.${id}`) })}
      hint={t(`importCenter.notFound.hint.${id}`)}
    />
  );

  // Same pick as `current` below, known early so each panel can be told
  // whether it is the one on screen.
  const currentId = sources.find(id => id === highlightOverride)
    ?? sources.find(id => available[id] || !resolved[id])
    ?? sources[0];

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
      icon: <LayoutDashboard size={SOURCE_ICON_SIZE} />,
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
            visible={currentId === 'nexus2'}
            excludeGroups={excludeNexus2Groups}
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
        <SectionHeader className={styles.columnTitle}>
          <span id={listLabelId}>{t('importCenter.appsTitle')}</span>
        </SectionHeader>
        {/* A group, not a radiogroup: each row also carries an include switch,
            which a radiogroup cannot own. */}
        <div className={styles.sourceList} role="group" aria-labelledby={listLabelId}>
          {rows.map(row => (
            <div
              key={row.id}
              className={`${styles.sourceRow} ${row.id === current.id ? styles.sourceRowActive : ''}`}
            >
              {/* The whole card selects the app; the include switch sits over it
                  as a sibling, since one control cannot nest inside another. */}
              <button
                type="button"
                className={styles.sourceMain}
                aria-current={row.id === current.id ? 'true' : undefined}
                onClick={() => setHighlightOverride(row.id)}
              >
                <span className={styles.sourceLine}>
                  <span className={`${styles.sourceIcon} ${row.available ? '' : styles.sourceIconOff}`} aria-hidden>
                    {row.icon}
                  </span>
                  <span className={styles.sourceText}>
                    <span className={styles.sourceName}>{row.name}</span>
                    {/* Only when it explains something the name cannot: why an
                        app cannot be imported, or that it is still unknown. */}
                    {!row.available && <span className={styles.sourceStatus}>{row.status}</span>}
                  </span>
                </span>
                {rowFooter?.[row.id] && (
                  <span className={`${styles.sourceFooter} ${isIncluded(row.id) ? '' : styles.sourceFooterOff}`}>
                    {rowFooter[row.id]}
                  </span>
                )}
              </button>
              <Toggle
                className={styles.sourceToggle}
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
        <SectionHeader className={styles.columnTitle}>{t('importCenter.settingsTitle')}</SectionHeader>
        {/* Every source stays mounted: one can be included without being
            looked at, and its flow holds the preview and the runner. */}
        {rows.map(row => (
          <div
            key={row.id}
            className={`${styles.sourcePanel} ${isIncluded(row.id) ? '' : styles.sourcePanelOff}`}
            hidden={row.id !== current.id}
          >
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
              onClick={() => runImport()}
            >
              {t('importCenter.action')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
