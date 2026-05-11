import { useEffect, useMemo, useState } from 'react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useDevices } from '../../../hooks/useDevices';
import { usePanelDevices } from '../../../hooks/usePanelDevices';
import { useUsbDevices, type UsbDeviceDetail } from '../../../hooks/useUsbDevices';
import { usePeripherals, type Peripheral } from '../../../hooks/usePeripherals';
import { useWebHidPeripherals } from '../../../hooks/useWebHidPeripherals';
import { useTranslation } from '../../../lib/i18n';
import {
  getConnectedSimulatedPanels,
  PANEL_SIMULATION_CHANGED_EVENT,
} from '../../../lib/panelSimulation';
import type { PanelDevice } from '../../../panel/panelDevices';
import { ViewHeader } from '../../ViewHeader/ViewHeader';
import { Button } from '../../Button/Button';
import { ServiceRequired } from '../ServiceRequired';
import { DevicesSkeleton } from '../PageSkeleton/PageSkeleton';
import { SupportedDevicesModal } from '../../SupportedDevicesModal/SupportedDevicesModal';
import { PanelDevicePopup } from '../../DevicePopup/PanelDevicePopup';
import { PeripheralPopup } from '../../DevicePopup/PeripheralPopup';
import styles from './DevicesView.module.scss';

interface DevicesViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
}

const CATEGORY_ICONS: Record<string, string> = {
  mouse: '/assets/devices/mouse.svg',
  keyboard: '/assets/devices/keyboard.svg',
  headset: '/assets/devices/headset.svg',
  gamepad: '/assets/devices/gamepad.svg',
  display: '/assets/devices/y70.svg',
  controller: '/assets/devices/cnvs.svg',
  hub: '/assets/devices/fan-hub.svg',
};

const CURATED_ICONS: Record<string, string> = {
  cnvs: '/assets/devices/cnvs.svg',
  q60: '/assets/devices/q60.svg',
  q80: '/assets/devices/q80.svg',
  y70: '/assets/devices/y70.svg',
  keeb: '/assets/devices/keeb.svg',
  'fan-hub': '/assets/devices/fan-hub.svg',
};

const FALLBACK_ICON = '/assets/devices/device.svg';

type TabKey = 'supported' | 'panels' | 'connected';

interface UnifiedDevice {
  key: string;
  name: string;
  subtitle: string;
  category: string;
  iconSrc: string;
  connected: boolean;
  firmwareVersion?: string;
  kind: 'curated' | 'peripheral';
  curatedId?: string;
  peripheral?: Peripheral;
  panelDevice?: PanelDevice;
}

function buildUnifiedList(
  curated: { id: string; name: string; category: string; connected: boolean; firmwareVersion: string }[],
  peripherals: Peripheral[],
): UnifiedDevice[] {
  const list: UnifiedDevice[] = [];

  for (const d of curated) {
    list.push({
      key: `curated-${d.id}`,
      name: d.name,
      subtitle: d.category,
      category: d.category,
      iconSrc: CURATED_ICONS[d.id] || CATEGORY_ICONS[d.category] || FALLBACK_ICON,
      connected: d.connected,
      firmwareVersion: d.firmwareVersion || undefined,
      kind: 'curated',
      curatedId: d.id,
    });
  }

  for (const p of peripherals) {
    list.push({
      key: `peripheral-${p.id}`,
      name: p.name,
      subtitle: p.vendor,
      category: p.category,
      iconSrc: CATEGORY_ICONS[p.category] || FALLBACK_ICON,
      connected: true,
      kind: 'peripheral',
      peripheral: p,
    });
  }

  return list;
}

