import { useMemo, useState } from 'react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUsbDevices, type UsbDeviceDetail } from '../../../hooks/useUsbDevices';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useFirmwareStatus, type FirmwareStatusItem } from '../../../hooks/useFirmwareStatus';
import { useFlashStatus, type FlashStatus } from '../../../hooks/useFlashStatus';
import { useSystemSpecs, type SystemSpecs } from '../../../hooks/useSystemSpecs';
import { useTranslation } from '../../../lib/i18n';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Button } from '../../../components/common/Button/Button';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { DevicesSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { SupportedDevicesModal } from '../../../components/common/SupportedDevicesModal/SupportedDevicesModal';
import { DeviceModal } from '../../../components/common/DeviceModal/DeviceModal';
import { DisplaysView } from '../../../components/views/DisplaysView/DisplaysView';
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
  // Controlled tab = the route subtab (so /devices/displays deep-links).
  // Falls back to local state when not routed (dashboard widget reuse).
  tab?: string | null;
  onTabChange?: (tab: string) => void;
}

type TabKey = 'available' | 'displays' | 'firmware' | 'specs';
const TAB_KEYS: readonly string[] = ['available', 'displays', 'firmware', 'specs'];

export function DevicesPage({ serviceOnline, connectionState, onDeviceSelect, tab: routedTab, onTabChange }: DevicesViewProps) {
  const { t } = useTranslation();
  const [localTab, setLocalTab] = useState<TabKey>('available');
  const tab: TabKey = routedTab && TAB_KEYS.includes(routedTab) ? (routedTab as TabKey) : localTab;
  const setTab = (next: TabKey) => {
    setLocalTab(next);
    onTabChange?.(next);
  };
  const [supportedModalOpen, setSupportedModalOpen] = useState(false);
  const [connectedModalOpen, setConnectedModalOpen] = useState(false);

  const availableActive = tab === 'available';
  const { unified, merged, webhidAvailable, requestWebHid } = useUnifiedDevices(serviceOnline && availableActive);
  // Single USB subscription, reused for both the catalog "detected" highlight
  // and the Connected Devices modal — no second socket subscription.
  const allUsb = useUsbDevices(serviceOnline);
  const firmwareItems = useFirmwareStatus(serviceOnline && tab === 'firmware');
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
    { key: 'displays', label: t('displays.title') },
    { key: 'firmware', label: t('devices.tabs.firmware') },
    { key: 'specs', label: t('devices.tabs.specs') },
  ] as const;

  return (
    <section className={styles.devices}>
      <ViewHeader
        title={t('devices.title')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={(k) => setTab(k as TabKey)}
        tabsDisabled={!serviceOnline && !webhidAvailable}
        tabActions={serviceOnline ? (
          <div className={styles.headerActions}>
            <Button size="sm" tone="neutral" onClick={() => setSupportedModalOpen(true)}>
              {t('devices.supported.browse')}
            </Button>
            <Button size="sm" tone="neutral" onClick={() => setConnectedModalOpen(true)}>
              {t('devices.connected.browse')}
            </Button>
          </div>
        ) : undefined}
      />

      {availableActive ? (
        !availableAvailable ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <>
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
      ) : tab === 'displays' ? (
        <DisplaysView
          serviceOnline={serviceOnline}
          connectionState={connectionState}
          onDeviceSelect={onDeviceSelect}
        />
      ) : tab === 'firmware' ? (
        !serviceOnline ? (
          <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
        ) : (
          <FirmwarePanel items={firmwareItems} />
        )
      ) : !serviceOnline ? (
        <ServiceRequired state={connectionState} skeleton={<DevicesSkeleton />} />
      ) : (
        <SpecsPanel specs={systemSpecs.specs} />
      )}

      <SupportedDevicesModal
        open={supportedModalOpen}
        onClose={() => setSupportedModalOpen(false)}
        detectedVidPids={detectedVidPids}
      />

      <ConnectedDevicesModal
        open={connectedModalOpen}
        onClose={() => setConnectedModalOpen(false)}
        devices={allUsb.devices}
        loading={allUsb.loading}
        onRefresh={allUsb.refresh}
      />
    </section>
  );
}

