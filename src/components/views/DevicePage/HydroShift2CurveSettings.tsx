import { useCallback, useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Spinner } from '../../common/Spinner/Spinner';
import {
  HYDROSHIFT2_CURVE_SAVER_MINUTES,
  HYDROSHIFT2_CURVE_SCREEN_ASPECT,
  deleteHydroShift2CurveMedia,
  getHydroShift2CurveMedia,
  getHydroShift2CurveSettings,
  setHydroShift2CurveSettings,
  uploadHydroShift2CurveMedia,
  type HydroShift2CurveMediaItem,
  type HydroShift2CurveSettings as Settings,
  type HydroShift2CurveSettingsPatch,
} from '../../../api/hydroshift2Curve';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const SETTINGS_POLL_MS = 5000;
const MEDIA_POLL_MS = 2000;

interface CropTarget {
  src: string;
  file: File;
}

/** The HydroShift II Curved screen (Nexus panel or an uploaded video), screen saver, clock and pump options. */
export function HydroShift2CurveSettings() {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [media, setMedia] = useState<HydroShift2CurveMediaItem[]>([]);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState<'upload' | 'delete' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HydroShift2CurveMediaItem | null>(null);
  const aliveRef = useRef(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // A poll that was issued before the latest write finished may carry the old value.
  const writesInFlightRef = useRef(0);
  const writeGenRef = useRef(0);
  const brightnessDirtyRef = useRef(false);
  const serverBrightnessRef = useRef<number | null>(null);
  const brightnessInFlightRef = useRef<number | null>(null);
  const cropTargetRef = useRef<CropTarget | null>(null);

  const refreshSettings = useCallback(async () => {
    const gen = writeGenRef.current;
    const s = await getHydroShift2CurveSettings();
    if (!aliveRef.current || !s) return;
    if (writesInFlightRef.current > 0 || gen !== writeGenRef.current) return;
    serverBrightnessRef.current = s.screenSaverBrightness;
    setSettings(prev => (prev && brightnessDirtyRef.current
      ? { ...s, screenSaverBrightness: prev.screenSaverBrightness }
      : s));
  }, []);

  const refreshMedia = useCallback(async () => {
    const m = await getHydroShift2CurveMedia();
    if (aliveRef.current && m) setMedia(m);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refreshSettings();
    void refreshMedia();
    const id = window.setInterval(() => { if (!document.hidden) void refreshSettings(); }, SETTINGS_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
      if (cropTargetRef.current) URL.revokeObjectURL(cropTargetRef.current.src);
    };
  }, [refreshSettings, refreshMedia]);

  const processing = media.some(m => !m.ready);
  useEffect(() => {
    if (!processing) return undefined;
    const id = window.setInterval(() => { if (!document.hidden) void refreshMedia(); }, MEDIA_POLL_MS);
    return () => window.clearInterval(id);
  }, [processing, refreshMedia]);

  const write = useCallback(async (patch: HydroShift2CurveSettingsPatch) => {
    setSettings(prev => (prev ? { ...prev, ...patch } : prev));
    writesInFlightRef.current += 1;
    try {
      await setHydroShift2CurveSettings(patch);
    } finally {
      writesInFlightRef.current -= 1;
      writeGenRef.current += 1;
    }
    await refreshSettings();
  }, [refreshSettings]);

  const commitBrightness = useCallback((value: number) => {
    brightnessDirtyRef.current = false;
    if ((brightnessInFlightRef.current ?? serverBrightnessRef.current) === value) return;
    brightnessInFlightRef.current = value;
    void write({ screenSaverBrightness: value }).finally(() => {
      if (brightnessInFlightRef.current === value) brightnessInFlightRef.current = null;
    });
  }, [write]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    const target = { src: URL.createObjectURL(file), file };
    cropTargetRef.current = target;
    setCropTarget(target);
  };

  const closeCropper = useCallback((target: CropTarget) => {
    URL.revokeObjectURL(target.src);
    cropTargetRef.current = null;
    setCropTarget(null);
  }, []);

  const onCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropTarget) return;
    setUploading(true);
    try {
      const ok = await uploadHydroShift2CurveMedia(cropTarget.file, crop);
      if (aliveRef.current) setMediaError(ok ? null : 'upload');
      await refreshMedia();
    } finally {
      if (aliveRef.current) {
        setUploading(false);
        closeCropper(cropTarget);
      }
    }
  }, [cropTarget, closeCropper, refreshMedia]);

  if (!settings || !settings.connected) return null;

  const videoMode = settings.screenMode === 'video';
  const saverOn = settings.screenSaverMinutes > 0;
  const readyMedia = media.filter(m => m.ready);
  const playingLabel = settings.playing
    ? (media.find(m => m.name === settings.playing)?.label ?? settings.playing)
    : null;
  const modeOptions = [
    { value: 'nexus', label: t('devices.lianliCurve.screenModeNexus') },
    { value: 'video', label: t('devices.lianliCurve.screenModeVideo') },
  ];
  const saverVideoValue = settings.screenSaverVideo ?? '';

  return (
    <>
      <SettingsSection title={t('devices.lianliCurve.screenSection')}>
        <SettingSelect
          label={t('devices.lianliCurve.screenContent')}
          value={settings.screenMode}
          onChange={v => { void write({ screenMode: v === 'video' ? 'video' : 'nexus' }); }}
          options={modeOptions}
        />

        {videoMode && (
          <div className={styles.libraryBlock} data-settings-aside="true">
            <div className={styles.libraryHeaderRow}>
              <Button size="sm" tone="neutral" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? t('devices.lianliCurve.mediaUploading') : t('devices.lianliCurve.mediaUpload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className={styles.hiddenInput}
                onChange={onPickFile}
              />
              {playingLabel && (
                <span className={styles.customNote}>
                  {t('devices.lianliCurve.mediaNowPlaying', { name: playingLabel })}
                </span>
              )}
            </div>
            {mediaError && (
              <p className={styles.customNote} role="alert">
                {mediaError === 'upload'
                  ? t('devices.lianliCurve.mediaUploadFailed')
                  : t('devices.lianliCurve.mediaDeleteFailed')}
              </p>
            )}

            {media.length > 0 ? (
              <div className={styles.mediaGrid}>
                {media.map(item => (
                  item.ready ? (
                    <EffectCard
                      key={item.name}
                      asDiv
                      label={item.label}
                      thumbUrl={item.thumb ?? null}
                      thumbStatic
                      thumbAspect={HYDROSHIFT2_CURVE_SCREEN_ASPECT}
                      active={item.name === settings.video}
                      onClick={() => { void write({ screenMode: 'video', video: item.name }); }}
                      onDelete={() => setPendingDelete(item)}
                      deleteAriaLabel={t('devices.lianliCurve.mediaDeleteAria')}
                    />
                  ) : (
                    <EffectCard
                      key={item.name}
                      asDiv
                      nonInteractive
                      label={item.label}
                      meta={t('devices.lianliCurve.mediaProcessing')}
                      thumbUrl={item.thumb ?? null}
                      thumbStatic
                      thumbAspect={HYDROSHIFT2_CURVE_SCREEN_ASPECT}
                      active={false}
                      thumbOverlay={<span className={styles.mediaOverlay} role="status" aria-label={t('devices.lianliCurve.mediaProcessing')}><Spinner size={26} /></span>}
                    />
                  )
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Film size={28} />}
                title={t('devices.lianliCurve.mediaEmpty')}
                hint={t('devices.lianliCurve.mediaEmptyHint')}
                compact
              />
            )}
          </div>
        )}

        <SettingToggle
          label={t('devices.lianliCurve.offlineClock')}
          description={t('devices.lianliCurve.offlineClockHint')}
          checked={settings.offlineClock}
          onChange={offlineClock => { void write({ offlineClock }); }}
        />
      </SettingsSection>

      <SettingsSection title={t('devices.lianliCurve.saverSection')}>
        <SettingSelect
          label={t('devices.lianliCurve.saverInterval')}
          description={t('devices.lianliCurve.saverHint')}
          value={String(settings.screenSaverMinutes)}
          onChange={v => { void write({ screenSaverMinutes: Number(v) }); }}
          options={HYDROSHIFT2_CURVE_SAVER_MINUTES.map(n => ({
            value: String(n),
            label: n === 0
              ? t('devices.lianliCurve.saverOff')
              : t('devices.lianliCurve.saverMinutes', { n: localizeNumbers(String(n), numberFormat) }),
          }))}
        />
        <SettingSelect
          label={t('devices.lianliCurve.saverVideo')}
          value={saverVideoValue}
          onChange={v => { void write({ screenSaverVideo: v }); }}
          options={[
            { value: '', label: t('devices.lianliCurve.saverVideoNone') },
            ...readyMedia.map(m => ({ value: m.name, label: m.label })),
          ]}
          disabled={!saverOn || readyMedia.length === 0}
        />
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianliCurve.saverBrightness')}
          value={settings.screenSaverBrightness}
          min={0}
          max={100}
          step={1}
          formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
          ariaLabel={t('devices.lianliCurve.saverBrightnessAria')}
          disabled={!saverOn}
          onChange={(v: number, done?: boolean) => {
            brightnessDirtyRef.current = true;
            setSettings(prev => (prev ? { ...prev, screenSaverBrightness: v } : prev));
            if (done) commitBrightness(v);
          }}
          onCommit={commitBrightness}
        />
      </SettingsSection>

      <SettingsSection title={t('devices.lianliCurve.pumpSection')}>
        <SettingToggle
          label={t('devices.lianliCurve.pumpFollowsMotherboard')}
          description={t('devices.lianliCurve.pumpFollowsMotherboardHint')}
          checked={settings.pumpFollowsMotherboard}
          onChange={pumpFollowsMotherboard => { void write({ pumpFollowsMotherboard }); }}
        />
      </SettingsSection>

      <ConfirmModal
        open={pendingDelete != null}
        title={t('devices.lianliCurve.mediaDeleteTitle')}
        message={t('devices.lianliCurve.mediaDeleteMessage', { name: pendingDelete?.label ?? '' })}
        confirmLabel={t('common.delete')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const item = pendingDelete;
          setPendingDelete(null);
          if (!item) return;
          void deleteHydroShift2CurveMedia(item.name).then(ok => {
            if (aliveRef.current) setMediaError(ok ? null : 'delete');
            return Promise.all([refreshMedia(), refreshSettings()]);
          });
        }}
      />

      {cropTarget && (
        <MediaCropper
          src={cropTarget.src}
          kind="video"
          aspect={HYDROSHIFT2_CURVE_SCREEN_ASPECT}
          busy={uploading}
          onConfirm={onCropConfirm}
          onCancel={() => closeCropper(cropTarget)}
        />
      )}
    </>
  );
}
