import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Card } from '../../../components/common/Card/Card';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Badge } from '../../../components/common/Badge/Badge';
import { Button } from '../../../components/common/Button/Button';
import { StatTile } from '../../../components/common/StatTile/StatTile';
import { SystemSpecsPanel } from '../../../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { TimeSeriesChart } from '../../../components/common/TimeSeriesChart/TimeSeriesChart';
import {
  fetchFpsGameSessions,
  getFpsTrackingStatus,
  type FpsGameSummary,
  type FpsSession,
} from '../../../api/fps';
import { fetchMonitoringHistory } from '../../../api/monitoringHistory';
import { useFpsGames } from '../../../hooks/useFpsGames';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { hour12OptionFor, localizeNumbers, type NumberFormat, type TimeFormat } from '../../../lib/units';
import styles from './FramesPage.module.scss';

const SESSIONS_LIMIT = 50;
// The service's own fps scalar series retention (see the FPS benchmarks
// plan) - a session ending before this has no timeline left to fetch.
const HISTORY_RETENTION_DAYS = 7;

type FramesTab = 'library' | 'rig';

interface FramesPageProps {
  tab: string | null;
  onTabChange: (tab: string) => void;
}

/**
 * Frames: the local FPS history browser. A games library leading into a
 * per-game detail (stats, sessions, the selected session's own timeline),
 * plus a Rig tab for the rig-estimate placeholder. Page-only - see
 * panel/widgets/frames/index.ts.
 */
export function FramesPage({ tab, onTabChange }: FramesPageProps) {
  const { t } = useTranslation();
  const activeTab: FramesTab = tab === 'rig' ? 'rig' : 'library';
  // Any tab value besides 'library'/'rig' is a deep-linked gameKey (see
  // framesNav.ts, used by the Steam page's own FPS chip).
  const selectedGameKey = tab && tab !== 'library' && tab !== 'rig' ? tab : null;

  const { supported, gamesByKey } = useFpsGames();
  const games = useMemo(() => [...gamesByKey.values()], [gamesByKey]);

  const [trackingEnabled, setTrackingEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getFpsTrackingStatus().then(s => { if (!cancelled && s) setTrackingEnabled(s.enabled); });
    return () => { cancelled = true; };
  }, []);

  const tabs = [
    { key: 'library', label: t('frames.tab.library') },
    { key: 'rig', label: t('frames.tab.rig') },
  ];

  return (
    <div className={styles.app}>
      <ViewHeader title={t('panel.widget.frames')} tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      <div className={`${styles.body} pageBody`}>
        {activeTab === 'rig' ? (
          <RigTab />
        ) : selectedGameKey ? (
          <GameDetail
            gameKey={selectedGameKey}
            summary={gamesByKey.get(selectedGameKey)}
            onBack={() => onTabChange('library')}
          />
        ) : (
          <LibraryTab
            games={games}
            supported={supported}
            trackingEnabled={trackingEnabled}
            onOpenGame={onTabChange}
          />
        )}
      </div>
    </div>
  );
}

function formatHours(focusedSec: number, numberFormat: NumberFormat): string {
  const hours = focusedSec / 3600;
  return localizeNumbers(`${hours.toFixed(hours < 10 ? 1 : 0)}h`, numberFormat);
}

