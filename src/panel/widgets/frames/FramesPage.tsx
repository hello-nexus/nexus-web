import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Compass, Film, Gamepad2, Trash2, Users } from 'lucide-react';
import { EpicIcon, SteamIcon } from '../../../components/icons/PlatformIcons';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Card } from '../../../components/common/Card/Card';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { Badge } from '../../../components/common/Badge/Badge';
import { Button } from '../../../components/common/Button/Button';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { Spinner } from '../../../components/common/Spinner/Spinner';
import { StatTile } from '../../../components/common/StatTile/StatTile';
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
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { hour12OptionFor, localizeNumbers, type NumberFormat, type TimeFormat } from '../../../lib/units';
import type { FpsEstimateConfidence, FpsTableGameItem } from '../../../types/fps-estimates';
import styles from './FramesPage.module.scss';

const SESSIONS_LIMIT = 50;
// The service's own fps scalar series retention (see the FPS benchmarks
// plan) - a session ending before this has no timeline left to fetch.
const HISTORY_RETENTION_DAYS = 7;
// Discover's resolution chips, in the cloud's resClass form; the first is
// the default, being the fleet's most common class.
const DISCOVER_RESOLUTIONS = ['1920x1080', '2560x1440', '3440x1440', '3840x2160'] as const;

type FramesTab = 'history' | 'discover';

interface FramesPageProps {
  tab: string | null;
  onTabChange: (tab: string) => void;
}

/**
 * Frames: the local FPS history browser. A History tab (every game with
 * sessions) leading into a per-game detail (stats, sessions, the selected
 * session's own timeline), plus a Discover tab for community FPS estimates
 * on this rig. Page-only: registered in app/pageOnlyApps.ts, no panel tile.
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
    { key: 'history', label: t('frames.tab.history'), icon: <Film size={14} /> },
    { key: 'discover', label: t('frames.tab.discover'), icon: <Compass size={14} /> },
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

  return (
    <Card interactive onClick={onOpen} className={styles.gameCard} compact>
      <div className={styles.gameCardArt}>
        <GameArt
          gameKey={game.gameKey}
          imgClass={styles.gameCardImg}
          iconClass={styles.gameCardIcon}
          placeholder={<ArtPlaceholder />}
        />
      </div>
      <div className={styles.gameCardBody}>
        <div className={styles.gameCardName}>{game.name}</div>
        <div className={styles.gameCardAvg}>
          <span className={styles.gameCardAvgValue}>{Math.round(game.avgFps)}</span>
          <span className={styles.gameCardAvgUnit}>{t('frames.card.fpsUnit')}</span>
          <StoreMark store={game.store} />
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
  const [res, setRes] = useState<string>(DISCOVER_RESOLUTIONS[0]);
  const [search, setSearch] = useState('');
  const { status, games } = useFpsEstimates(res);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? games.filter(g => g.title.toLowerCase().includes(q)) : games;
  }, [games, search]);

  const resolutionChips = DISCOVER_RESOLUTIONS.map(r => ({ key: r, label: formatResClass(r) }));

  return (
    <div className={styles.discover}>
      <div className={styles.toolbar}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('frames.discover.searchPlaceholder')}
          className={styles.searchInput}
        />
        <ChipGroup
          options={resolutionChips}
          activeKey={res}
          onChange={setRes}
          ariaLabel={t('frames.discover.resolution')}
        />
        {status === 'ready' && (
          <div className={styles.count}>
            {filtered.length === games.length
              ? t('steam.library.count', { count: filtered.length })
              : t('steam.library.countFiltered', { count: filtered.length, total: games.length })}
          </div>
        )}
      </div>
      {status === 'loading' && (
        <div className={styles.emptyWrap}>
          <Spinner size={28} />
        </div>
      )}
      {status === 'unresolved' && (
        <div className={styles.emptyWrap}>
          <EmptyState icon={<Users size={28} />} title={t('frames.discover.unavailable')} />
        </div>
      )}
      {status === 'empty' && (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon={<Users size={28} />}
            title={t('frames.discover.empty.title')}
            hint={t('frames.discover.empty.hint')}
          />
        </div>
      )}
      {status === 'ready' && (filtered.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState compact title={t('steam.library.noMatch', { query: search })} />
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {filtered.map(game => (
            <DiscoverGameCard key={game.gameKey} game={game} requestedRes={res} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Cover art with a two-step fallback: whatever the service resolves first, then
 * the installed executable's icon when that fails to load (a legacy store url
 * is a guess and 404s for anything published after Valve moved art behind a
 * content hash), then the caller's own placeholder.
 *
 * Icon or capsule is decided from what actually loaded rather than the store,
 * since a steam game can end up on the icon too: a roughly square image is
 * contained and centred, a wide one fills the frame.
 */
