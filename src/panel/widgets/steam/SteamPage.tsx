import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Newspaper, Play, Users } from 'lucide-react';
import {
  fetchSteamAchievements,
  fetchSteamAppDetails,
  fetchSteamCurrentPlayers,
  fetchSteamFriends,
  fetchSteamGlobalAchievements,
  fetchSteamNews,
  fetchSteamOwnedGames,
  fetchSteamProfile,
  fetchSteamStatus,
  fetchSteamUserStats,
  launchSteam,
  type SteamAchievement,
  type SteamAppDetails,
  type SteamFriendSummary,
  type SteamNewsItem,
  type SteamOwnedGame,
  type SteamPlayerSummary,
  type SteamStatusResponse,
  type SteamUserStat,
} from '../../../api/steam';
import { Button } from '../../../components/common/Button/Button';
import { Card } from '../../../components/common/Card/Card';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Select } from '../../../components/common/Select/Select';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { SteamLogo } from './SteamLogo';
import styles from './SteamPage.module.scss';

type SortKey = 'recent' | 'playtime' | 'name';
type ViewState = { kind: 'entry' } | { kind: 'drill'; appId: number; name: string };

const PROFILE_POLL_MS = 15_000;
const LISTS_POLL_MS = 30_000;
const DRILL_LIVE_POLL_MS = 30_000;
const NEWS_BATCH_LIMIT = 6;

// Tile grid layout constants. Tile width is FIXED in pixels — the
// grid doesn't scale individual cards to fit the container; it just
// fits as many fixed-size columns as will go. Every card renders at
// exactly the same dimensions regardless of viewport width.
// Aspect comes from Steam's capsule_231x87 (231x87 = ~2.66:1) — the
// rectangular landscape capsule everyone wanted.
const TILE_WIDTH_PX = 220;
const TILE_GAP_PX = 14;
const TILE_META_HEIGHT_PX = 44;
const TILE_IMAGE_ASPECT_H_OVER_W = 87 / 231;
// Strict "only what's visible": don't render tiles outside the viewport.
// With OVERSCAN_ROWS=0 the browser never starts fetching header images
// for off-screen tiles — the only network requests in flight at any
// moment are for the tiles actually visible.
const OVERSCAN_ROWS = 0;

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'playtime', label: 'Total playtime' },
  { value: 'name', label: 'A–Z' },
] as const;

/**
 * Desktop "app page" for the Steam widget. Standard page chrome
 * (ViewHeader + body) followed by either the library-first entry
 * view or the per-game drilldown. Reuses Storybook common components
 * (SearchInput, Select, Button, Card, EmptyState) throughout — no
 * raw inputs / selects / button styling.
 *
 * Per the app-page convention (see ClockPage), the title comes from
 * the app manifest's i18nKey (`panel.widget.steam`), not a dedicated
 * `nav.steam` entry.
 */
