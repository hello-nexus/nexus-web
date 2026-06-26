import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Select } from '../../common/Select/Select';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { getLianLiState, setLianLiFanCount, type LianLiState } from '../../../api/lianli';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const PORT_COUNT = 4;
const FAN_COUNT_OPTIONS = [0, 1, 2, 3, 4] as const;

export function LianLiDevicePage() {
  const { t } = useTranslation();
  // Tri-state: 'unknown' = still loading, 'connected' = hub up,
  // 'disconnected' = explicit not-connected response.
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [state, setState] = useState<LianLiState | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const s = await getLianLiState();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      setConnection('disconnected');
      setState(null);
      return;
    }
    setConnection('connected');
    setState(s);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const commitFanCount = useCallback(async (port: number, count: number) => {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev, fansPerPort: [...prev.fansPerPort] };
      next.fansPerPort[port] = count;
      return next;
    });
    setSaving(true);
    try {
      await setLianLiFanCount(port, count);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Uni Hub SL-Infinity" />
        <div className={`${styles.pageBody} pageBody`}>
          <Placeholder title={t('devices.lianli.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = state !== null;

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Uni Hub SL-Infinity"
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection
          title={t('devices.lianli.portsSection')}
          boxClassName={styles.sectionBox}
        >
          {Array.from({ length: PORT_COUNT }, (_, port) => (
            <div key={port} className={`${styles.row} ${!stateLoaded ? styles.rowDisabled : ''}`}>
              <span className={styles.rowLabel}>{t('devices.lianli.port', { n: port + 1 })}</span>
              <Select
                value={String(state?.fansPerPort[port] ?? 0)}
                onChange={v => { void commitFanCount(port, Number(v)); }}
                options={FAN_COUNT_OPTIONS.map(count => ({
                  value: String(count),
                  label: t(`devices.lianli.fanCount${count}` as Parameters<typeof t>[0]),
                }))}
                disabled={!stateLoaded}
                ariaLabel={t('devices.lianli.fanCountAria', { n: port + 1 })}
              />
              <span className={styles.rowValue}>
                {stateLoaded ? `${state.rpm[port] ?? 0} RPM` : ''}
              </span>
            </div>
          ))}
        </SettingsSection>
      </div>
    </div>
  );
}
