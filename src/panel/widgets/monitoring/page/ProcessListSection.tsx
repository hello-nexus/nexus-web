import { useMemo, useState, type ComponentType } from 'react';
import { MapPin, Mic, ScreenShare, Webcam } from 'lucide-react';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { Select } from '../../../../components/common/Select/Select';
import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../../lib/i18n';
import { useMonitoringPrivacy } from '../../../../hooks/useMonitoringPrivacy';
import { useAppIcon } from '../../common/AppPicker';
import { privacyIndicatorsForProcess, type PrivacyIconKind, type PrivacyIndicator } from './privacyHelpers';
import styles from './ProcessListSection.module.scss';

export interface ProcessListItem {
  name: string;
  color: string;
  current: number;
  values: number[];
  /** Optional inline secondary text after the value (e.g. GPU VRAM). */
  secondary?: string;
  /** UTC milliseconds the app was first observed running, when the data
   *  source reports it (the window-scoped apps endpoint) - drives the
   *  "recently launched" sort. Absent for the live per-metric fallback
   *  source, which has no notion of launch time. */
  startedAtMs?: number;
}

type SortMode = 'recent' | 'usage' | 'name';

/** Row icon: the same app-icon fetch/cache pipeline the deck's app-launch
 *  widget uses (useAppIcon - a Start-Menu/installed-app lookup keyed by
 *  name), falling back to the plain color dot when nothing resolves (most
 *  running processes were never added as a deck shortcut). Exported so the
 *  hero chart's hover tooltip (MetricHistorySection) can render the same
 *  icon treatment for its top-apps rows. */
export function ProcessIcon({ name, color }: { name: string; color: string }) {
  const iconUrl = useAppIcon(name);
  if (iconUrl) return <img src={iconUrl} className={styles.appIcon} alt="" />;
  return <span className={styles.dot} style={{ background: color }} />;
}

export interface ProcessListSectionProps {
  items: readonly ProcessListItem[];
  formatValue: (value: number) => string;
}

const SPARKLINE_SAMPLES = 30;

const PRIVACY_ICONS: Record<PrivacyIconKind, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  webcam: Webcam,
  microphone: Mic,
  location: MapPin,
  screen: ScreenShare,
};

function formatPrivacyTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

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

/** 'recent' ranks by startedAtMs (most recently launched first). A pair
 *  where either side lacks it falls back to the usage comparison, so a
 *  service that doesn't report launch times yet (or a fallback-sourced row)
 *  never renders a broken partial sort - the whole list degrades cleanly to
 *  the usage order. */
function compareItems(a: ProcessListItem, b: ProcessListItem, sort: SortMode): number {
  if (sort === 'name') return a.name.localeCompare(b.name);
  if (sort === 'recent') {
    if (a.startedAtMs !== undefined && b.startedAtMs !== undefined) return b.startedAtMs - a.startedAtMs;
    if (a.startedAtMs !== undefined) return -1;
    if (b.startedAtMs !== undefined) return 1;
  }
  return b.current - a.current;
}

/**
 * The live per-process list shown below the history hero chart, unified
 * across the cpu/memory/gpu/network tabs - one persistent instance whose
 * search/sort state survives a metric switch (data source and formatting
 * are the caller's concern via `items`/`formatValue`, scoped to whichever
 * metric is currently active). Search + sort over a flat row list, each row
 * an app icon (or the plain color dot when none resolves), privacy-access
 * icons (webcam/microphone/location/screen capture, when the service
 * reports one for that process), a mini sparkline, and the current value
 * (plus an optional secondary value).
 */
export function ProcessListSection({ items, formatValue }: ProcessListSectionProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const privacy = useMonitoringPrivacy(true);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? items.filter(i => i.name.toLowerCase().includes(needle)) : items;
    return [...filtered].sort((a, b) => compareItems(a, b, sort));
  }, [items, query, sort]);

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
      {visible.length === 0 ? (
        <div className={styles.empty}>{t('monitoring.ranked.empty')}</div>
      ) : (
        <div className={styles.rows}>
          {visible.map(item => (
            <div key={item.name} className={styles.row}>
              <ProcessIcon name={item.name} color={item.color} />
              <span className={styles.name}>{item.name}</span>
              <PrivacyIndicators
                indicators={privacy.supported && !privacy.error ? privacyIndicatorsForProcess(privacy.sessions, item.name, privacy.asOfMs) : []}
                t={t}
              />
              <Sparkline
                className={styles.sparkline}
                values={item.values}
                width={64}
                height={20}
                color={item.color}
                sampleCount={SPARKLINE_SAMPLES}
              />
              <span className={styles.value}>{formatValue(item.current)}</span>
              {item.secondary && <span className={styles.secondary}>{item.secondary}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
