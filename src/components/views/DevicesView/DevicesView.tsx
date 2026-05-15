import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUsbDevices, type UsbDeviceDetail } from '../../../hooks/useUsbDevices';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { type Peripheral } from '../../../hooks/usePeripherals';
import { useTranslation } from '../../../lib/i18n';
import type { PanelDevice } from '../../../panel/panelDevices';
import { ViewHeader } from '../../ViewHeader/ViewHeader';
import { Button } from '../../Button/Button';
import { ServiceRequired } from '../ServiceRequired';
import { DevicesSkeleton } from '../PageSkeleton/PageSkeleton';
import { SupportedDevicesModal } from '../../SupportedDevicesModal/SupportedDevicesModal';
import { PanelDeviceModal } from '../../DeviceModal/PanelDeviceModal';
import { PeripheralModal } from '../../DeviceModal/PeripheralModal';
import styles from './DevicesView.module.scss';

interface DevicesViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  // When set, on mount/update find the matching device in the unified
  // Available list and auto-open its modal. The dashboard "Devices"
  // widget hands the device's `key` here so the user lands directly on
  // the management surface.
  initialOpenKey?: string | null;
  onInitialOpenConsumed?: () => void;
}

type TabKey = 'available' | 'connected';

export function DevicesView({ serviceOnline, connectionState, initialOpenKey, onInitialOpenConsumed }: DevicesViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('available');
  const [modalOpen, setModalOpen] = useState(false);
  const [panelModalOpen, setPanelModalOpen] = useState(false);
  const [panelModalDevice, setPanelModalDevice] = useState<PanelDevice | null>(null);
  const [peripheralModal, setPeripheralModal] = useState<Peripheral | null>(null);
  const consumedInitialKeyRef = useRef<string | null>(null);

  const availableActive = tab === 'available';
  const { unified, merged, webhidAvailable, requestWebHid } = useUnifiedDevices(serviceOnline && availableActive);
  const usb = useUsbDevices(serviceOnline && tab === 'connected');
  const allUsb = useUsbDevices(serviceOnline);

  const detectedVidPids = useMemo(() => {
    const set = new Set<string>();
    for (const d of allUsb.devices) {
      set.add(`${d.vendorId.toLowerCase()}:${d.productId.toLowerCase()}`);
    }
    for (const p of merged) {
      set.add(`${p.vendorId.toLowerCase()}:${p.productId.toLowerCase()}`);
    }
    return set;
  }, [allUsb.devices, merged]);

  const availableAvailable = serviceOnline || webhidAvailable;

  const handleCardClick = (device: UnifiedDevice) => {
    if (device.panelDevice) {
      setPanelModalDevice(device.panelDevice);
      setPanelModalOpen(true);
    } else if (device.peripheral) {
      setPeripheralModal(device.peripheral);
    }
  };

  // Deep-link from the dashboard "Devices" widget: when an initialOpenKey
  // arrives, find the matching device in the unified Available list and
  // open its modal. The ref guard means we consume each distinct key only
  // once even if the parent re-renders with the same value.
  useEffect(() => {
    // The consumed-key ref is what guarantees "open the modal exactly
    // once per distinct key" even if the parent passes an inline
    // onInitialOpenConsumed (new identity every render) or forgets to
    // clear `initialOpenKey`. Reset when the parent does clear it so a
    // subsequent navigation to the same device still fires.
    if (!initialOpenKey) {
      consumedInitialKeyRef.current = null;
      return;
    }
    if (consumedInitialKeyRef.current === initialOpenKey) return;
    if (!availableAvailable) return;
    const match = unified.find(d => d.key === initialOpenKey);
    if (!match) return;
    consumedInitialKeyRef.current = initialOpenKey;
    // setState-in-effect is intentional here — opening the modal is the
    // entire purpose of this deep-link callback, not a derived render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleCardClick(match);
    onInitialOpenConsumed?.();
  }, [initialOpenKey, unified, availableAvailable, onInitialOpenConsumed]);

  const tabs = [
    { key: 'available', label: t('devices.tabs.available') },
    { key: 'connected', label: t('devices.tabs.connected') },
  ] as const;

  return (
    <section className={styles.devices}>
      <div className={styles.headerRow}>
        <ViewHeader title={t('devices.title')} titleTooltip={t('devices.title.tooltip')} tabs={tabs} activeTab={tab} onTabChange={(k) => setTab(k as TabKey)} tabsDisabled={!serviceOnline && !webhidAvailable} />
        {serviceOnline && availableActive && (
          <button type="button" className={styles.catalogBtn} onClick={() => setModalOpen(true)}>
            {t('devices.supported.browse')}
          </button>
        )}
      </div>

      {availableActive ? (
        !availableAvailable ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <>
            <p className={styles.explainer}>{t('devices.available.description')}</p>

            {webhidAvailable && (
              <div className={styles.webhidToolbar}>
                {/* DOM order: description first so screen readers hear what the
                    button does before the button itself. CSS `order` flips
                    the visual so the button still appears on the left. */}
                <div className={styles.webhidCta}>
                  <strong>{t('peripheral.webhid.title')}</strong>
                  <span className={styles.webhidHint}>
                    {merged.some(p => p.source === 'webhid') ? t('peripheral.webhid.addMore') : t('peripheral.webhid.hint')}
                  </span>
                </div>
                <Button type="button" tone="accent" size="md" pill onClick={requestWebHid} className={styles.webhidBtn}>
                  {t('peripheral.webhid.connect')}
                </Button>
              </div>
            )}

            {unified.length === 0 ? (
              <div className={styles.empty}>{t('devices.available.none')}</div>
            ) : (
              <div className={styles.grid}>
                {unified.map(d => (
                  <DeviceCard key={d.key} device={d} onClick={() => handleCardClick(d)} />
                ))}
              </div>
            )}
          </>
        )
      ) : !serviceOnline ? (
        <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
      ) : (
        <>
          <p className={styles.explainer}>{t('devices.connected.description')}</p>
          <UsbPanel devices={usb.devices} loading={usb.loading} onRefresh={usb.refresh} />
        </>
      )}

      <SupportedDevicesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        detectedVidPids={detectedVidPids}
      />

      <PanelDeviceModal
        open={panelModalOpen}
        device={panelModalDevice}
        onClose={() => {
          setPanelModalOpen(false);
          setPanelModalDevice(null);
        }}
      />

      <PeripheralModal
        peripheral={peripheralModal}
        onClose={() => setPeripheralModal(null)}
      />
    </section>
  );
}