interface ConnectedDevicesModalProps {
  open: boolean;
  onClose: () => void;
  devices: UsbDeviceDetail[];
  loading: boolean;
  onRefresh: () => void;
}

// Every USB device currently attached to this PC, including ones without
// Nexus support. Lives behind a header button (not a tab) since it's a
// diagnostics surface, not part of the primary device flow.
function ConnectedDevicesModal({ open, onClose, devices, loading, onRefresh }: ConnectedDevicesModalProps) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...devices].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [devices],
  );
  return (
    <DeviceModal open={open} onClose={onClose} fit title={t('devices.connected.browse')}>
      <p className={styles.explainer}>{t('devices.connected.description')}</p>
      <UsbPanel devices={sorted} loading={loading} onRefresh={onRefresh} />
    </DeviceModal>
  );
}

function DeviceCard({ device, onClick }: { device: UnifiedDevice; onClick: () => void }) {
  const body = (
    <>
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
    </>
  );

  const stateClass = device.connected ? styles.connected : styles.disconnected;

  // Non-navigable devices (e.g. the MiniHub — controlled from Cooling/Lighting,
  // no dedicated page) render as a static status card: shown for visibility,
  // but not a button that deep-links into an empty page.
  if (!device.navigable) {
    return <div className={`${styles.card} ${styles.staticCard} ${stateClass}`}>{body}</div>;
  }

  return (
    <div
      className={`${styles.card} ${stateClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
    >
      {body}
    </div>
  );
}

interface FirmwarePanelProps {
  items: FirmwareStatusItem[];
}

// Device glyphs keyed by the firmware status deviceType (= IDeviceHandler.Id).
const FW_ICONS: Record<string, string> = {
  cnvs: '/assets/devices/cnvs.svg',
  qseries: '/assets/devices/q60.svg',
  y70: '/assets/devices/y70.svg',
  'fan-hub': '/assets/devices/fan-hub.svg',
  np50: '/assets/devices/fan-hub.svg',
  smarthub: '/assets/devices/fan-hub.svg',
};
const FW_FALLBACK_ICON = '/assets/devices/device.svg';

// Gates the dev-only firmware version picker (re-flash / downgrade /
// cross-branch). __DEV_TOOLS__ is a build define (DEV_TOOLS=1) and
// import.meta.env.DEV covers the dev server — both are statically false in a
// release build, so esbuild dead-code-eliminates the brick-capable picker.
const DEV_TOOLS = import.meta.env.DEV || __DEV_TOOLS__;

// Centralized firmware-update surface. Lists each connected supported device
// with the version it's running; the available/bundled version is surfaced in
// the Status column. The Install action flashes the latest bundled image via
// the dfu-util flasher; downgrade / cross-branch re-flashing lives behind
// DEV_TOOLS (see above) and is absent from release builds.
function FirmwarePanel({ items }: FirmwarePanelProps) {
  const { t } = useTranslation();
  const { status, startFlash } = useFlashStatus(true);
  const anyFlashing = !!status?.active;

  return (
    <>
      {items.length === 0 ? (
        <div className={styles.empty}>{t('devices.firmware.empty')}</div>
      ) : (
        <div className={styles.usbTableWrap}>
          <table className={`${styles.usbTable} ${styles.fwTable}`}>
            <thead>
              <tr>
                <th>{t('devices.firmware.column.device')}</th>
                <th>{t('devices.firmware.column.current')}</th>
                <th>{t('devices.firmware.column.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(d => (
                <FirmwareRow
                  key={d.deviceType}
                  item={d}
                  status={status}
                  anyFlashing={anyFlashing}
                  onFlash={startFlash}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface FirmwareRowProps {
  item: FirmwareStatusItem;
  status: FlashStatus | null;
  anyFlashing: boolean;
  onFlash: (deviceType: string, version: string) => void | Promise<void>;
}

function FirmwareRow({ item, status, anyFlashing, onFlash }: FirmwareRowProps) {
  const { t } = useTranslation();
  const icon = FW_ICONS[item.deviceType] ?? FW_FALLBACK_ICON;

  // Dev cross-branch picker: index into all images this device can flash.
  const images = item.devImages.length > 0
    ? item.devImages
    : item.availableVersions.map(v => ({ firmwareType: item.firmwareType, version: v }));
  const [sel, setSel] = useState(0);
  const chosen = images[sel] ?? images[0];

  // A flash matches this row if it targets the connected variant or any sibling
  // image this device can flash (dev cross-branch picker).
  const matches = status != null && (
    status.deviceType === item.firmwareType ||
    item.devImages.some(img => img.firmwareType === status.deviceType)
  );
  const flashing = !!status?.active && matches;
  const lastError = (!status?.active && matches && status?.phase === 'failed')
    ? (status?.error || t('devices.firmware.flash.failed'))
    : '';

  // Just-flashed bridge. Between a successful flash completing and the firmware
  // status refreshing (the device re-enumerates → `devices` topic refetch), the
  // cached item still reports the OLD version. Without this, the row would flash
  // the stale "update available" prompt again before settling on "up to date".
  // While we wait, trust the verified flash result: show the written version as
  // installed and suppress the update prompt.
  const awaitingRefresh = matches && !status?.active
    && status?.phase === 'done' && !!status?.success
    && item.currentVersion !== status.version;
  const installedVersion = awaitingRefresh ? status!.version : item.currentVersion;

  return (
    <tr>
      <td className={styles.usbName}>
        <span className={styles.fwDeviceCell}>
          <span
            className={styles.fwDeviceIcon}
            role="img"
            aria-label={item.deviceType}
            style={{ ['--icon-url' as string]: `url(${icon})` }}
          />
          <span>{item.name}</span>
        </span>
      </td>
      <td className={styles.mono}>{installedVersion || '—'}</td>
      <td>
        {flashing ? (
          <FlashProgress status={status!} />
        ) : (
          <>
            {lastError && <div className={styles.fwFailed}>{lastError}</div>}
            {DEV_TOOLS ? (
              <span className={styles.fwUpdateRow}>
                <select
                  className={styles.fwVersionSelect}
                  value={sel}
                  onChange={e => setSel(Number(e.target.value))}
                  disabled={anyFlashing}
                >
                  {images.map((img, i) => (
                    <option key={img.firmwareType + img.version} value={i}>
                      {img.version}{img.firmwareType !== item.firmwareType ? ` (${img.firmwareType})` : ''}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  tone="accent"
                  size="sm"
                  disabled={anyFlashing || !chosen}
                  onClick={() => chosen && onFlash(chosen.firmwareType, chosen.version)}
                >
                  {t('devices.firmware.flash')}
                </Button>
              </span>
            ) : item.updateAvailable && !awaitingRefresh ? (
              <span className={styles.fwUpdateRow}>
                <span className={styles.fwUpdateBadge}>{t('devices.firmware.status.updateAvailable')}</span>
                <span className={styles.mono}>{item.availableVersion}</span>
                <Button
                  type="button"
                  tone="accent"
                  size="sm"
                  disabled={anyFlashing}
                  onClick={() => onFlash(item.firmwareType, item.availableVersion)}
                >
                  {t('devices.firmware.install')}
                </Button>
              </span>
            ) : installedVersion ? (
              <span className={styles.fwUpToDate}>
                {t('devices.firmware.status.upToDate')}
              </span>
            ) : (
              t('devices.firmware.status.unknown')
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function FlashProgress({ status }: { status: FlashStatus }) {
  return (
    <span className={styles.fwProgress}>
      <span className={styles.fwProgressBar}>
        <span className={styles.fwProgressFill} style={{ width: `${status.percent}%` }} />
      </span>
      <span className={styles.fwProgressMsg}>{status.message} ({status.percent}%)</span>
    </span>
  );
}

interface SpecsPanelProps {
  specs: SystemSpecs | null;
}

// Build the row list once per render. Order is identity → OS → core
// silicon → memory → storage → display → audio → network, which also
// reads as a spec sheet when copied to chat.
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
