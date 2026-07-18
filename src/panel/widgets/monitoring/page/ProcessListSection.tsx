import { memo, useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { Select } from '../../../../components/common/Select/Select';
import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Badge } from '../../../../components/common/Badge/Badge';
import { useTranslation } from '../../../../lib/i18n';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';
import { PRIVACY_ICONS, formatPrivacyTime, privacyIndicatorsForProcess, type PrivacyIndicator } from './privacyHelpers';
import { useStableRanking } from './useStableRanking';
import { ProcessIcon } from './ProcessIcon';
import type { RankableItem, SortMode } from './processRanking';
import styles from './ProcessListSection.module.scss';

export interface ProcessListItem extends RankableItem {
  values: number[];
  /** Optional inline secondary text after the value (e.g. GPU VRAM). */
  secondary?: string;
  /** Foreground/windowed app vs background process (round 5 item 5) - drives
   *  the Apps/Background processes grouping. Undefined (a service that
   *  doesn't report it yet) renders under Background processes. */
  isApp?: boolean;
  /** Company/signer name, rendered dimmed after the process name (round 5
   *  item 6). null once resolution completes with no signer found;
   *  undefined while unresolved or unreported - both render nothing. */
  publisher?: string | null;
  signed?: 'signed' | 'unsigned' | 'unknown';
}

export type { SortMode };

export interface ProcessListSectionProps {
  items: readonly ProcessListItem[];
  formatValue: (value: number) => string;
  /** Changes exactly when the item list's source meaningfully changes (a
   *  metric switch, a real window/viewport change, or a data-source swap
   *  between the live fallback and the window-scoped apps endpoint) - the
   *  trigger for a full re-rank. Omit for a list that never changes source
   *  (e.g. a fixture in a standalone story or test). */
  rankResetKey?: string;
  /** True when `items` is a frozen snapshot rather than live data - dims the
   *  list and shows a disclosure that the breakdown reflects live values
   *  only, not the scrubbed window (see MonitoringPage's freeze-on-detach
   *  handling for the fallback data source). */
  frozen?: boolean;
  /** Called with the clicked/activated row's process name. MonitoringPage
   *  owns the selection state and renders the process-detail panel as an
   *  inline sibling column - this component only reports the interaction,
   *  it no longer mounts the panel itself. */
  onSelectProcess: (name: string) => void;
  /** MonitoringPage's own selectedProcess - the matching row (by name) below
   *  renders in an active state. Null/omitted highlights nothing. */
  selectedProcessName?: string | null;
  /** Privacy-access sessions for the row icons (webcam/microphone/location/
   *  screen capture) - sourced once at the page level (MonitoringPage) and
   *  shared with the process-detail panel rather than polled again here. */
  privacySessions?: readonly PrivacySession[];
  privacyAsOfMs?: number;
  showPrivacy?: boolean;
  /** Non-null while a point-in-time snapshot (a click on the hero chart) is
   *  pinned - the % VALUE column then reflects each app's value at this
   *  exact timestamp rather than the live/window-average value. Shows a
   *  dismissible "snapshot @ time" affordance; null/omitted renders none. */
  snapshotAtMs?: number | null;
  /** Clears the pinned snapshot - required whenever snapshotAtMs is set. */
  onClearSnapshot?: () => void;
  /** Reserves the row's own VALUE column at this width (ROW_VALUE_RATE_MIN_WIDTH
   *  in tabChipValue.ts, chosen by the caller's active tab) so a digit-count
   *  change in the formatted value (a network/storage byte rate especially)
   *  never grows the column and shifts the sparkline after it. Omit to keep
   *  the column's own default width. */
  valueMinWidth?: string;
}

// Exported so appWindowHelpers.ts's flat-history fallback can size itself to
// match - a shorter flat array would let this component's own left-zero-pad
// (values.length < sampleCount) draw a fake ramp instead of a flat line.
export const SPARKLINE_SAMPLES = 30;

// Stable identity for a caller that omits privacySessions - a fresh `[]`
// literal as the destructuring default would recreate itself every render,
// defeating ProcessRow's own memo comparator (prev.privacySessions ===
// next.privacySessions) for every row, not just the ones that changed.
const EMPTY_PRIVACY_SESSIONS: readonly PrivacySession[] = [];

/** A process row's privacy-access icons: one per PrivacyIndicator, each a
 *  non-actionable informational glyph (role="img" + tabIndex so hover AND
 *  keyboard focus both open the HoverTooltip, matching DiagnosticsWidget's
 *  status-dot pattern) rather than a <button>, since nothing happens on
 *  activation. Active sessions render accented, sessions that only ended
 *  within the last hour render dimmed. */