export function DevicesView({ serviceOnline, connectionState }: DevicesViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('supported');
  const [modalOpen, setModalOpen] = useState(false);
  const [panelPopupOpen, setPanelPopupOpen] = useState(false);
  const [panelPopupDevice, setPanelPopupDevice] = useState<PanelDevice | null>(null);
  const [peripheralPopup, setPeripheralPopup] = useState<Peripheral | null>(null);
  const [simulatedPanels, setSimulatedPanels] = useState(() => getConnectedSimulatedPanels());

  useEffect(() => {
    const handler = () => setSimulatedPanels(getConnectedSimulatedPanels());
    window.addEventListener(PANEL_SIMULATION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PANEL_SIMULATION_CHANGED_EVENT, handler);
  }, []);

  const devices = useDevices(serviceOnline && tab === 'supported');
  const peripherals = usePeripherals(serviceOnline && tab === 'supported');
  const webhid = useWebHidPeripherals(tab === 'supported');
  const panels = usePanelDevices(serviceOnline && tab === 'panels', { simulatedPanels });
  const usb = useUsbDevices(serviceOnline && tab === 'connected');

  const merged: Peripheral[] = useMemo(() => {
    const servicePeripherals = peripherals.peripherals.map(p => ({ ...p, source: 'service' as const }));
    const servicePids = new Set(servicePeripherals.map(p => p.productId.toLowerCase()));
    const webhidPeripherals = webhid.peripherals
      .filter(p => !servicePids.has(p.productId.toLowerCase()))
      .map(p => ({ ...p, source: 'webhid' as const }));
    return [...servicePeripherals, ...webhidPeripherals];
  }, [peripherals.peripherals, webhid.peripherals]);

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

  const supportedAvailable = serviceOnline || webhid.available;

  const unified = useMemo(() => {
    const connected = serviceOnline ? devices.filter(d => d.connected) : [];
    return buildUnifiedList(connected, merged);
  }, [serviceOnline, devices, merged]);

  const handleCardClick = (device: UnifiedDevice) => {
    if (device.panelDevice) {
      setPanelPopupDevice(device.panelDevice);
      setPanelPopupOpen(true);
    } else if (device.curatedId === 'y70') {
      setPanelPopupDevice(null);
      setPanelPopupOpen(true);
    } else if (device.peripheral) {
      setPeripheralPopup(device.peripheral);
    }
  };

  const handlePanelCardClick = (device: PanelDevice) => {
    if (!device.popupKind) return;
    setPanelPopupDevice(device);
    setPanelPopupOpen(true);
  };

  const tabs = [
    { key: 'supported', label: t('devices.tabs.supported') },
    { key: 'panels', label: t('devices.tabs.panels') },
    { key: 'connected', label: t('devices.tabs.connected') },
  ] as const;

  return (
    <section className={styles.devices}>
      <div className={styles.headerRow}>
        <ViewHeader title={t('devices.title')} titleTooltip={t('devices.title.tooltip')} tabs={tabs} activeTab={tab} onTabChange={(k) => setTab(k as TabKey)} tabsDisabled={!serviceOnline && !webhid.available} />
        {serviceOnline && tab === 'supported' && (
          <Button type="button" tone="ghost" size="sm" pill onClick={() => setModalOpen(true)} className={styles.catalogBtn}>
            {t('devices.supported.browse')}
          </Button>
        )}
      </div>

      {tab === 'supported' ? (
        !supportedAvailable ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <>
            <p className={styles.explainer}>{t('devices.supported.description')}</p>

            {webhid.available && (
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
                <Button type="button" tone="accent" size="md" pill onClick={webhid.requestDevice} className={styles.webhidBtn}>
                  {t('peripheral.webhid.connect')}
                </Button>
              </div>
            )}

            {unified.length === 0 ? (
              <div className={styles.empty}>{t('devices.supported.none')}</div>
            ) : (
              <div className={styles.grid}>
                {unified.map(d => (
                  <DeviceCard key={d.key} device={d} onClick={() => handleCardClick(d)} />
                ))}
              </div>
            )}
          </>
        )
      ) : tab === 'panels' ? (
        !serviceOnline ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <>
            <p className={styles.explainer}>{t('devices.panels.description')}</p>

            {panels.devices.length === 0 && !panels.loading ? (
              <div className={styles.empty}>{t('devices.panels.empty')}</div>
            ) : (
              <div className={styles.grid}>
                {panels.devices.map(d => (
                  <PanelDeviceCard key={d.id} device={d} onClick={() => handlePanelCardClick(d)} />
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

      <PanelDevicePopup
        open={panelPopupOpen}
        device={panelPopupDevice}
        onClose={() => {
          setPanelPopupOpen(false);
          setPanelPopupDevice(null);
        }}
      />

      <PeripheralPopup
        peripheral={peripheralPopup}
        onClose={() => setPeripheralPopup(null)}
      />
    </section>
  );
}

function PanelDeviceCard({ device, onClick }: { device: PanelDevice; onClick: () => void }) {
  const actionable = !!device.popupKind;
  const connected = device.status !== 'offline';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!actionable) return;
    if (e.key === 'Enter') onClick();
  };

  return (
    <div
      className={`${styles.card} ${connected ? styles.connected : styles.disconnected} ${actionable ? '' : styles.staticCard}`}
      onClick={actionable ? onClick : undefined}
      role={actionable ? 'button' : undefined}
      tabIndex={actionable ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.cardIcon}>
        <span
          className={styles.cardIconGlyph}
          role="img"
          aria-label={device.connectionKind}
          style={{ ['--icon-url' as string]: `url(${device.iconSrc})` }}
        />
      </div>
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{device.name}</span>
        <span className={styles.cardSub}>{device.subtitle}</span>
        <span className={styles.statusLine}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>{device.statusLabel}</span>
        </span>
      </div>
    </div>
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
