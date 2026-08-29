import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Lightbulb, Unplug } from 'lucide-react';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  encodeKrakenFrame,
  getKrakenState,
  setKrakenLcd,
  uploadKrakenLcdImage,
  type KrakenLcdPatch,
  type KrakenState,
} from '../../../api/nzxt-kraken';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { convertTemperature, formatNumber, localizeNumbers, tempUnitSymbol } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

// Matches the service status poll so the readout tracks the cooler without adding load.
const STATE_POLL_MS = 1000;

const LCD_MODES: { value: KrakenState['lcdMode']; labelKey: string }[] = [
  { value: 'liquid', labelKey: 'devices.nzxt-kraken.screenModeLiquid' },
  { value: 'image', labelKey: 'devices.nzxt-kraken.screenModeImage' },
  { value: 'off', labelKey: 'devices.nzxt-kraken.screenModeOff' },
];

const LCD_ROTATIONS = [0, 90, 180, 270];

/**
 * The Kraken's hardware options: cooling readout, the LCD's own display controls,
 * and the RGB channel summary. Hosted by the LCD panel page's settings tab, and by
 * KrakenDevicePage when no panel session exists to host it.
 */
export function KrakenCoolerSettings({ onSectionNavigate }: {
  onSectionNavigate?: (section: string) => void;
}) {
  const { t } = useTranslation();
  const { numberFormat, monitoringTempUnit } = useUnitPrefs();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [state, setState] = useState<KrakenState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const aliveRef = useRef(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const s = await getKrakenState();
    if (!aliveRef.current || s === null) return;
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
    const id = window.setInterval(() => { void refresh(); }, STATE_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  const commitLcd = useCallback(async (patch: KrakenLcdPatch) => {
    setSaving(true);
    try {
      await setKrakenLcd(patch);
      await refresh();
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [refresh]);

  const onPickImage = useCallback(async (file: File | undefined) => {
    if (!file || !state) return;
    setSaving(true);
    setUploadError(false);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const rgba = await encodeKrakenFrame(
          bitmap, state.lcdWidth, state.lcdHeight, bitmap.width, bitmap.height);
        const ok = await uploadKrakenLcdImage(rgba);
        if (aliveRef.current && !ok) setUploadError(true);
      } finally {
        bitmap.close();
      }
      await refresh();
    } catch {
      if (aliveRef.current) setUploadError(true);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [state, refresh]);

  if (connection === 'disconnected') {
    return <EmptyState icon={<Unplug size={40} />} title={t('devices.nzxt-kraken.notConnected')} />;
  }

  const loaded = state !== null;

  return (
    <>
      <SettingsSection
        title={t('devices.nzxt-kraken.statusSection')}
        boxClassName={styles.sectionBox}
        action={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : undefined}
      >
        <div className={`${styles.row} ${!loaded ? styles.rowDisabled : ''}`}>
          <span className={styles.rowLabel}>{t('devices.nzxt-kraken.liquid')}</span>
          <span className={styles.rowValue}>
            {loaded
              ? `${formatNumber(convertTemperature(state.liquidTempC, monitoringTempUnit), numberFormat, { maximumFractionDigits: 1 })}${tempUnitSymbol(monitoringTempUnit)}`
              : ''}
          </span>
          <span className={styles.rowValue} />
        </div>
        <div className={`${styles.row} ${!loaded ? styles.rowDisabled : ''}`}>
          <span className={styles.rowLabel}>{t('devices.nzxt-kraken.pump')}</span>
          <span className={styles.rowValue}>{loaded ? `${formatNumber(state.pumpRpm, numberFormat)} RPM` : ''}</span>
          <span className={styles.rowValue}>{loaded ? localizeNumbers(`${state.pumpDuty}%`, numberFormat) : ''}</span>
        </div>
        <div className={`${styles.row} ${!loaded ? styles.rowDisabled : ''}`}>
          <span className={styles.rowLabel}>{t('devices.nzxt-kraken.fans')}</span>
          <span className={styles.rowValue}>{loaded ? `${formatNumber(state.fanRpm, numberFormat)} RPM` : ''}</span>
          <span className={styles.rowValue}>{loaded ? localizeNumbers(`${state.fanDuty}%`, numberFormat) : ''}</span>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('devices.nzxt-kraken.screenSection')}
        boxClassName={styles.sectionBox}
      >
        {loaded && !state.hasLcd ? (
          <p className={styles.customNote} data-settings-aside="true">
            {t('devices.nzxt-kraken.screenUnavailable')}
          </p>
        ) : (
          <>
            <SettingSelect
              label={t('devices.nzxt-kraken.screenMode')}
              value={state?.lcdMode ?? 'liquid'}
              onChange={v => { void commitLcd({ mode: v as KrakenState['lcdMode'] }); }}
              options={LCD_MODES.map(m => ({ value: m.value, label: t(m.labelKey) }))}
              disabled={!loaded}
            />

            <SettingSlider
              editable
              trackFill
              label={t('devices.nzxt-kraken.screenBrightness')}
              value={state?.lcdBrightness ?? 0}
              min={0}
              max={100}
              step={1}
              formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
              ariaLabel={t('devices.nzxt-kraken.screenBrightnessAria')}
              disabled={!loaded}
              onChange={(v: number, commit?: boolean) => {
                if (!state) return;
                setState({ ...state, lcdBrightness: v });
                if (commit) void commitLcd({ brightness: v });
              }}
              onCommit={(v: number) => { void commitLcd({ brightness: v }); }}
            />

            <SettingSelect
              label={t('devices.nzxt-kraken.screenRotation')}
              value={String(state?.lcdOrientation ?? 0)}
              onChange={v => { void commitLcd({ orientation: Number(v) }); }}
              options={LCD_ROTATIONS.map(deg => ({
                value: String(deg),
                label: localizeNumbers(`${deg}°`, numberFormat),
              }))}
              disabled={!loaded}
            />

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={e => {
                void onPickImage(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              className={styles.lightingLink}
              size="sm"
              tone="neutral"
              icon={<ImageIcon size={14} />}
              disabled={!loaded || saving}
              onClick={() => fileRef.current?.click()}
            >
              {t('devices.nzxt-kraken.screenPickImage')}
            </Button>
            {uploadError && (
              <p className={styles.customNote} data-settings-aside="true">
                {t('devices.nzxt-kraken.screenUploadFailed')}
              </p>
            )}
          </>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('devices.nzxt-kraken.lightingSection')}
        boxClassName={styles.sectionBox}
      >
        {(state?.channels ?? []).map(ch => (
          <div key={ch.id} className={styles.row}>
            <span className={styles.rowLabel}>{ch.accessoryName}</span>
            <span className={styles.rowValue}>
              {t('devices.nzxt-kraken.ledCount', { n: ch.ledCount })}
            </span>
            <span className={styles.rowValue} />
          </div>
        ))}
        <p className={styles.customNote} data-settings-aside="true">
          {t('devices.nzxt-kraken.lightingNote')}
        </p>
        <p className={styles.customNote} data-settings-aside="true">
          {t('lighting.devices.krakenStreamRate')}
        </p>
        {onSectionNavigate && (
          <Button
            className={styles.lightingLink}
            size="sm"
            tone="neutral"
            icon={<Lightbulb size={14} />}
            onClick={() => onSectionNavigate('lighting')}
          >
            {t('smartLights.colorOnLightingPage')}
          </Button>
        )}
      </SettingsSection>
    </>
  );
}
