import { useEffect, useState } from 'react';
import { fetchGameSyncState, type GameSyncDevice } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';
import { GameSyncGamesPanel } from './GameSyncGamesPanel';

const ARCHETYPE_I18N_KEY: Record<string, string> = {
  keyboard:   'lighting.gameSync.archetype.keyboard',
  mouse:      'lighting.gameSync.archetype.mouse',
  mousepad:   'lighting.gameSync.archetype.mousepad',
  headset:    'lighting.gameSync.archetype.headset',
  keypad:     'lighting.gameSync.archetype.keypad',
  chromalink: 'lighting.gameSync.archetype.chromalink',
  ambient:    'lighting.gameSync.archetype.ambient',
};

export function GameSyncControls({ active, onStart, onStop }: {
  active: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<GameSyncDevice[]>([]);

  useEffect(() => {
    if (!active) { setDevices([]); return; }
    let cancelled = false;
    fetchGameSyncState().then(data => {
      if (!cancelled && data) setDevices(data.devices ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active]);

  return (
    <div className={styles.gameSyncControls}>
      <p className={styles.gameSyncDescription}>{t('lighting.gameSync.description')}</p>
      <button
        type="button"
        className={active ? styles.gameSyncStopBtn : styles.gameSyncStartBtn}
        onClick={active ? onStop : onStart}
      >
        {active ? t('lighting.gameSync.stop') : t('lighting.gameSync.start')}
      </button>
      {active && devices.length > 0 && (
        <div className={styles.gameSyncDevices}>
          <p className={styles.gameSyncDevicesLabel}>{t('lighting.gameSync.devicesLabel')}</p>
          <ul className={styles.gameSyncDeviceList}>
            {devices.map((d, i) => {
              const isAmbient = d.archetype === 'ambient';
              const archetypeKey = ARCHETYPE_I18N_KEY[d.archetype] ?? 'lighting.gameSync.archetype.other';
              const routingKey = isAmbient ? 'lighting.gameSync.routing.ambient' : 'lighting.gameSync.routing.zones';
              return (
                <li key={i} className={styles.gameSyncDeviceRow}>
                  <span className={styles.gameSyncDeviceName}>{d.name}</span>
                  <span className={styles.gameSyncDeviceArchetype}>{t(archetypeKey)}</span>
                  <span className={styles.gameSyncDeviceRoute}>{t(routingKey)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {active && devices.length === 0 && (
        <p className={styles.gameSyncNoDevices}>{t('lighting.gameSync.noDevices')}</p>
      )}
      <GameSyncGamesPanel />
    </div>
  );
}