function DeviceCard({ device, onClick }: { device: UnifiedDevice; onClick: () => void }) {
  return (
    <div
      className={`${styles.card} ${device.connected ? styles.connected : styles.disconnected}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
    >
      <div className={styles.cardIcon}>
        <span
          className={styles.cardIconGlyph}
          role="img"
          aria-label={device.category}
          style={{ ['--icon-url' as string]: `url(${device.iconSrc})` }}
        />
      </div>
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{device.name}</span>
        <span className={styles.cardSub}>{device.subtitle}</span>
        <span className={styles.statusLine}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            {device.connected ? 'Connected' : 'Offline'}
          </span>
        </span>
      </div>
    </div>
  );
}

interface UsbPanelProps {
  devices: UsbDeviceDetail[];
  loading: boolean;
  onRefresh: () => void;
}

function UsbPanel({ devices, loading, onRefresh }: UsbPanelProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className={styles.usbToolbar}>
        <Button
          type="button"
          tone="neutral"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          loading={loading}
        >
          {loading ? t('devices.usb.refreshing') : t('devices.usb.refresh')}
        </Button>
      </div>

      {devices.length === 0 ? (
        <div className={styles.empty}>{t('devices.usb.empty')}</div>
      ) : (
        <div className={styles.usbTableWrap}>
          <table className={styles.usbTable}>
            <thead>
              <tr>
                <th>{t('devices.usb.name')}</th>
                <th>{t('devices.usb.manufacturer')}</th>
                <th>{t('devices.usb.vidPid')}</th>
                <th>{t('devices.usb.class')}</th>
                <th>{t('devices.usb.serial')}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d, i) => (
                <tr key={`${d.vendorId}-${d.productId}-${d.serial}-${i}`}>
                  <td className={styles.usbName}>{d.name || '-'}</td>
                  <td>{d.manufacturer || '-'}</td>
                  <td className={styles.mono}>{d.vendorId}:{d.productId.replace(/^0x/, '')}</td>
                  <td>{d.class || '-'}</td>
                  <td className={styles.mono}>{d.serial || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
