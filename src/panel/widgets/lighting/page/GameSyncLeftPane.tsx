import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import {
  fetchGameSyncGames,
  triggerGameSyncScan,
  steamArtworkUrl,
  type GameSyncGame,
  type GameSyncGamesResponse,
} from '../../../../api/lighting';
import { SettingsSection } from '../../../../components/common/SettingsSection/SettingsSection';
import { GAME_SYNC_SUPPORTED_GAMES_URL } from '../../../../lib/externalLinks';
import { useTranslation } from '../../../../lib/i18n';
import { readCachedGames, writeCachedGames } from './gameSyncGamesCache';
import styles from '../LightingPage.module.scss';

const GAMES_POLL_INTERVAL_MS = 2000;

/**
 * Whether a response carries a scan result. A service that has never scanned
 * reports an empty list throughout; adopting it would blank the cached pane.
 */
function hasResult(data: GameSyncGamesResponse): boolean {
  return data.scannedAt !== null;
}

function GameRow({ game }: { game: GameSyncGame }) {
  const thumbnailSrc = steamArtworkUrl(game.appId, 'capsule_231x87');
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <li className={styles.gameSyncGameRow}>
      {thumbnailSrc && !imgFailed && (
        <img
          src={thumbnailSrc}
          alt=""
          aria-hidden
          className={styles.gameSyncGameThumb}
          onError={() => setImgFailed(true)}
        />
      )}
      <div className={styles.gameSyncGameInfo}>
        <span className={styles.gameSyncGameName}>{game.name}</span>
        <span className={styles.gameSyncGameStore}>{game.store}</span>
      </div>
    </li>
  );
}

export function GameSyncLeftPane() {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  // Seeded from the cache so a service that has not scanned yet shows the
  // last known list; the first completed scan replaces it.
  const [games, setGames] = useState<GameSyncGame[]>(readCachedGames);
  const [rescanning, setRescanning] = useState(false);
  const rescanIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof window.setInterval> | null = null;

    // Returns whether the scan is over: a result must exist AND no scan be
    // running, since `scanning: false` also covers the window between
    // requesting a scan and the worker flagging itself busy.
    const adopt = (data: GameSyncGamesResponse): boolean => {
      if (!hasResult(data)) return false;
      setGames(data.games ?? []);
      if (data.scanning) return false;
      writeCachedGames(data.games ?? []);
      return true;
    };

    const startPolling = () => {
      intervalId = window.setInterval(async () => {
        const data = await fetchGameSyncGames().catch(() => null);
        if (cancelled || !data) return;
        if (!adopt(data)) return;
        setScanning(false);
        setRescanning(false);
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, GAMES_POLL_INTERVAL_MS);
    };

    const init = async () => {
      const data = await fetchGameSyncGames().catch(() => null);
      if (cancelled || !data) return;
      adopt(data);
      if (data.scanning) {
        setScanning(true);
        startPolling();
      } else if (!hasResult(data)) {
        setScanning(true);
        await triggerGameSyncScan().catch(() => null);
        if (!cancelled) startPolling();
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (rescanIntervalRef.current !== null) {
        window.clearInterval(rescanIntervalRef.current);
        rescanIntervalRef.current = null;
      }
    };
  }, []);

  const handleRescan = async () => {
    setRescanning(true);
    setScanning(true);
    await triggerGameSyncScan().catch(() => null);

    rescanIntervalRef.current = window.setInterval(async () => {
      const data = await fetchGameSyncGames().catch(() => null);
      if (!data) return;
      if (!hasResult(data)) return;
      setGames(data.games ?? []);
      if (data.scanning) return;
      writeCachedGames(data.games ?? []);
      setScanning(false);
      setRescanning(false);
      if (rescanIntervalRef.current !== null) {
        window.clearInterval(rescanIntervalRef.current);
        rescanIntervalRef.current = null;
      }
    }, GAMES_POLL_INTERVAL_MS);
  };

  const supported = games.filter(g => g.emitsChroma || g.emitsGsi);

  const headerWithScan = (
    <div className={styles.gameSyncGamesHeader}>
      <span>{t('lighting.gameSync.games.mine')}</span>
      <div className={styles.gameSyncGamesHeaderActions}>
        <Button
          type="button"
          size="sm"
          tone="neutral"
          icon={
            <RefreshCw
              size={14}
              aria-hidden
              className={rescanning || scanning ? styles.rescanIconSpinning : undefined}
            />
          }
          onClick={() => void handleRescan()}
          disabled={rescanning || scanning}
        >
          {rescanning ? t('lighting.gameSync.games.rescanning') : t('lighting.gameSync.games.rescan')}
        </Button>
        <Button
          size="sm"
          tone="neutral"
          iconTrailing={<ExternalLink size={14} aria-hidden />}
          href={GAME_SYNC_SUPPORTED_GAMES_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('lighting.gameSync.games.docsLink')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.gameSyncLeftPane}>
      <SettingsSection title={headerWithScan}>
        {scanning && supported.length === 0 ? (
          <p className={styles.gameSyncGamesScanning}>{t('lighting.gameSync.games.scanning')}</p>
        ) : supported.length === 0 ? (
          <p className={styles.gameSyncGamesNone}>{t('lighting.gameSync.games.none')}</p>
        ) : (
          <ul className={styles.gameSyncGamesList}>
            {supported.map((g, i) => (
              <GameRow key={i} game={g} />
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
