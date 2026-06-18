import { useEffect, useRef, useState } from 'react';
import {
  fetchGameSyncGames,
  triggerGameSyncScan,
  type GameSyncGame,
} from '../../../../api/lighting';
import { SettingsSection } from '../../../../components/common/SettingsSection/SettingsSection';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

const GAMES_POLL_INTERVAL_MS = 2000;

export function GameSyncLeftPane() {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [games, setGames] = useState<GameSyncGame[]>([]);
  const [rescanning, setRescanning] = useState(false);
  const rescanIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof window.setInterval> | null = null;

    const startPolling = () => {
      intervalId = window.setInterval(async () => {
        const data = await fetchGameSyncGames().catch(() => null);
        if (cancelled || !data) return;
        setGames(data.games ?? []);
        if (!data.scanning) {
          setScanning(false);
          setRescanning(false);
          if (intervalId !== null) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        }
      }, GAMES_POLL_INTERVAL_MS);
    };

    const init = async () => {
      const data = await fetchGameSyncGames().catch(() => null);
      if (cancelled || !data) return;
      setGames(data.games ?? []);
      if (data.scanning) {
        setScanning(true);
        startPolling();
      } else if (data.scannedAt === null) {
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
      setGames(data.games ?? []);
      if (!data.scanning) {
        setScanning(false);
        setRescanning(false);
        if (rescanIntervalRef.current !== null) {
          window.clearInterval(rescanIntervalRef.current);
          rescanIntervalRef.current = null;
        }
      }
    }, GAMES_POLL_INTERVAL_MS);
  };

  const supported = games.filter(g => g.emitsChroma);

  const headerWithScan = (
    <div className={styles.gameSyncGamesHeader}>
      <span>{t('lighting.gameSync.games.title')}</span>
      <button
        type="button"
        className={styles.gameSyncGamesRescanBtn}
        onClick={() => void handleRescan()}
        disabled={rescanning || scanning}
      >
        {rescanning ? t('lighting.gameSync.games.rescanning') : t('lighting.gameSync.games.rescan')}
      </button>
    </div>
  );

  return (
    <div className={styles.gameSyncLeftPane}>
      <SettingsSection title={headerWithScan}>
        {scanning ? (
          <p className={styles.gameSyncGamesScanning}>{t('lighting.gameSync.games.scanning')}</p>
        ) : supported.length === 0 ? (
          <p className={styles.gameSyncGamesNone}>{t('lighting.gameSync.games.none')}</p>
        ) : (
          <ul className={styles.gameSyncGamesList}>
            {supported.map((g, i) => (
              <li
                key={i}
                className={styles.gameSyncGameRow}
              >
                <span className={styles.gameSyncGameName}>{g.name}</span>
                <span className={styles.gameSyncGameStore}>{g.store}</span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
