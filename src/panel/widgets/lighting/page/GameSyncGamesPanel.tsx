import React, { useEffect, useRef, useState } from 'react';
import {
  fetchGameSyncGames,
  triggerGameSyncScan,
  type GameSyncGame,
} from '../../../../api/lighting';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

const POLL_INTERVAL_MS = 2000;

export function GameSyncGamesPanel(): React.ReactElement {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [games, setGames] = useState<GameSyncGame[]>([]);
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);
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
      }, POLL_INTERVAL_MS);
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
    }, POLL_INTERVAL_MS);
  };

  const supported = games.filter(g => g.emitsChroma);
  const unsupported = games.filter(g => !g.emitsChroma);

  return (
    <div className={styles.gameSyncGamesPanel}>
      {scanning ? (
        <p className={styles.gameSyncGamesScanning}>{t('lighting.gameSync.games.scanning')}</p>
      ) : (
        <>
          <p className={styles.gameSyncGamesSummary}>
            {t('lighting.gameSync.games.summary', { supported: supported.length, total: games.length })}
          </p>
          {supported.length === 0 ? (
            <p className={styles.gameSyncGamesNone}>{t('lighting.gameSync.games.none')}</p>
          ) : (
            <ul className={styles.gameSyncGamesList}>
              {supported.map((g, i) => (
                <li key={i} className={styles.gameSyncGameRow}>
                  <span className={styles.gameSyncGameName}>{g.name}</span>
                  <span className={styles.gameSyncGameStore}>{g.store}</span>
                </li>
              ))}
            </ul>
          )}
          <CollapsibleSection
            title={t('lighting.gameSync.games.unsupported')}
            open={unsupportedOpen}
            onToggle={() => setUnsupportedOpen(o => !o)}
            compact
          >
            {unsupported.length === 0 ? (
              <p className={styles.gameSyncGamesNone}>{t('lighting.gameSync.games.emptyUnsupported')}</p>
            ) : (
              <ul className={styles.gameSyncGamesList}>
                {unsupported.map((g, i) => (
                  <li key={i} className={styles.gameSyncGameRow}>
                    <span className={styles.gameSyncGameName}>{g.name}</span>
                    <span className={styles.gameSyncGameStore}>{g.store}</span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
          <p className={styles.gameSyncGamesNote}>{t('lighting.gameSync.games.chromaNote')}</p>
          <button
            type="button"
            className={styles.gameSyncGamesRescanBtn}
            onClick={() => void handleRescan()}
            disabled={rescanning}
          >
            {rescanning ? t('lighting.gameSync.games.rescanning') : t('lighting.gameSync.games.rescan')}
          </button>
        </>
      )}
    </div>
  );
}