function PrivacyIndicators({ indicators, t }: {
  indicators: readonly PrivacyIndicator[];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (indicators.length === 0) return null;
  return (
    <span className={styles.privacyIcons}>
      {indicators.map(indicator => {
        const Icon = PRIVACY_ICONS[indicator.kind];
        const title = indicator.kind === 'screen'
          ? t('monitoring.privacy.icon.screen')
          : t(`monitoring.privacy.capability.${indicator.kind}`);
        // The 'screen' kind collapses two distinct capabilities, so each of
        // its lines names which one; the other kinds are already unambiguous
        // from the title above.
        const showCapabilityPerLine = indicator.kind === 'screen';
        const body = (
          <>
            {indicator.sessions.map((s, i) => (
              <span key={i}>
                {showCapabilityPerLine && `${t(`monitoring.privacy.capability.${s.capability}`)} `}
                {s.end === null
                  ? t('monitoring.privacy.since', { time: formatPrivacyTime(s.start) })
                  : t('monitoring.privacy.until', { time: formatPrivacyTime(s.end) })}
                {i < indicator.sessions.length - 1 && <br />}
              </span>
            ))}
          </>
        );
        const stateClass = indicator.state === 'active' ? styles.privacyIconActive : styles.privacyIconRecent;
        return (
          <HoverTooltip key={indicator.kind} title={title} body={body} side="top">
            <span className={`${styles.privacyIcon} ${stateClass}`} role="img" aria-label={title} tabIndex={0}>
              <Icon size={12} aria-hidden />
            </span>
          </HoverTooltip>
        );
      })}
    </span>
  );
}

function sameValues(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface ProcessRowProps {
  item: ProcessListItem;
  formatValue: (value: number) => string;
  onSelect: (name: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  privacySessions: readonly PrivacySession[];
  privacyAsOfMs: number;
  showPrivacy: boolean;
  selected: boolean;
  valueMinWidth?: string;
}

// A live 1Hz tick reconstructs every row's data fresh (see MonitoringPage's
// reconcileLiveWithWindow), so most props are new objects every render even
// when their content is unchanged - a custom comparator (rather than plain
// React.memo's reference check) is what actually skips a row whose CPU/mem/
// GPU value hasn't moved between ticks, which is the common case for the
// majority of near-idle processes in a several-hundred-row list.
function rowPropsEqual(prev: ProcessRowProps, next: ProcessRowProps): boolean {
  return prev.item.name === next.item.name
    && prev.item.current === next.item.current
    && prev.item.secondary === next.item.secondary
    && prev.item.startedAtMs === next.item.startedAtMs
    && prev.item.publisher === next.item.publisher
    && prev.item.signed === next.item.signed
    && sameValues(prev.item.values, next.item.values)
    && prev.formatValue === next.formatValue
    && prev.onSelect === next.onSelect
    && prev.t === next.t
    && prev.privacySessions === next.privacySessions
    && prev.privacyAsOfMs === next.privacyAsOfMs
    && prev.showPrivacy === next.showPrivacy
    && prev.selected === next.selected
    && prev.valueMinWidth === next.valueMinWidth;
}

const ProcessRow = memo(function ProcessRow({
  item, formatValue, onSelect, t, privacySessions, privacyAsOfMs, showPrivacy, selected, valueMinWidth,
}: ProcessRowProps) {
  return (
    <div
      className={selected ? `${styles.row} ${styles.rowSelected}` : styles.row}
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      aria-label={t('monitoring.history.process.openDetails', { name: item.name })}
      onClick={() => onSelect(item.name)}
      onKeyDown={e => {
        // Only react to a keypress on the row itself - a nested focusable
        // descendant (a privacy indicator icon) handles its own Enter/Space
        // and must not also select the process via bubbling. Same guard as
        // Card.tsx's own onKeyDown.
        if (e.target !== e.currentTarget) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onSelect(item.name);
      }}
    >
      <ProcessIcon name={item.name} />
      <span className={styles.nameGroup}>
        <span className={styles.name}>{item.name}</span>
        {item.publisher && <span className={styles.publisher}>{item.publisher}</span>}
        {/* Shares ProcessDetailPanel's "Unsigned" badge/key (same displayed
            word) - update both call sites together if either copy changes. */}
        {item.signed === 'unsigned' && <Badge label={t('monitoring.processDetail.info.unsigned')} color="var(--warn)" />}
      </span>
      <PrivacyIndicators
        indicators={showPrivacy ? privacyIndicatorsForProcess(privacySessions, item.name, privacyAsOfMs) : []}
        t={t}
      />
      <Sparkline
        className={styles.sparkline}
        values={item.values}
        width={64}
        height={20}
        sampleCount={SPARKLINE_SAMPLES}
        fillOnly
      />
      <span
        className={styles.value}
        style={valueMinWidth ? ({ '--row-value-min-width': valueMinWidth } as CSSProperties) : undefined}
      >
        {formatValue(item.current)}
      </span>
      {item.secondary && <span className={styles.secondary}>{item.secondary}</span>}
      <ChevronRight className={styles.openChevron} size={14} aria-hidden />
    </div>
  );
}, rowPropsEqual);

/**
 * The live per-process list shown below the history hero chart, unified
 * across the cpu/memory/gpu/network tabs - one persistent instance whose
 * search/sort state survives a metric switch (data source and formatting
 * are the caller's concern via `items`/`formatValue`, scoped to whichever
 * metric is currently active). Search + sort over a flat row list, each row
 * an app icon (or a plain neutral dot when none resolves), privacy-access
 * icons (webcam/microphone/location/screen capture, when the service
 * reports one for that process), a mini sparkline, and the current value
 * (plus an optional secondary value). The chevron affordance appears on
 * hover/focus so the resting list stays visually quiet.
 *
 * Row order is rank-stable (see useStableRanking/processRanking): a value
 * update alone never reorders or drops a row, so the list doesn't visibly
 * jump around while the user is watching it.
 *
 * Clicking (or activating via keyboard) a row reports its name upward via
 * onSelectProcess - MonitoringPage owns the selection and renders
 * ProcessDetailPanel as an inline sibling column beside this list, so this
 * component itself never mounts the detail panel.
 *
 * Task-Manager-style Apps/Background processes grouping (round 5 item 5):
 * `visible` is partitioned by `isApp` AFTER search and stable ranking, via a
 * plain `.filter()` that preserves each side's relative order from the
 * single already-ranked/frozen array - never a second ranking pass, so the
 * frozen-order guarantee holds independently within each group. An empty
 * group renders no header.
 */
function formatSnapshotTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function ProcessListSection({
  items, formatValue, rankResetKey = '', frozen = false, onSelectProcess,
  privacySessions = EMPTY_PRIVACY_SESSIONS, privacyAsOfMs = 0, showPrivacy = false, snapshotAtMs, onClearSnapshot,
  selectedProcessName = null, valueMinWidth,
}: ProcessListSectionProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');

  const ranked = useStableRanking(items, sort, rankResetKey);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? ranked.filter(i => i.name.toLowerCase().includes(needle)) : ranked;
  }, [ranked, query]);

  // Missing isApp (a service that doesn't report it yet) renders as
  // background - graceful until the field ships everywhere.
  const appRows = useMemo(() => visible.filter(i => i.isApp === true), [visible]);
  const backgroundRows = useMemo(() => visible.filter(i => i.isApp !== true), [visible]);

  const sortOptions = [
    { value: 'recent', label: t('monitoring.history.process.sortRecent') },
    { value: 'usage', label: t('monitoring.history.process.sortUsage') },
    { value: 'name', label: t('monitoring.history.process.sortName') },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('monitoring.history.process.searchPlaceholder')}
        />
        <Select
          value={sort}
          onChange={v => setSort(v as SortMode)}
          options={sortOptions}
          ariaLabel={t('monitoring.history.process.sortAriaLabel')}
        />
      </div>
      {snapshotAtMs != null && (
        <div className={styles.snapshotBadge}>
          <span>{t('monitoring.history.process.snapshotAt', { time: formatSnapshotTime(snapshotAtMs) })}</span>
          <button
            type="button"
            className={styles.snapshotClear}
            onClick={onClearSnapshot}
            aria-label={t('monitoring.history.process.clearSnapshot')}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      )}
      {frozen && <div className={styles.frozenNotice}>{t('monitoring.history.process.frozenNotice')}</div>}
      {visible.length === 0 ? (
        <div className={styles.empty}>{t('monitoring.ranked.empty')}</div>
      ) : (
        <div className={frozen ? `${styles.rows} ${styles.rowsFrozen}` : styles.rows}>
          {appRows.length > 0 && (
            <div className={styles.groupHeader}>{t('monitoring.history.process.group.apps')}</div>
          )}
          {appRows.map(item => (
            <ProcessRow
              key={item.name}
              item={item}
              formatValue={formatValue}
              onSelect={onSelectProcess}
              t={t}
              privacySessions={privacySessions}
              privacyAsOfMs={privacyAsOfMs}
              showPrivacy={showPrivacy}
              selected={item.name === selectedProcessName}
              valueMinWidth={valueMinWidth}
            />
          ))}
          {backgroundRows.length > 0 && (
            <div className={styles.groupHeader}>{t('monitoring.history.process.group.background')}</div>
          )}
          {backgroundRows.map(item => (
            <ProcessRow
              key={item.name}
              item={item}
              formatValue={formatValue}
              onSelect={onSelectProcess}
              t={t}
              privacySessions={privacySessions}
              privacyAsOfMs={privacyAsOfMs}
              showPrivacy={showPrivacy}
              selected={item.name === selectedProcessName}
              valueMinWidth={valueMinWidth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