// Below this an image is square enough to be an icon rather than a capsule.
const SQUARE_ART_RATIO = 1.3;

/** The store a game came from, as its own mark; unknown stores keep the text badge. */
function StoreMark({ store }: { store: string }) {
  const key = store.toLowerCase();
  if (key !== 'steam' && key !== 'epic') return <Badge label={store} />;
  return (
    <span className={styles.gameCardStore} title={store} aria-label={store} role="img">
      {key === 'steam' ? <SteamIcon size={16} /> : <EpicIcon size={16} />}
    </span>
  );
}

function GameArt({ gameKey, imgClass, iconClass, placeholder }: {
  gameKey: string;
  imgClass: string;
  iconClass: string;
  placeholder: ReactNode;
}) {
  const [stage, setStage] = useState<'store' | 'icon' | 'failed'>('store');
  const [square, setSquare] = useState(false);

  if (stage === 'failed') return <>{placeholder}</>;

  return (
    <img
      key={stage}
      className={square ? iconClass : imgClass}
      src={fpsGameArtUrl(gameKey, stage === 'icon')}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={e => {
        const img = e.currentTarget;
        setSquare(img.naturalHeight > 0 && img.naturalWidth / img.naturalHeight < SQUARE_ART_RATIO);
      }}
      onError={() => setStage(stage === 'store' ? 'icon' : 'failed')}
    />
  );
}

function formatResClass(resClass: string): string {
  return resClass.replace(/^(\d+)x(\d+)$/, '$1×$2');
}

/** A game with no art at all: the controller glyph on the same ground the icon fallback uses. */
function ArtPlaceholder() {
  return (
    <div className={styles.gameCardPlaceholder} aria-hidden="true">
      <Gamepad2 size={48} strokeWidth={1.5} />
    </div>
  );
}

const CONFIDENCE_BARS: Record<FpsEstimateConfidence, number> = { low: 1, medium: 2, high: 3 };

/** Three signal bars, filled to the confidence tier and coloured with it; the tier name is the accessible label. */
function ConfidenceMark({ confidence }: { confidence: FpsEstimateConfidence }) {
  const { t } = useTranslation();
  const filled = CONFIDENCE_BARS[confidence] ?? 1;
  return (
    <span
      className={`${styles.confidence} ${styles[`confidence_${confidence}`] ?? ''}`}
      role="img"
      aria-label={t(`frames.discover.confidence.${confidence}`)}
      title={t(`frames.discover.confidence.${confidence}`)}
    >
      {[1, 2, 3].map(bar => (
        <span key={bar} className={bar <= filled ? styles.confidenceBarOn : styles.confidenceBar} />
      ))}
    </span>
  );
}

function DiscoverGameCard({ game, requestedRes }: { game: FpsTableGameItem; requestedRes: string }) {
  const { t } = useTranslation();
  // The resolution the figure was measured at: the chip's own unless the
  // cloud fell back to the nearest class with data.
  const measuredRes = game.resBasis ?? requestedRes;
  const fellBack = measuredRes !== requestedRes;

  return (
    <Card compact className={styles.gameCard}>
      <div className={styles.gameCardArt}>
        <GameArt
          gameKey={game.gameKey}
          imgClass={styles.gameCardImg}
          iconClass={styles.gameCardIcon}
          placeholder={<ArtPlaceholder />}
        />
      </div>
      <div className={styles.gameCardBody}>
        <div className={styles.gameCardName} title={game.title}>{game.title}</div>
        <div className={styles.gameCardAvg}>
          <span className={styles.gameCardAvgValue}>{Math.round(game.avg)}</span>
          <span className={styles.gameCardAvgUnit}>{t('frames.card.fpsUnit')}</span>
          <span className={styles.gameCardAvgRes}>{`@ ${formatResClass(measuredRes)}`}</span>
        </div>
        <div className={styles.gameCardSecondary}>
          <span className={styles.gameCardSecondaryValue}>{Math.round(game.p1)}</span>
          <span className={styles.gameCardSecondaryLabel}>{t('steam.stat.fps1pctLow')}</span>
          <span className={styles.gameCardSecondaryValue}>{Math.round(game.p99)}</span>
          <span className={styles.gameCardSecondaryLabel}>{t('steam.stat.fps99th')}</span>
        </div>
        <div className={styles.discoverBasis}>
          <ConfidenceMark confidence={game.confidence} />
          <span className={styles.discoverBasisText}>
            {t(`frames.discover.level.${game.level}`)}
            {fellBack && ` · ${t('frames.discover.resBasis', { res: formatResClass(requestedRes) })}`}
          </span>
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
