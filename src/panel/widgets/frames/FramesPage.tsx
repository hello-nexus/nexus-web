import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Film, Trash2, Users } from 'lucide-react';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Card } from '../../../components/common/Card/Card';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { Badge } from '../../../components/common/Badge/Badge';
import { Button } from '../../../components/common/Button/Button';
import { StatTile } from '../../../components/common/StatTile/StatTile';
import { SystemSpecsPanel } from '../../../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { TimeSeriesChart } from '../../../components/common/TimeSeriesChart/TimeSeriesChart';
import { fpsGameArtUrl,
  deleteFpsGame,
  deleteFpsSession,
  fetchFpsGameSessions,
  getFpsTrackingStatus,
  type FpsGameSummary,
  type FpsSession,
} from '../../../api/fps';
import { fetchMonitoringHistory } from '../../../api/monitoringHistory';
import { useFpsEstimates } from '../../../hooks/useFpsEstimates';
import { useFpsGames } from '../../../hooks/useFpsGames';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { hour12OptionFor, localizeNumbers, type NumberFormat, type TimeFormat } from '../../../lib/units';
import type { FpsTableGameItem } from '../../../types/fps-estimates';
import styles from './FramesPage.module.scss';

const SESSIONS_LIMIT = 50;
// The service's own fps scalar series retention (see the FPS benchmarks
// plan) - a session ending before this has no timeline left to fetch.
const HISTORY_RETENTION_DAYS = 7;

type FramesTab = 'history' | 'discover';

interface FramesPageProps {
  tab: string | null;
  onTabChange: (tab: string) => void;
}

/**
 * Frames: the local FPS history browser. A History tab (every game with
 * sessions) leading into a per-game detail (stats, sessions, the selected
 * session's own timeline), plus a Discover tab for community FPS estimates
 * on this rig. Page-only - see panel/widgets/frames/index.ts.
 */
