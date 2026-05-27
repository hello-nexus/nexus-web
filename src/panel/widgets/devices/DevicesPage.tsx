import { useMemo, useState } from 'react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUsbDevices, type UsbDeviceDetail } from '../../../hooks/useUsbDevices';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useDevices, type DeviceListItem } from '../../../hooks/useDevices';
import { useSystemSpecs, type SystemSpecs } from '../../../hooks/useSystemSpecs';
import { useTranslation } from '../../../lib/i18n';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Button } from '../../../components/common/Button/Button';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { DevicesSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { SupportedDevicesModal } from '../../../components/common/SupportedDevicesModal/SupportedDevicesModal';
import styles from './DevicesPage.module.scss';

interface DevicesViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  // Click handler for a device card. Dashboard wires this to
  // `navigate('system', 'device', deviceKey)` so the card flow
  // matches the sidebar — clicking a device routes into its dedicated
  // page (PanelDevicePage / PeripheralDevicePage) rather than opening
  // a modal in place.
  onDeviceSelect: (deviceKey: string) => void;
}

type TabKey = 'available' | 'connected' | 'firmware' | 'specs';

export function DevicesPage({ serviceOnline, connectionState, onDeviceSelect }: DevicesViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('available');
  const [modalOpen, setModalOpen] = useState(false);

  const availableActive = tab === 'available';
  const { unified, merged, webhidAvailable, requestWebHid } = useUnifiedDevices(serviceOnline && availableActive);
  const usb = useUsbDevices(serviceOnline && tab === 'connected');
  const allUsb = useUsbDevices(serviceOnline);
  const firmwareDevices = useDevices(serviceOnline && tab === 'firmware');
  const systemSpecs = useSystemSpecs(serviceOnline && tab === 'specs');

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

  const tabs = [
    { key: 'available', label: t('devices.tabs.available') },
    { key: 'connected', label: t('devices.tabs.connected') },
    { key: 'firmware', label: t('devices.tabs.firmware') },
    { key: 'specs', label: t('devices.tabs.specs') },
  ] as const;

  return (
    <section className={styles.devices}>
      <ViewHeader
        title={t('devices.title')}
        titleTooltip={t('devices.title.tooltip')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={(k) => setTab(k as TabKey)}
        tabsDisabled={!serviceOnline && !webhidAvailable}
        tabActions={serviceOnline && availableActive ? (
          <button type="button" className={styles.catalogBtn} onClick={() => setModalOpen(true)}>
            {t('devices.supported.browse')}
          </button>
        ) : undefined}
      />

      {availableActive ? (
        !availableAvailable ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <>
            <p className={styles.explainer}>{t('devices.available.description')}</p>

            {webhidAvailable && (
              <div className={styles.webhidToolbar}>
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
                  <DeviceCard key={d.key} device={d} onClick={() => onDeviceSelect(d.key)} />
                ))}
              </div>
            )}
          </>
        )
      ) : tab === 'firmware' ? (
        !serviceOnline ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <FirmwarePanel devices={firmwareDevices} />
        )
      ) : tab === 'specs' ? (
        !serviceOnline ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <SpecsPanel specs={systemSpecs.specs} />
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

interface FirmwarePanelProps {
  devices: DeviceListItem[];
}

// Centralized firmware-update surface. v1 is read-only: lists every
// Nexus-supported device that reports a firmware version. Per-device
// flashing lands here once `plans/firmware-flasher-tooling.md` ships;
// the section already lives in its final spot so users know where to
// look for it.
function FirmwarePanel({ devices }: FirmwarePanelProps) {
  const { t } = useTranslation();
  const reporting = devices.filter(d => d.connected && d.firmwareVersion);

  return (
    <>
      <p className={styles.explainer}>{t('devices.firmware.description')}</p>
      {reporting.length === 0 ? (
        <div className={styles.empty}>{t('devices.firmware.empty')}</div>
      ) : (
        <div className={styles.usbTableWrap}>
          <table className={styles.usbTable}>
            <thead>
              <tr>
                <th>{t('devices.firmware.column.device')}</th>
                <th>{t('devices.firmware.column.current')}</th>
                <th>{t('devices.firmware.column.status')}</th>
              </tr>
            </thead>
            <tbody>
              {reporting.map(d => (
                <tr key={d.id}>
                  <td className={styles.usbName}>{d.name}</td>
                  <td className={styles.mono}>{d.firmwareVersion}</td>
                  <td>{t('devices.firmware.status.checkLater')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface SpecsPanelProps {
  specs: SystemSpecs | null;
}

// Build the row list once per render. Order matches the user's mental model
// ("identity → OS → core silicon → memory → storage → display → audio →
// network"), which also reads cleanly when copied to chat / spec sheets.
function specRows(specs: SystemSpecs, t: (k: string) => string) {
  return [
    { label: t('devices.specs.row.pcName'), value: specs.pcName },
    { label: t('devices.specs.row.osBuild'), value: specs.osBuild },
    { label: t('devices.specs.row.processor'), value: specs.processor },
    { label: t('devices.specs.row.motherboard'), value: specs.motherboard },
    { label: t('devices.specs.row.memory'), value: specs.memory },
    { label: t('devices.specs.row.storage'), value: specs.storage },
    { label: t('devices.specs.row.graphicsCard'), value: specs.graphicsCard },
    { label: t('devices.specs.row.monitor'), value: specs.monitor },
    { label: t('devices.specs.row.soundCard'), value: specs.soundCard },
    { label: t('devices.specs.row.networkCard'), value: specs.networkCard },
  ];
}

function SpecsPanel({ specs }: SpecsPanelProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // Render a stable placeholder list while the first fetch is in flight so the
  // tab doesn't collapse / reflow when the data arrives.
  const rows = specs
    ? specRows(specs, t)
    : Array.from({ length: 10 }, () => ({ label: '', value: '' }));

  const onCopy = async () => {
    if (!specs) return;
    const text = specRows(specs, t)
      .map(r => `${r.label}: ${r.value || '—'}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browsers without async clipboard (older WebViews on the panel side)
      // fall back to selecting nothing — no need to surface an error here,
      // the toast just won't appear.
    }
  };

  return (
    <>
      <p className={styles.explainer}>{t('devices.specs.description')}</p>
      <div className={styles.specsToolbar}>
        <Button type="button" tone="accent" size="sm" onClick={onCopy} disabled={!specs}>
          {copied ? t('devices.specs.copied') : t('devices.specs.copy')}
        </Button>
      </div>
      <div className={styles.specsCard}>
        <dl className={styles.specsList}>
          {rows.map((row, i) => (
            <div key={i} className={styles.specsRow}>
              <dt className={styles.specsLabel}>{row.label || ' '}</dt>
              <dd className={styles.specsValue}>
                {specs ? (row.value || '—') : ' '}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
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
