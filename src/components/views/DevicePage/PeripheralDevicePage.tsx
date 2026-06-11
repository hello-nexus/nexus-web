import { useEffect, useState } from 'react';
import { fetchPeripheralDetail, type Peripheral } from '../../../hooks/usePeripherals';
import { getWebHidPeripheral } from '../../../hooks/useWebHidPeripherals';
import { useTranslation } from '../../../lib/i18n';
import { DpiControl } from '../../peripherals/DpiControl';
import { PollingPicker } from '../../peripherals/PollingPicker';
import { BatteryBar } from '../../peripherals/BatteryBar';
import { SleepConfig } from '../../peripherals/SleepConfig';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import styles from './PeripheralDevicePage.module.scss';

async function snapshotWebHid(id: string, base: Peripheral): Promise<Peripheral | null> {
  const w = getWebHidPeripheral(id);
  if (!w) return null;
  try {
    const snap = await w.snapshot();
    return {
      ...base,
      capabilities: snap.capabilities,
      isWireless: snap.isWireless,
      dpi: snap.dpi ? {
        minDpi: snap.dpi.minDpi,
        maxDpi: snap.dpi.maxDpi,
        step: snap.dpi.step,
        stageCount: 0,
        activeStage: -1,
        stageDpi: [],
        current: snap.dpi.current,
      } : undefined,
      polling: snap.polling ? { supportedHz: snap.polling.supportedHz, currentHz: snap.polling.currentHz } : undefined,
      battery: snap.battery,
      sleep: snap.sleep,
    };
  } catch {
    return null;
  }
}

interface PeripheralDevicePageProps {
  peripheral: Peripheral;
}

export function PeripheralDevicePage({ peripheral }: PeripheralDevicePageProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<Peripheral | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (peripheral.source === 'webhid') {
        const next = await snapshotWebHid(peripheral.id, peripheral);
        if (!cancelled && next) setDetail(next);
      } else {
        const d = await fetchPeripheralDetail(peripheral.id);
        if (!cancelled && d) setDetail({ ...d, source: 'service' });
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [peripheral]);

  const p = detail ?? peripheral;
  const reload = async () => {
    if (peripheral.source === 'webhid') {
      const next = await snapshotWebHid(peripheral.id, peripheral);
      if (next) setDetail(next);
    } else {
      const d = await fetchPeripheralDetail(peripheral.id);
      if (d) setDetail({ ...d, source: 'service' });
    }
  };

  const hasCaps = !!(p.battery || p.dpi || p.polling || p.sleep);

  return (
    <section className={styles.page}>
      <ViewHeader title={p.name} />
      <div className={`${styles.pageBody} pageBody`}>
      <InfoList className={styles.info}>
        <InfoRow label={t('devices.peripheral.vendor')} value={p.vendor} />
        <InfoRow label={t('devices.peripheral.category')} value={p.category} capitalize />
        {p.source && (
          <InfoRow
            label={t('devices.peripheral.source')}
            value={
              <>
                <span className={styles.sourceText}>
                  {p.source === 'webhid' ? t('peripheral.source.webhid') : t('peripheral.source.service')}
                </span>
                {p.isWireless && (
                  <>
                    <span className={styles.sep} aria-hidden> · </span>
                    <span className={styles.wireless}>{t('peripheral.wireless')}</span>
                  </>
                )}
              </>
            }
          />
        )}
      </InfoList>

      {hasCaps && (
        <div className={styles.controls}>
          {p.battery && <BatteryBar state={p.battery} />}
          {p.dpi && <DpiControl peripheral={p} state={p.dpi} onChanged={reload} />}
          {p.polling && <PollingPicker peripheral={p} state={p.polling} onChanged={reload} />}
          {p.sleep && <SleepConfig peripheral={p} state={p.sleep} onChanged={reload} />}
        </div>
      )}

      {!hasCaps && p.capabilities.length === 0 && (
        <div className={styles.empty}>{t('peripheral.noCapabilities')}</div>
      )}
      </div>
    </section>
  );
}
