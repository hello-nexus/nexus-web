import { useCallback, useEffect, useState } from 'react';
import { Download, Keyboard, Plus, Trash2, Wifi } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  addE131Device, addQmkDevice, fetchManualDevices, importOpenRgbConfig, removeManualDevice,
  type ManualDevicesResponse,
} from '../../../api/lighting';
import { useTranslation } from '../../../lib/i18n';
import styles from './ManualRgbDevicesSection.module.scss';

interface ManualRgbDevicesSectionProps {
  serviceOnline: boolean;
}

const EMPTY: ManualDevicesResponse = {
  qmk: [], e131: [], importSourcePath: '', importSourceAvailable: false,
};

/**
 * Registers the two device classes OpenRGB can only find when told they exist:
 * QMK-OpenRGB keyboards, matched on the vid/pid the board was flashed with, and
 * E1.31 / WLED devices, which are a bare IP with nothing to enumerate. Anyone
 * who needs this has usually registered the same devices in OpenRGB already, so
 * the import adopts that config rather than asking for the ids again.
 *
 * Each change restarts the RGB subprocess service-side, so lighting drops for a
 * moment; the copy says so.
 */
export function ManualRgbDevicesSection({ serviceOnline }: ManualRgbDevicesSectionProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ManualDevicesResponse>(EMPTY);
  const [busy, setBusy] = useState(false);
  // Import outcome shown on the row itself; a settings section should not
  // require a ToastProvider ancestor just to report a result.
  const [importStatus, setImportStatus] = useState('');
  const [qmkForm, setQmkForm] = useState({ name: '', usbVid: '', usbPid: '' });
  const [e131Form, setE131Form] = useState({ name: '', ip: '', numLeds: '' });

  const load = useCallback(() => {
    if (!serviceOnline) return;
    fetchManualDevices()
      .then(r => { if (r) setData(r); })
      .catch(() => { /* section stays empty; nothing to recover */ });
  }, [serviceOnline]);

  useEffect(load, [load]);

  const withBusy = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try { await run(); load(); }
    finally { setBusy(false); }
  };

  const onImport = () => withBusy(async () => {
    const r = await importOpenRgbConfig();
    if (!r?.sourceFound) {
      setImportStatus(t('settings.manualRgb.importNotFound'));
      return;
    }
    setImportStatus(r.added > 0
      ? t('settings.manualRgb.importAdded', { count: r.added })
      : t('settings.manualRgb.importNothingNew'));
  });

  const onAddQmk = () => withBusy(async () => {
    await addQmkDevice(qmkForm.name.trim(), qmkForm.usbVid.trim(), qmkForm.usbPid.trim());
    setQmkForm({ name: '', usbVid: '', usbPid: '' });
  });

  const onAddE131 = () => withBusy(async () => {
    await addE131Device({
      name: e131Form.name.trim(),
      ip: e131Form.ip.trim(),
      numLeds: parseInt(e131Form.numLeds, 10) || 0,
    });
    setE131Form({ name: '', ip: '', numLeds: '' });
  });

  // Ids are 16-bit hex; anything else crashes the daemon's parser, so the add
  // button stays disabled rather than letting the service reject it.
  const validHex = (s: string) => /^(0x)?[0-9a-fA-F]{1,4}$/.test(s.trim());
  const canAddQmk = validHex(qmkForm.usbVid) && validHex(qmkForm.usbPid) && !busy;
  const canAddE131 = e131Form.ip.trim().length > 0 && !busy;

  return (
    <SettingsSection
      title={t('settings.manualRgb.title')}
      description={t('settings.manualRgb.description')}
    >
      <SettingRow
        label={t('settings.manualRgb.import.label')}
        description={data.importSourceAvailable
          ? t('settings.manualRgb.import.found', { path: data.importSourcePath })
          : t('settings.manualRgb.import.missing')}
        icon={<Download />}
        iconLeading="subtle"
      >
        <Button
          tone="neutral"
          size="sm"
          disabled={!serviceOnline || busy || !data.importSourceAvailable}
          onClick={onImport}
        >
          {t('settings.manualRgb.import.action')}
        </Button>
      </SettingRow>
      {importStatus && <p className={styles.status} role="status">{importStatus}</p>}

      <SettingRow
        label={t('settings.manualRgb.qmk.label')}
        description={t('settings.manualRgb.qmk.description')}
        icon={<Keyboard />}
        iconLeading="subtle"
      />
      <div className={styles.form}>
        <input
          className={styles.input}
          placeholder={t('settings.manualRgb.qmk.namePlaceholder')}
          aria-label={t('settings.manualRgb.qmk.namePlaceholder')}
          value={qmkForm.name}
          onChange={e => setQmkForm({ ...qmkForm, name: e.target.value })}
        />
        <input
          className={styles.inputShort}
          placeholder={t('settings.manualRgb.qmk.vidPlaceholder')}
          aria-label={t('settings.manualRgb.qmk.vidPlaceholder')}
          value={qmkForm.usbVid}
          onChange={e => setQmkForm({ ...qmkForm, usbVid: e.target.value })}
        />
        <input
          className={styles.inputShort}
          placeholder={t('settings.manualRgb.qmk.pidPlaceholder')}
          aria-label={t('settings.manualRgb.qmk.pidPlaceholder')}
          value={qmkForm.usbPid}
          onChange={e => setQmkForm({ ...qmkForm, usbPid: e.target.value })}
        />
        <Button tone="neutral" size="sm" icon={<Plus size={14} />} disabled={!canAddQmk} onClick={onAddQmk}>
          {t('settings.manualRgb.add')}
        </Button>
      </div>
      {data.qmk.length > 0 && (
        <ul className={styles.list}>
          {data.qmk.map(d => (
            <li key={`${d.usbVid}:${d.usbPid}`} className={styles.item}>
              <span className={styles.itemName}>{d.name || t('settings.manualRgb.unnamed')}</span>
              <span className={styles.itemMeta}>{d.usbVid}:{d.usbPid}</span>
              <button
                type="button"
                className={styles.remove}
                disabled={busy}
                aria-label={t('settings.manualRgb.remove')}
                onClick={() => withBusy(() => removeManualDevice('qmk', d.usbVid, d.usbPid))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SettingRow
        label={t('settings.manualRgb.e131.label')}
        description={t('settings.manualRgb.e131.description')}
        icon={<Wifi />}
        iconLeading="subtle"
      />
      <div className={styles.form}>
        <input
          className={styles.input}
          placeholder={t('settings.manualRgb.e131.namePlaceholder')}
          aria-label={t('settings.manualRgb.e131.namePlaceholder')}
          value={e131Form.name}
          onChange={e => setE131Form({ ...e131Form, name: e.target.value })}
        />
        <input
          className={styles.input}
          placeholder={t('settings.manualRgb.e131.ipPlaceholder')}
          aria-label={t('settings.manualRgb.e131.ipPlaceholder')}
          value={e131Form.ip}
          onChange={e => setE131Form({ ...e131Form, ip: e.target.value })}
        />
        <input
          className={styles.inputShort}
          type="number"
          min={0}
          placeholder={t('settings.manualRgb.e131.ledsPlaceholder')}
          aria-label={t('settings.manualRgb.e131.ledsPlaceholder')}
          value={e131Form.numLeds}
          onChange={e => setE131Form({ ...e131Form, numLeds: e.target.value })}
        />
        <Button tone="neutral" size="sm" icon={<Plus size={14} />} disabled={!canAddE131} onClick={onAddE131}>
          {t('settings.manualRgb.add')}
        </Button>
      </div>
      {data.e131.length > 0 && (
        <ul className={styles.list}>
          {data.e131.map(d => (
            <li key={`${d.ip}:${d.startUniverse}`} className={styles.item}>
              <span className={styles.itemName}>{d.name || t('settings.manualRgb.unnamed')}</span>
              <span className={styles.itemMeta}>
                {d.ip} · {t('settings.manualRgb.e131.ledCount', { count: d.numLeds })}
              </span>
              <button
                type="button"
                className={styles.remove}
                disabled={busy}
                aria-label={t('settings.manualRgb.remove')}
                onClick={() => withBusy(() => removeManualDevice('e131', d.ip, String(d.startUniverse)))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