export function SteamPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SteamStatusResponse | null>(null);
  const [profile, setProfile] = useState<SteamPlayerSummary | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [ownedGames, setOwnedGames] = useState<SteamOwnedGame[]>([]);
  const [friends, setFriends] = useState<SteamFriendSummary[]>([]);
  const [recentNews, setRecentNews] = useState<SteamNewsItem[]>([]);
  const [view, setView] = useState<ViewState>({ kind: 'entry' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const currentGame = useMemo(() => {
    const appId = Number(profile?.gameId);
    if (!profile?.gameExtraInfo || !Number.isFinite(appId) || appId <= 0) return null;
    return { appId, name: profile.gameExtraInfo };
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      const nextStatus = await fetchSteamStatus();
      if (cancelled || !nextStatus) return;
      setStatus(nextStatus);
      if (!nextStatus.ready) return;
      const profileResponse = await fetchSteamProfile();
      if (cancelled || !profileResponse || profileResponse.error) return;
      setProfile(profileResponse.profile ?? null);
      setLevel(profileResponse.level ?? null);
    }
    loadProfile();
    const timer = window.setInterval(loadProfile, PROFILE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!status?.ready) return;
    let cancelled = false;
    async function loadLists() {
      const [owned, friendsList] = await Promise.all([
        fetchSteamOwnedGames(),
        fetchSteamFriends(),
      ]);
      if (cancelled) return;
      if (owned) setOwnedGames(owned);
      if (friendsList) setFriends(friendsList);
    }
    loadLists();
    const timer = window.setInterval(loadLists, LISTS_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [status?.ready]);

  // Stable signature of the top-N news-source app ids so the news
  // effect doesn't re-fire just because `ownedGames` got a fresh array
  // reference from the 30s list poll. Only when the actual top-N
  // set changes do we re-fetch.
  const newsTopAppIdsKey = useMemo(() => {
    if (ownedGames.length === 0) return '';
    const top = [...ownedGames]
      .sort((a, b) => (b.playtime2Weeks ?? 0) - (a.playtime2Weeks ?? 0) || b.playtimeForever - a.playtimeForever)
      .slice(0, NEWS_BATCH_LIMIT)
      .map(g => g.appId);
    return top.join(',');
  }, [ownedGames]);

  useEffect(() => {
    if (!status?.ready || newsTopAppIdsKey.length === 0) return;
    const appIds = newsTopAppIdsKey.split(',').map(Number);
    let cancelled = false;
    Promise.all(appIds.map(id => fetchSteamNews(id, 2, 200).then(items => items ?? []))).then(perGame => {
      if (cancelled) return;
      const merged = perGame.flat().sort((a, b) => b.date - a.date).slice(0, 8);
      setRecentNews(merged);
    });
    return () => { cancelled = true; };
  }, [status?.ready, newsTopAppIdsKey]);

  const handleOpenDrill = useCallback((appId: number, name: string) => {
    setView({ kind: 'drill', appId, name });
  }, []);
  const handleBack = useCallback(() => setView({ kind: 'entry' }), []);

  return (
    <div className={styles.app}>
      <ViewHeader title={t('panel.widget.steam')} />
      <div className={styles.body}>
        {!status?.ready ? (
          <EmptyState
            icon={<SteamLogo size={40} />}
            title="Steam not configured"
            hint={status?.reason || 'Add a Steam Web API key in the Steam widget settings.'}
          />
        ) : (
          <>
            <ProfileStrip profile={profile} level={level} currentGame={currentGame} />
            {view.kind === 'entry' ? (
              <EntryView
                ownedGames={ownedGames}
                friends={friends}
                news={recentNews}
                currentGame={currentGame}
                search={search}
                setSearch={setSearch}
                sort={sort}
                setSort={setSort}
                onOpenGame={handleOpenDrill}
              />
            ) : (
              <DrillView
                appId={view.appId}
                fallbackName={view.name}
                friends={friends}
                ownedGames={ownedGames}
                onBack={handleBack}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProfileStrip({
  profile,
  level,
  currentGame,
}: {
  profile: SteamPlayerSummary | null;
  level: number | null;
  currentGame: { appId: number; name: string } | null;
}) {
  return (
    <div className={styles.profileStrip}>
      {profile?.avatarFull ? (
        <img className={styles.avatar} src={profile.avatarFull} alt="" />
      ) : (
        <div className={styles.avatarFallback}><SteamLogo size={24} /></div>
      )}
      <div className={styles.profileText}>
        <div className={styles.profileName}>{profile?.personaName || 'Steam'}</div>
        <div className={styles.profileStatus}>
          <PersonaDot state={profile?.personaState} />
          <span>{personaStatusLabel(profile?.personaState)}</span>
          {currentGame && <span className={styles.profilePlaying}>· Playing {currentGame.name}</span>}
        </div>
      </div>
      {level !== null && <div className={styles.level}>{level}</div>}
    </div>
  );
}

function EntryView({
  ownedGames,
  friends,
  news,
  currentGame,
  search,
  setSearch,
  sort,
  setSort,
  onOpenGame,
}: {
  ownedGames: SteamOwnedGame[];
  friends: SteamFriendSummary[];
  news: SteamNewsItem[];
  currentGame: { appId: number; name: string } | null;
  search: string;
  setSearch: (s: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  onOpenGame: (appId: number, name: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? ownedGames.filter(g => g.name.toLowerCase().includes(q)) : ownedGames;
    const sorted = [...base];
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'playtime') {
      sorted.sort((a, b) => b.playtimeForever - a.playtimeForever);
    } else {
      sorted.sort((a, b) => (b.playtime2Weeks ?? 0) - (a.playtime2Weeks ?? 0) || b.playtimeForever - a.playtimeForever);
    }
    return sorted;
  }, [ownedGames, search, sort]);

  const onlineFriends = useMemo(() => friends.filter(f => f.personaState !== 0).slice(0, 12), [friends]);

  return (
    <div className={styles.entryGrid}>
      <main className={styles.libraryPane}>
        <div className={styles.libraryToolbar}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search library"
            className={styles.searchInput}
          />
          <Select
            value={sort}
            onChange={v => setSort(v as SortKey)}
            options={SORT_OPTIONS}
            ariaLabel="Sort library"
            size="sm"
          />
          <div className={styles.libraryCount}>
            {filtered.length === ownedGames.length
              ? `${filtered.length} games`
              : `${filtered.length} of ${ownedGames.length}`}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className={styles.libraryEmptyWrap}>
            <EmptyState
              icon={<SteamLogo size={28} />}
              title={search ? `No games match "${search}"` : 'No games in your library'}
              compact
            />
          </div>
        ) : (
          <VirtualizedLibrary games={filtered} onOpenGame={onOpenGame} />
        )}
      </main>

      <aside className={styles.rail}>
        <Card title={<RailTitle icon={<Play size={14} />} label="Now Playing" />}>
          {currentGame ? (
            <div className={styles.nowPlaying}>
              <img
                className={styles.nowPlayingBanner}
                src={steamCapsuleUrl(currentGame.appId)}
                alt=""
              />
              <div className={styles.nowPlayingName}>{currentGame.name}</div>
              <div className={styles.nowPlayingActions}>
                <Button size="sm" tone="accent" onClick={() => { void launchSteam(currentGame.appId); }}>
                  Launch
                </Button>
                <Button size="sm" tone="neutral" onClick={() => onOpenGame(currentGame.appId, currentGame.name)}>
                  Details
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon={<Play size={20} />} title="Not in a game" compact />
          )}
        </Card>

        <Card title={<RailTitle icon={<Users size={14} />} label="Friends online" />}>
          {onlineFriends.length > 0 ? (
            <ul className={styles.friendList}>
              {onlineFriends.map(f => (
                <li key={f.steamId} className={styles.friendRow}>
                  <img className={styles.friendAvatar} src={f.avatarMedium} alt="" />
                  <div className={styles.friendInfo}>
                    <span className={styles.friendName}>{f.personaName}</span>
                    <span className={styles.friendSub}>
                      {f.gameExtraInfo ? `Playing ${f.gameExtraInfo}` : personaStatusLabel(f.personaState)}
                    </span>
                  </div>
                  <PersonaDot state={f.personaState} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Users size={20} />} title="No friends online" compact />
          )}
        </Card>

        <Card title={<RailTitle icon={<Newspaper size={14} />} label="Latest news" />}>
          {news.length > 0 ? (
            <ul className={styles.newsList}>
              {news.map(item => (
                <li key={item.gid} className={styles.newsRow}>
                  <a className={styles.newsLink} href={item.url} target="_blank" rel="noopener noreferrer">
                    <div className={styles.newsTitle}>{item.title}</div>
                    <div className={styles.newsMeta}>{item.feedLabel || item.feedName} · {formatDate(item.date)}</div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Newspaper size={20} />} title="No recent news" compact />
          )}
        </Card>
      </aside>
    </div>
  );
}

/**
 * Virtualized library grid. Renders ONLY the rows of tiles currently
 * visible inside the scroller (plus a small overscan buffer above and
 * below), so:
 *
 *   - DOM size stays bounded regardless of library size (3k-game
 *     libraries are fine).
 *   - The browser only fetches capsule images for tiles that are in
 *     DOM. As you scroll, off-screen tiles unmount and their images
 *     are dropped from the active fetch / decode queue.
 *   - Scroll handling is rAF-throttled so we don't re-render every
 *     wheel tick.
 *
 * Layout is driven by a ResizeObserver on the scroller so column count
 * and tile width recompute when the window or right rail width
 * changes. Image aspect (header.jpg = 460/215) is baked into the
 * row-height math; the tile's CSS aspect matches the image source
 * so there's no per-tile size variance from cover/contain choices.
 */
function VirtualizedLibrary({
  games,
  onOpenGame,
}: {
  games: SteamOwnedGame[];
  onOpenGame: (appId: number, name: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Always read the LATEST scrollTop inside the rAF callback (not the
  // value captured at the first event of the frame). On high-refresh
  // trackpads a single frame can absorb 5–10 scroll events; if we
  // commit the first one, the rendered slice trails the visible
  // viewport by the rest of the burst and the user sees blank space.
  const latestScrollTopRef = useRef(0);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Seed sizes synchronously so the first paint already has a layout
    // — without this the grid would flash empty on mount while waiting
    // for the first ResizeObserver entry.
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        setSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF-throttle scroll: coalesce all scroll events that arrive within
  // one frame into a single state write. The ref captures the latest
  // scrollTop, the rAF reads from the ref, so the committed value is
  // the most-recent position when the frame runs, not the position at
  // the moment the rAF was scheduled.
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    latestScrollTopRef.current = e.currentTarget.scrollTop;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(latestScrollTopRef.current);
    });
  }, []);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const layout = useMemo(() => {
    const w = size.width;
    const h = size.height;
    if (w === 0) {
      return {
        cols: 1,
        rowHeight: 0,
        totalHeight: 0,
        startRow: 0,
        endRow: 0,
      };
    }
    const cols = Math.max(1, Math.floor((w + TILE_GAP_PX) / (TILE_WIDTH_PX + TILE_GAP_PX)));
    // Tile is a fixed pixel size — never scales with container. Row
    // height is fixed too, so the virtualization math is stable and
    // doesn't shift when the window resizes.
    const imageHeight = TILE_WIDTH_PX * TILE_IMAGE_ASPECT_H_OVER_W;
    const rowHeight = imageHeight + TILE_META_HEIGHT_PX + TILE_GAP_PX;
    const rowCount = Math.ceil(games.length / cols);
    const totalHeight = Math.max(0, rowCount * rowHeight - TILE_GAP_PX);
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
    const endRow = Math.min(rowCount, Math.ceil((scrollTop + h) / rowHeight) + OVERSCAN_ROWS);
    return { cols, rowHeight, totalHeight, startRow, endRow };
  }, [games.length, size, scrollTop]);

  const visible = useMemo(
    () => games.slice(layout.startRow * layout.cols, layout.endRow * layout.cols),
    [games, layout.startRow, layout.endRow, layout.cols],
  );
  const offsetY = layout.startRow * layout.rowHeight;

  return (
    <div
      ref={scrollerRef}
      className={styles.libraryScroller}
      onScroll={handleScroll}
      data-panel-scrollable="true"
    >
      <div className={styles.libraryRail} style={{ height: layout.totalHeight }}>
        <div
          className={styles.librarySlice}
          style={{
            transform: `translateY(${offsetY}px)`,
            // Fixed-pixel columns — cards never scale to fill the
            // container. Excess horizontal space sits as a gutter on
            // the right (justify-content: start in CSS); the grid
            // just packs as many same-size cards per row as fit.
            gridTemplateColumns: `repeat(${layout.cols}, ${TILE_WIDTH_PX}px)`,
            columnGap: TILE_GAP_PX,
            rowGap: TILE_GAP_PX,
          }}
        >
          {visible.map(game => (
            <GameTile key={game.appId} game={game} onOpen={onOpenGame} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-tile component. Owns the image-failed state so React unmounts
 * it cleanly when the tile scrolls off (keyed by appId). Per-tile
 * component state resets on key change — no leakage across recycled
 * DOM nodes.
 *
 * On capsule_231x87 404 the tile shows a styled empty placeholder
 * of the same dimensions. We deliberately do NOT fall back to a
 * second URL — falling back to a different-aspect image would
 * letterbox inside the 231/87 box and the tile would visibly differ
 * from its neighbours.
 */
function GameTile({
  game,
  onOpen,
}: {
  game: SteamOwnedGame;
  onOpen: (appId: number, name: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={styles.gameTile}
      onClick={() => onOpen(game.appId, game.name)}
      title={game.name}
    >
      {failed ? (
        <div className={styles.gameTileArt} aria-hidden="true" />
      ) : (
        <img
          className={styles.gameTileArt}
          src={steamCapsuleUrl(game.appId)}
          width={231}
          height={87}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      <div className={styles.gameTileMeta}>
        <div className={styles.gameTileName}>{game.name}</div>
        <div className={styles.gameTileSub}>{formatMinutes(game.playtimeForever)}</div>
      </div>
    </button>
  );
}

function RailTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className={styles.railTitle}>
      {icon}
      {label}
    </span>
  );
}

function DrillView({
  appId,
  fallbackName,
  friends,
  ownedGames,
  onBack,
}: {
  appId: number;
  fallbackName: string;
  friends: SteamFriendSummary[];
  ownedGames: SteamOwnedGame[];
  onBack: () => void;
}) {
  const [details, setDetails] = useState<SteamAppDetails | null>(null);
  const [achievements, setAchievements] = useState<SteamAchievement[]>([]);
  const [globalRarity, setGlobalRarity] = useState<Map<string, number>>(new Map());
  const [stats, setStats] = useState<SteamUserStat[]>([]);
  const [news, setNews] = useState<SteamNewsItem[]>([]);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [hideUnlocked, setHideUnlocked] = useState(false);

  // Use the owned-games array that the parent already polls. Drilling
  // into a game shouldn't fire its own GetOwnedGames — that data is
  // already in memory upstairs.
  const owned = useMemo(
    () => ownedGames.find(g => g.appId === appId) ?? null,
    [ownedGames, appId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchSteamAppDetails(appId).then(d => { if (!cancelled) setDetails(d); });
    fetchSteamAchievements(appId).then(a => { if (!cancelled && a) setAchievements(a); });
    fetchSteamGlobalAchievements(appId).then(g => {
      if (cancelled || !g) return;
      const map = new Map<string, number>();
      for (const item of g) map.set(item.name, item.percent);
      setGlobalRarity(map);
    });
    fetchSteamUserStats(appId).then(s => { if (!cancelled && s) setStats(s); });
    fetchSteamNews(appId, 6, 320).then(n => { if (!cancelled && n) setNews(n); });
    return () => { cancelled = true; };
  }, [appId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPlayers() {
      const cp = await fetchSteamCurrentPlayers(appId);
      if (!cancelled && cp) setPlayerCount(cp.playerCount);
    }
    loadPlayers();
    const timer = window.setInterval(loadPlayers, DRILL_LIVE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [appId]);

  // Steam's friend gameExtraInfo is the in-client display name and
  // frequently differs from the storefront `details.name` (trademark
  // glyphs, punctuation, prefixed/suffixed editions). Strict equality
  // misses most matches; normalize and use substring containment in
  // either direction so the row populates correctly.
  const friendsInGame = useMemo(() => {
    const target = normalizeGameName(details?.name || fallbackName);
    if (!target) return [];
    return friends.filter(f => {
      if (!f.gameExtraInfo) return false;
      const friendGame = normalizeGameName(f.gameExtraInfo);
      return friendGame === target || friendGame.includes(target) || target.includes(friendGame);
    });
  }, [friends, details, fallbackName]);

  const sortedAchievements = useMemo(() => {
    const decorated = achievements.map(a => ({ ...a, rarity: globalRarity.get(a.apiName) ?? null }));
    decorated.sort((a, b) => {
      const ra = a.rarity ?? 100;
      const rb = b.rarity ?? 100;
      return ra - rb;
    });
    return hideUnlocked ? decorated.filter(a => a.achieved !== 1) : decorated;
  }, [achievements, globalRarity, hideUnlocked]);
  const unlockedCount = achievements.filter(a => a.achieved === 1).length;

  const title = details?.name || fallbackName;

  return (
    <div className={styles.drillRoot}>
      <div className={styles.drillTopBar}>
        <Button size="sm" tone="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>
          Back
        </Button>
        <Button size="sm" tone="accent" onClick={() => { void launchSteam(appId); }}>
          Launch
        </Button>
      </div>

      <section className={styles.drillHero}>
        <img
          className={styles.drillHeroArt}
          // Always use the well-known CDN header for the hero. Earlier
          // we swapped to `details.headerImage` once the Storefront API
          // responded, but that URL is sometimes a different host that
          // can fail to load — and our onError handler then hid the
          // image. The CDN URL is stable across every game.
          src={steamHeaderUrl(appId)}
          alt=""
        />
        <div className={styles.drillHeroOverlay}>
          <h2 className={styles.drillTitle}>{title}</h2>
          {details && (
            <div className={styles.drillMeta}>
              {details.developers.length > 0 && <span>{details.developers.join(', ')}</span>}
              {details.releaseDate && <span>{details.releaseDate}</span>}
              {details.genres.length > 0 && <span>{details.genres.join(' · ')}</span>}
              {typeof details.metacriticScore === 'number' && (
                <span className={styles.metacritic}>★ {details.metacriticScore}</span>
              )}
            </div>
          )}
          {playerCount !== null && playerCount > 0 && (
            <div className={styles.drillLive}>
              <span className={styles.liveDot} /> {playerCount.toLocaleString()} playing now
            </div>
          )}
        </div>
      </section>

      {details?.shortDescription && (
        <p className={styles.drillDescription}>{details.shortDescription}</p>
      )}

      <section className={styles.drillStatsRow}>
        <StatTile label="Total" value={formatMinutes(owned?.playtimeForever ?? 0)} />
        <StatTile label="Last 2 weeks" value={formatMinutes(owned?.playtime2Weeks ?? 0)} />
        <StatTile
          label="Achievements"
          value={achievements.length > 0 ? `${unlockedCount} / ${achievements.length}` : '—'}
        />
        <StatTile
          label="Players now"
          value={playerCount !== null ? playerCount.toLocaleString() : '—'}
        />
      </section>

      <div className={styles.drillColumns}>
        <section className={styles.drillCol}>
          <Card
            title="Achievements"
            actions={
              achievements.length > 0 ? (
                <label className={styles.drillToggle}>
                  <input
                    type="checkbox"
                    checked={hideUnlocked}
                    onChange={e => setHideUnlocked(e.target.checked)}
                  />
                  Hide unlocked
                </label>
              ) : undefined
            }
          >
            {achievements.length === 0 ? (
              <EmptyState title="This game has no achievements." compact />
            ) : (
              <ul className={styles.achievementList}>
                {sortedAchievements.map(a => (
                  <li key={a.apiName} className={styles.achievementRow} data-achieved={a.achieved === 1 ? 'true' : undefined}>
                    <div className={styles.achievementMain}>
                      <span className={styles.achievementName}>{a.name || a.apiName}</span>
                      {a.description && <span className={styles.achievementDesc}>{a.description}</span>}
                    </div>
                    <div className={styles.achievementRight}>
                      {a.rarity !== null && (
                        <div className={styles.rarityBar} title={`${a.rarity.toFixed(1)}% of players have this`}>
                          <div className={styles.rarityFill} style={{ width: `${Math.min(100, Math.max(2, a.rarity))}%` }} />
                          <span className={styles.rarityText}>{a.rarity.toFixed(0)}%</span>
                        </div>
                      )}
                      {a.achieved === 1 && a.unlockTime > 0 && (
                        <span className={styles.unlockTime}>{formatDate(a.unlockTime)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {stats.length > 0 && (
            <Card title="Your stats">
              <ul className={styles.statList}>
                {stats.map(s => (
                  <li key={s.name} className={styles.statRow}>
                    <span className={styles.statKey}>{humanizeStatName(s.name)}</span>
                    <span className={styles.statValue}>{formatStatValue(s.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section className={styles.drillCol}>
          <Card title="News">
            {news.length === 0 ? (
              <EmptyState title="No recent announcements." compact />
            ) : (
              <ul className={styles.drillNewsList}>
                {news.map(item => (
                  <li key={item.gid}>
                    <a className={styles.drillNewsItem} href={item.url} target="_blank" rel="noopener noreferrer">
                      <div className={styles.drillNewsTitle}>{item.title}</div>
                      <div className={styles.drillNewsMeta}>{item.feedLabel || item.feedName} · {formatDate(item.date)}</div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Friends in this game">
            {friendsInGame.length === 0 ? (
              <EmptyState title="No friends are playing right now." compact />
            ) : (
              <ul className={styles.friendList}>
                {friendsInGame.map(f => (
                  <li key={f.steamId} className={styles.friendRow}>
                    <img className={styles.friendAvatar} src={f.avatarMedium} alt="" />
                    <div className={styles.friendInfo}>
                      <span className={styles.friendName}>{f.personaName}</span>
                      <span className={styles.friendSub}>Playing {f.gameExtraInfo}</span>
                    </div>
                    <PersonaDot state={f.personaState} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statTile}>
      <span className={styles.statTileValue}>{value}</span>
      <span className={styles.statTileLabel}>{label}</span>
    </div>
  );
}

function PersonaDot({ state }: { state: number | undefined }) {
  return <span className={styles.personaDot} data-state={personaToneKey(state)} aria-hidden="true" />;
}

function personaToneKey(state: number | undefined): 'online' | 'away' | 'busy' | 'offline' {
  if (state === 1 || state === 5 || state === 6) return 'online';
  if (state === 3 || state === 4) return 'away';
  if (state === 2) return 'busy';
  return 'offline';
}

function personaStatusLabel(state: number | undefined) {
  switch (state) {
    case 1: return 'Online';
    case 2: return 'Busy';
    case 3: return 'Away';
    case 4: return 'Snooze';
    case 5: return 'Trading';
    case 6: return 'Looking';
    default: return 'Offline';
  }
}

// Small rectangular capsule (231x87, ~2.66:1). When a tile's capsule
// 404s the tile shows an empty placeholder of the same dimensions —
// we deliberately do NOT fall back to a wider URL like header.jpg
// because that would letterbox inside the 231/87 frame and make the
// tile look smaller than its neighbours.
function steamCapsuleUrl(appId: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`;
}

// Larger landscape header used for the drill hero where the bigger
// image reads better.
function steamHeaderUrl(appId: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

function formatMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDate(unixSeconds: number) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, '') // ™ ® ©
    .replace(/[:\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeStatName(name: string) {
  return name.replace(/[_.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatStatValue(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}