export function FramesPage({ tab, onTabChange }: FramesPageProps) {
  const { t } = useTranslation();
  const activeTab: FramesTab = tab === 'discover' ? 'discover' : 'history';
  // Any tab value besides 'history'/'discover' is a deep-linked gameKey (see
  // framesNav.ts, used by the Steam page's own FPS chip).
  const selectedGameKey = tab && tab !== 'history' && tab !== 'discover' ? tab : null;

  const { supported, gamesByKey, refetch: refetchGames } = useFpsGames();
  const games = useMemo(() => [...gamesByKey.values()], [gamesByKey]);

  const [trackingEnabled, setTrackingEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getFpsTrackingStatus().then(s => { if (!cancelled && s) setTrackingEnabled(s.enabled); });
    return () => { cancelled = true; };
  }, []);

  const tabs = [
    { key: 'history', label: t('frames.tab.history') },
    { key: 'discover', label: t('frames.tab.discover') },
  ];

  return (
    <div className={styles.app}>
      <ViewHeader title={t('panel.widget.frames')} tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      <div className={`${styles.body} pageBody`}>
        {activeTab === 'discover' ? (
          <DiscoverTab />
        ) : selectedGameKey ? (
          <GameDetail
            gameKey={selectedGameKey}
            summary={gamesByKey.get(selectedGameKey)}
            onBack={() => onTabChange('history')}
            onGamesChanged={refetchGames}
          />
        ) : (
          <HistoryTab
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

function formatLastPlayed(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function HistoryTab({
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
        <EmptyState icon={<Film size={28} />} title={t('frames.unsupported')} />
      </div>
    );
  }

  if (trackingEnabled === false) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState
          icon={<Film size={28} />}
          title={t('frames.trackingOff.title')}
          hint={t('frames.trackingOff.hint')}
        />
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState icon={<Film size={28} />} title={t('frames.empty.title')} hint={t('frames.empty.hint')} />
      </div>
    );
  }

  return (
    <div className={styles.history}>
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
        <div className={styles.cardGrid}>
          {filtered.map(g => (
            <GameCard key={g.gameKey} game={g} numberFormat={numberFormat} onOpen={() => onOpenGame(g.gameKey)} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({
  game,
  numberFormat,
  onOpen,
}: {
  game: FpsGameSummary;
  numberFormat: NumberFormat;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [artFailed, setArtFailed] = useState(false);
  // A store capsule fills the frame; an executable icon is square and small, so
  // it sits centred on the placeholder ground instead of being stretched.
  const isCapsule = game.store === 'steam';

  return (
    <Card interactive onClick={onOpen} className={styles.gameCard} compact>
      <div className={styles.gameCardArt}>
        {!artFailed ? (
          <img
            className={isCapsule ? styles.gameCardImg : styles.gameCardIcon}
            src={fpsGameArtUrl(game.gameKey)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <div className={styles.gameCardPlaceholder}>
            <Badge label={game.store} />
          </div>
        )}
      </div>
      <div className={styles.gameCardBody}>
        <div className={styles.gameCardName}>{game.name}</div>
        <Badge label={game.store} />
        <div className={styles.gameCardAvg}>
          <span className={styles.gameCardAvgValue}>{Math.round(game.avgFps)}</span>
          <span className={styles.gameCardAvgUnit}>{t('frames.card.fpsUnit')}</span>
        </div>
        <div className={styles.gameCardSecondary}>
          <span className={styles.gameCardSecondaryValue}>{Math.round(game.p1Fps)}</span>
          <span className={styles.gameCardSecondaryLabel}>{t('steam.stat.fps1pctLow')}</span>
        </div>
        <div className={styles.gameCardMeta}>
          <span>{formatHours(game.focusedSec, numberFormat)}</span>
          <span>{formatLastPlayed(game.lastPlayedUtcMs)}</span>
        </div>
      </div>
    </Card>
  );
}

function GameDetail({
  gameKey,
  summary,
  onBack,
  onGamesChanged,
}: {
  gameKey: string;
  summary?: FpsGameSummary;
  onBack: () => void;
  onGamesChanged: () => void;
}) {
  const { t } = useTranslation();
  const { numberFormat, timeFormat } = useUnitPrefs();
  const [sessions, setSessions] = useState<FpsSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const confirmDeleteSession = async () => {
    if (!pendingDeleteSessionId || deleting) return;
    setDeleting(true);
    await deleteFpsSession(pendingDeleteSessionId);
    setDeleting(false);
    const remaining = sessions.filter(s => s.id !== pendingDeleteSessionId);
    setSessions(remaining);
    setSelectedSessionId(prev => (prev === pendingDeleteSessionId ? remaining[0]?.id ?? null : prev));
    setPendingDeleteSessionId(null);
    onGamesChanged();
    if (remaining.length === 0) onBack();
  };

  const confirmDeleteAllSessions = async () => {
    if (deleting) return;
    setDeleting(true);
    await deleteFpsGame(gameKey);
    setDeleting(false);
    setConfirmDeleteAll(false);
    onGamesChanged();
    onBack();
  };

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null;
  const title = summary?.name ?? gameKey;

  return (
    <div className={styles.detail}>
      <div className={styles.detailTopBar}>
        <Button size="sm" tone="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>
          {t('steam.action.back')}
        </Button>
        <h2 className={styles.detailTitle}>{title}</h2>
        <Button
          size="sm"
          tone="danger"
          icon={<Trash2 size={14} />}
          onClick={() => setConfirmDeleteAll(true)}
          disabled={sessions.length === 0}
        >
          {t('frames.drill.deleteAll')}
        </Button>
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
        <div className={styles.sessionsCol}>
          <SectionHeader>{t('frames.stat.sessions')}</SectionHeader>
          {sessions.length === 0 ? (
            <EmptyState compact title={t('frames.drill.noSessions')} />
          ) : (
            <div className={styles.sessionScroller}>
              {sessions.map(s => (
                <Card
                  key={s.id}
                  compact
                  onClick={() => setSelectedSessionId(s.id)}
                  // Pins the card's own accessible name so it can't absorb
                  // the nested delete button's aria-label.
                  ariaLabel={formatSessionDate(s.startedUtcMs, timeFormat)}
                  className={s.id === selectedSessionId ? `${styles.sessionCard} ${styles.sessionCardActive}` : styles.sessionCard}
                >
                  <div className={styles.sessionRow}>
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
                    <Button
                      size="sm"
                      tone="ghost"
                      icon={<Trash2 size={14} />}
                      aria-label={t('frames.session.deleteAria')}
                      onClick={e => { e.stopPropagation(); setPendingDeleteSessionId(s.id); }}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card title={t('frames.drill.timeline')} className={styles.detailCol}>
          {selectedSession ? (
            <SessionTimeline session={selectedSession} numberFormat={numberFormat} timeFormat={timeFormat} />
          ) : (
            <EmptyState compact title={t('frames.drill.noSessions')} />
          )}
        </Card>
      </div>

      <ConfirmModal
        open={pendingDeleteSessionId !== null}
        title={t('frames.session.deleteConfirmTitle')}
        message={t('frames.session.deleteConfirmMessage')}
        confirmLabel={t('frames.session.deleteAria')}
        confirmDisabled={deleting}
        onConfirm={() => void confirmDeleteSession()}
        onCancel={() => setPendingDeleteSessionId(null)}
      />
      <ConfirmModal
        open={confirmDeleteAll}
        title={t('frames.drill.deleteAllConfirmTitle', { name: title })}
        message={t('frames.drill.deleteAllConfirmMessage')}
        confirmLabel={t('frames.drill.deleteAll')}
        confirmDisabled={deleting}
        onConfirm={() => void confirmDeleteAllSessions()}
        onCancel={() => setConfirmDeleteAll(false)}
      />
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
      valueFormat={v => localizeNumbers(`${Math.round(v)} FPS`, numberFormat)}
      xTickFormat={t2 => new Date(t2).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) })}
      avgLabel={t('monitoring.history.avg')}
      maxLabel={t('monitoring.history.max')}
      showLegend={false}
      fillGradient
    />
  );
}

function DiscoverTab() {
  const { t } = useTranslation();
  const { specs } = useSystemSpecs(true);
  const { status, games, resClass } = useFpsEstimates();

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
      {status === 'empty' && (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon={<Users size={28} />}
            title={t('frames.discover.empty.title')}
            hint={t('frames.discover.empty.hint')}
          />
        </div>
      )}
      {status === 'ready' && (
        <div className={styles.discover}>
          <SectionHeader>{t('frames.discover.title')}</SectionHeader>
          <div className={styles.cardGrid}>
            {games.map(game => (
              <DiscoverGameCard key={game.gameKey} game={game} ownResClass={resClass} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatResClass(resClass: string): string {
  return resClass.replace(/^(\d+)x(\d+)$/, '$1×$2');
}

function DiscoverGameCard({ game, ownResClass }: { game: FpsTableGameItem; ownResClass: string | null }) {
  const { t } = useTranslation();
  const [artFailed, setArtFailed] = useState(false);
  const isCapsule = game.steamAppId !== null;
  const showResBasis = !!game.resBasis && game.resBasis !== ownResClass;

  return (
    <Card compact className={styles.gameCard}>
      <div className={styles.gameCardArt}>
        {!artFailed ? (
          <img
            className={isCapsule ? styles.gameCardImg : styles.gameCardIcon}
            src={fpsGameArtUrl(game.gameKey)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <div className={styles.gameCardPlaceholder} aria-hidden="true">
            <Film size={20} />
          </div>
        )}
      </div>
      <div className={styles.gameCardBody}>
        <div className={styles.gameCardName}>{game.title}</div>
        <div className={styles.gameCardAvg}>
          <span className={styles.gameCardAvgValue}>{Math.round(game.avg)}</span>
          <span className={styles.gameCardAvgUnit}>{t('frames.card.fpsUnit')}</span>
        </div>
        <div className={styles.gameCardSecondary}>
          <span className={styles.gameCardSecondaryValue}>{Math.round(game.p1)}</span>
          <span className={styles.gameCardSecondaryLabel}>{t('steam.stat.fps1pctLow')}</span>
          <span className={styles.gameCardSecondaryValue}>{Math.round(game.p99)}</span>
          <span className={styles.gameCardSecondaryLabel}>{t('steam.stat.fps99th')}</span>
        </div>
        <div className={styles.discoverMeta}>
          <Badge label={t(`frames.discover.confidence.${game.confidence}`)} />
          <span className={styles.discoverLevel}>{t(`frames.discover.level.${game.level}`)}</span>
        </div>
        <div className={styles.discoverBasedOn}>
          {t('frames.discover.basedOn', { count: game.installs })}
          {showResBasis && ` · ${t('frames.discover.resBasis', { res: formatResClass(game.resBasis as string) })}`}
        </div>
      </div>
    </Card>
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