function LibraryTab({
  games,
  supported,
  trackingEnabled,
  onOpenGame,
}: {
  games: FpsGameSummary[];
  supported: boolean;
  trackingEnabled: boolean | null;
  onOpenGame: (gameKey: string) => void;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? games.filter(g => g.name.toLowerCase().includes(q)) : games;
    return [...base].sort((a, b) => b.lastPlayedUtcMs - a.lastPlayedUtcMs);
  }, [games, search]);

  if (!supported) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState icon={<Gamepad2 size={28} />} title={t('frames.unsupported')} />
      </div>
    );
  }

  if (trackingEnabled === false) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState
          icon={<Gamepad2 size={28} />}
          title={t('frames.trackingOff.title')}
          hint={t('frames.trackingOff.hint')}
        />
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState icon={<Gamepad2 size={28} />} title={t('frames.empty.title')} hint={t('frames.empty.hint')} />
      </div>
    );
  }

  return (
    <div className={styles.library}>
      <div className={styles.toolbar}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('steam.library.searchPlaceholder')}
          className={styles.searchInput}
        />
        <div className={styles.count}>
          {filtered.length === games.length
            ? t('steam.library.count', { count: filtered.length })
            : t('steam.library.countFiltered', { count: filtered.length, total: games.length })}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState compact title={t('steam.library.noMatch', { query: search })} />
        </div>
      ) : (
        <ul className={styles.rows}>
          {filtered.map(g => (
            <li key={g.gameKey}>
              <button type="button" className={styles.row} onClick={() => onOpenGame(g.gameKey)}>
                <span className={styles.rowName}>{g.name}</span>
                <Badge label={g.store} />
                <span className={styles.rowStat}>{t('steam.fps.sessionAvg', { value: Math.round(g.avgFps) })}</span>
                <span className={styles.rowStat}>{t('steam.stat.fps1pctLow')} {Math.round(g.p1Fps)}</span>
                <span className={styles.rowStat}>{t('steam.stat.fps99th')} {Math.round(g.p99Fps)}</span>
                <span className={styles.rowStat}>{formatHours(g.focusedSec, numberFormat)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GameDetail({
  gameKey,
  summary,
  onBack,
}: {
  gameKey: string;
  summary?: FpsGameSummary;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { numberFormat, timeFormat } = useUnitPrefs();
  const [sessions, setSessions] = useState<FpsSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSessions([]);
    setSelectedSessionId(null);
    fetchFpsGameSessions(gameKey, SESSIONS_LIMIT).then(r => {
      if (cancelled || !r) return;
      setSessions(r.sessions);
      setSelectedSessionId(r.sessions[0]?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [gameKey]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null;
  const title = summary?.name ?? gameKey;

  return (
    <div className={styles.detail}>
      <div className={styles.detailTopBar}>
        <Button size="sm" tone="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>
          {t('steam.action.back')}
        </Button>
        <h2 className={styles.detailTitle}>{title}</h2>
      </div>

      {summary && (
        <section className={styles.statsRow}>
          <StatTile label={t('steam.stat.fpsAvg')} value={`${Math.round(summary.avgFps)}`} />
          <StatTile label={t('steam.stat.fps1pctLow')} value={`${Math.round(summary.p1Fps)}`} />
          <StatTile label={t('steam.stat.fps99th')} value={`${Math.round(summary.p99Fps)}`} />
          <StatTile label={t('frames.stat.sessions')} value={`${summary.sessions}`} />
          <StatTile label={t('frames.stat.hours')} value={formatHours(summary.focusedSec, numberFormat)} />
        </section>
      )}

      <div className={styles.detailColumns}>
        <Card title={t('frames.stat.sessions')} className={styles.detailCol}>
          {sessions.length === 0 ? (
            <EmptyState compact title={t('frames.drill.noSessions')} />
          ) : (
            <ul className={styles.sessionList}>
              {sessions.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={s.id === selectedSessionId ? `${styles.sessionRow} ${styles.sessionRowActive}` : styles.sessionRow}
                    onClick={() => setSelectedSessionId(s.id)}
                  >
                    <span className={styles.sessionMain}>
                      <span>{formatSessionDate(s.startedUtcMs, timeFormat)}</span>
                      <span className={styles.sessionMeta}>
                        {`${s.dispW}×${s.dispH} @ ${s.refreshHz} Hz · ${formatDurationMinutes(s.focusedSec)}`}
                      </span>
                    </span>
                    <span className={styles.sessionStats}>
                      <span>{t('steam.fps.sessionAvg', { value: Math.round(s.avgFps) })}</span>
                      <span>{t('steam.stat.fps1pctLow')} {Math.round(s.p1Fps)}</span>
                      {!s.fullscreen && <Badge label={t('frames.session.windowed')} />}
                      {s.capped && <Badge label={t('steam.fps.capped')} />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('frames.drill.timeline')} className={styles.detailCol}>
          {selectedSession ? (
            <SessionTimeline session={selectedSession} numberFormat={numberFormat} timeFormat={timeFormat} />
          ) : (
            <EmptyState compact title={t('frames.drill.noSessions')} />
          )}
        </Card>
      </div>
    </div>
  );
}

function SessionTimeline({
  session,
  numberFormat,
  timeFormat,
}: {
  session: FpsSession;
  numberFormat: NumberFormat;
  timeFormat: TimeFormat;
}) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<{ t: number; avg: number; max: number }[] | null>(null);
  const [tooOld, setTooOld] = useState(false);

  useEffect(() => {
    const isTooOld = Date.now() - session.endedUtcMs > HISTORY_RETENTION_DAYS * 86_400_000;
    setTooOld(isTooOld);
    if (isTooOld) {
      setPoints(null);
      return;
    }
    let cancelled = false;
    setPoints(null);
    fetchMonitoringHistory({ from: session.startedUtcMs, to: session.endedUtcMs, series: 'fps' }).then(r => {
      if (cancelled) return;
      const series = r.data?.series.find(s => s.kind === 'fps');
      setPoints(series?.points ?? []);
    });
    return () => { cancelled = true; };
  }, [session.id, session.startedUtcMs, session.endedUtcMs]);

  if (tooOld) {
    return <EmptyState compact title={t('frames.timeline.tooOld')} />;
  }
  if (points === null) {
    return null;
  }
  if (points.length === 0) {
    return <EmptyState compact title={t('frames.timeline.noData')} />;
  }

  return (
    <TimeSeriesChart
      // eslint-disable-next-line i18next/no-literal-string -- internal series id + CSS variable token, not prose
      series={[{ id: 'fps', name: 'FPS', color: 'var(--accent)', points }]}
      height={200}
      domain={[session.startedUtcMs, session.endedUtcMs]}
      valueFormat={v => localizeNumbers(`${Math.round(v)} fps`, numberFormat)}
      xTickFormat={t2 => new Date(t2).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) })}
      avgLabel={t('monitoring.history.avg')}
      maxLabel={t('monitoring.history.max')}
      showLegend={false}
      fillGradient
    />
  );
}

function RigTab() {
  const { t } = useTranslation();
  const { specs } = useSystemSpecs(true);

  const rows = specs
    ? [
        { label: t('devices.specs.row.processor'), value: specs.processor },
        { label: t('devices.specs.row.graphicsCard'), value: specs.graphicsCard },
        { label: t('devices.specs.row.memory'), value: specs.memory },
        { label: t('devices.specs.row.monitor'), value: specs.monitor },
      ]
    : [];

  return (
    <div className={styles.rig}>
      <Card title={t('frames.rig.title')}>
        <SystemSpecsPanel rows={rows} loading={!specs} />
      </Card>
      <div className={styles.emptyWrap}>
        <EmptyState title={t('frames.rig.estimatesComingSoon')} />
      </div>
    </div>
  );
}

function formatDurationMinutes(focusedSec: number): string {
  const minutes = Math.round(focusedSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatSessionDate(unixMs: number, timeFormat: TimeFormat): string {
  const d = new Date(unixMs);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) });
  return `${datePart}, ${timePart}`;
}
