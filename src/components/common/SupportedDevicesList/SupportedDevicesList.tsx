import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { NexusMark, OpenRgbGlyph } from '../../icons/NexusBrand';
import styles from './SupportedDevicesList.module.scss';

// Duplicated (not imported) from hooks/useSupportedDevices's SupportedDevice
// on purpose: that hook fetches, and this component must stay free of any
// data/service import so a host page (the marketing site) can mount it with
// zero I/O and render it via react-dom/server.
export interface SupportedDeviceRow {
  vendor: string;
  model: string;
  category: string;
  vendorId: string;
  productId: string;
  capabilities: string[];
  source: 'nexus' | 'openrgb';
}

interface SupportedDevicesListProps {
  devices: SupportedDeviceRow[];
  /** Lowercase "vendorid:productid" set - a matching row renders a connected dot. */
  detectedVidPids?: Set<string>;
}

/**
 * Presentational device-catalog table: source badge, brand, model, type,
 * VID:PID, capabilities. Search, pagination, and the fetch itself stay with
 * the caller (SupportedDevicesModal in-app; the marketing site elsewhere) -
 * this component only renders the rows it's given.
 */
export function SupportedDevicesList({ devices, detectedVidPids }: SupportedDevicesListProps) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colStatus}></th>
          <th>{t('supported.col.brand')}</th>
          <th>{t('supported.col.model')}</th>
          <th>{t('supported.col.type')}</th>
          <th className={styles.colMono}>{t('supported.col.vidPid')}</th>
          <th>{t('supported.col.capabilities')}</th>
        </tr>
      </thead>
      <tbody>
        {devices.map((d, i) => (
          <DeviceRow
            key={`${d.vendorId}-${d.productId}-${i}`}
            device={d}
            detected={detectedVidPids?.has(`${d.vendorId.toLowerCase()}:${d.productId.toLowerCase()}`) ?? false}
          />
        ))}
      </tbody>
    </table>
  );
}

function DeviceRow({ device, detected }: { device: SupportedDeviceRow; detected: boolean }) {
  const { t } = useTranslation();
  const sourceName = device.source === 'nexus' ? 'Nexus' : device.source === 'openrgb' ? 'OpenRGB' : null;
  const sourceLabel = sourceName !== null ? t('supported.source.drivenBy', { name: sourceName }) : null;
  const rowClass = [styles.row, detected && styles.detected].filter(Boolean).join(' ');
  return (
    <tr className={rowClass}>
      <td className={styles.colStatus}>
        {detected && (
          <HoverTooltip body={t('supported.connected')} side="right">
            <span className={styles.dot} aria-label={t('supported.connected')} />
          </HoverTooltip>
        )}
      </td>
      <td className={styles.brand}>
        {sourceLabel !== null && (
          <HoverTooltip body={sourceLabel} side="right">
            <span className={styles.sourceIcon} aria-label={sourceLabel}>
              <span aria-hidden={true}>
                {device.source === 'nexus' ? <NexusMark size={14} /> : <OpenRgbGlyph size={14} />}
              </span>
            </span>
          </HoverTooltip>
        )}
        {device.vendor}
      </td>
      <td className={styles.model}>{device.model}</td>
      <td className={styles.type}>{device.category}</td>
      {/* Keyless rows (OpenRGB detectors with no USB id, the EDID-identified
          Y70 GW / Ina panels) carry "-" in both fields. */}
      <td className={styles.mono}>
        {device.vendorId.startsWith('0x') ? `${device.vendorId}:${device.productId.replace(/^0x/, '')}` : '-'}
      </td>
      <td className={styles.caps}>{device.capabilities.join(' · ')}</td>
    </tr>
  );
}
