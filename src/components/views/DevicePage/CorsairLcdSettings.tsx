import { Sparkles, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { Notice } from '../../common/Notice/Notice';
import { KlipyPicker } from '../../common/KlipyPicker/KlipyPicker';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getCorsairLcdMedia,
  getCorsairLcdState,
  setCorsairDeviceScreen,
  setCorsairLcd,
  uploadCorsairLcdMedia,
  type CorsairLcdMediaItem,
  type CorsairLcdPatch,
  type CorsairLcdState,
} from '../../../api/corsair-lcd';
import { stageKlipy, type KlipyGif } from '../../../api/klipy';
import { cancelMediaStage, mediaStagePreviewUrl, mediaStageRawUrl, stagePreviewFor } from '../../../api/mediaLibrary';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

// Matches the Kraken's cadence so the readout tracks the cooler without adding load.
const STATE_POLL_MS = 1000;

// The firmware rotates whatever it renders, streamed frames included, so a pump mounted
// a quarter turn out is fixed here rather than in the panel layout. The wire value is the
// quarter-turn index (OpenLinkHub's lcdRotation), not the angle.
const LCD_ROTATIONS = [
  { value: 0, degrees: 0 },
  { value: 1, degrees: 90 },
  { value: 2, degrees: 180 },
  { value: 3, degrees: 270 },
];

// Statuses the device-screen route answers with, each to its translated message. The
// not-connected status also covers Nexus Control being off for the screen.
const DEVICE_SCREEN_ERRORS: Partial<Record<number, string>> = {
  404: 'devices.corsair.deviceScreenErrNotFound',
  409: 'devices.corsair.deviceScreenErrNotConnected',
  413: 'devices.corsair.deviceScreenErrTooLarge',
  422: 'devices.corsair.deviceScreenErrUnreadable',
  502: 'devices.corsair.deviceScreenErrRefused',
};

// Pulls a staged Klipy file back so it uploads through the same multipart path as a local pick.
async function fetchStagedFile(rawUrl: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}

/**
 * Hardware options for the iCUE LINK cooler's LCD module. Hosted by the LCD panel page's
 * settings tab: the glass is the panel, the screen module around it is this tab.
 */
export function CorsairLcdSettings() {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [state, setState] = useState<CorsairLcdState | null>(null);
  const [media, setMedia] = useState<CorsairLcdMediaItem[]>([]);
  const [savingScreen, setSavingScreen] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  // A local pick carries its File; a Klipy pick is staged in the service and fetched from rawUrl on confirm.
  const [cropState, setCropState] = useState<{
    src: string; kind: 'video' | 'image'; fallbackSrc?: string; name: string; file?: File; stageId?: string; rawUrl?: string;
  } | null>(null);
  const [klipyOpen, setKlipyOpen] = useState(false);
  const [klipyBusy, setKlipyBusy] = useState<string | null>(null);
  const [klipyError, setKlipyError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Set while the brightness thumb is being dragged, so the poll below keeps the local
  // value instead of snapping it back to whatever the service last reported.
  const brightnessDirtyRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getCorsairLcdState();
    if (!aliveRef.current || s === null) return;
    setState(prev => (prev && brightnessDirtyRef.current
      ? { ...s, brightness: prev.brightness }
      : s));
  }, []);

  const refreshMedia = useCallback(async () => {
    const m = await getCorsairLcdMedia();
    if (aliveRef.current && m) setMedia(m.items);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    void refreshMedia();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refresh(); }, STATE_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh, refreshMedia]);

  const commit = useCallback(async (patch: CorsairLcdPatch) => {
    await setCorsairLcd(patch);
    await refresh();
  }, [refresh]);

  const failureText = useCallback((status: number) => {
    const key = DEVICE_SCREEN_ERRORS[status] ?? 'devices.corsair.deviceScreenFailed';
    return t(key);
  }, [t]);

  const applyDeviceScreen = useCallback(async (mediaId: string | null) => {
    setSavingScreen(true);
    setScreenError(null);
    const failure = await setCorsairDeviceScreen(mediaId);
    await refresh();
    if (!aliveRef.current) return;
    // Restoring the coolant screen involves no image, so its refusal reads as the generic failure.
    if (failure !== null) setScreenError(mediaId === null && failure === 502 ? t('devices.corsair.deviceScreenFailed') : failureText(failure));
    setSavingScreen(false);
  }, [refresh, failureText, t]);

  const handleFileChange = useCallback((file: File | undefined) => {
    if (!file) return;
    setScreenError(null);
    setCropState({
      src: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
      file,
    });
  }, []);

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src, name, stageId, rawUrl } = cropState;
    // The cropper stays mounted and busy until the upload and apply finish.
    setSavingScreen(true);
    setScreenError(null);
    let uploadedId: string | null = null;
    try {
      const upload = file ?? (rawUrl ? await fetchStagedFile(rawUrl, name) : null);
      const uploaded = upload ? await uploadCorsairLcdMedia(upload, crop) : null;
      if (aliveRef.current) {
        if (uploaded) {
          uploadedId = uploaded.id;
          await refreshMedia();
        } else {
          setScreenError(t('devices.corsair.deviceScreenUploadFailed'));
        }
      }
    } finally {
      if (file) URL.revokeObjectURL(src);
      if (stageId) cancelMediaStage(stageId).catch(() => {});
      if (aliveRef.current) setCropState(null);
    }
    if (uploadedId !== null) await applyDeviceScreen(uploadedId);
    else if (aliveRef.current) setSavingScreen(false);
  }, [cropState, applyDeviceScreen, refreshMedia, t]);

  const handleCropCancel = useCallback(() => {
    if (cropState?.file) URL.revokeObjectURL(cropState.src);
    if (cropState?.stageId) cancelMediaStage(cropState.stageId).catch(() => {});
    setCropState(null);
  }, [cropState]);

  // A pick is staged like the other Klipy surfaces and lands in the same cropper as a file.
  const handleKlipyPick = useCallback(async (gif: KlipyGif) => {
    setKlipyBusy(gif.slug);
    setKlipyError(null);
    const staged = await stageKlipy(gif.slug);
    if (!aliveRef.current) return;
    setKlipyBusy(null);
    if (!staged) {
      setKlipyError(t('lighting.controls.importNetworkError'));
      return;
    }
    // A refusal here is Klipy's (no file, no such clip, over the cap), not the service's.
    if (staged.error || !staged.stageId) {
      setKlipyError(t('lighting.controls.klipyPickFailed'));
      return;
    }
    setKlipyOpen(false);
    setScreenError(null);
    const rawUrl = mediaStageRawUrl(staged.stageId);
    setCropState({
      ...stagePreviewFor(staged.mediaKind, rawUrl, mediaStagePreviewUrl(staged.stageId)),
      name: `${gif.slug}.${staged.mediaKind === 'gif' ? 'gif' : 'mp4'}`,
      stageId: staged.stageId,
      rawUrl,
    });
  }, [t]);

  // The state route answers 200 with hasDevice:false when the screen module is not
  // attached; without this the controls look live and every write is silently dropped.
  const loaded = state !== null && state.hasDevice;

  // The cooler may hold an image the library no longer lists (list still loading, fetch
  // failed, item deleted); the select must still say something is stored there.
  const deviceMediaId = state?.deviceMediaId || null;
  const storedUnlisted = deviceMediaId !== null && !media.some(m => m.id === deviceMediaId);

  return (
    <>
      <SettingsSection title={t('devices.corsair.screenSection')} boxClassName={styles.sectionBox}>
        <SettingSlider
          editable
          trackFill
          label={t('devices.corsair.screenBrightness')}
          value={state?.brightness ?? 0}
          min={0}
          max={100}
          step={1}
          formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
          ariaLabel={t('devices.corsair.screenBrightnessAria')}
          disabled={!loaded}
          onChange={(v: number, commitNow?: boolean) => {
            if (!state) return;
            brightnessDirtyRef.current = true;
            setState({ ...state, brightness: v });
            if (commitNow) void commit({ brightness: v }).finally(() => { brightnessDirtyRef.current = false; });
          }}
          onCommit={(v: number) => {
            void commit({ brightness: v }).finally(() => { brightnessDirtyRef.current = false; });
          }}
        />

        <SettingSelect
          label={t('devices.corsair.screenRotation')}
          value={String(state?.rotation ?? 0)}
          onChange={v => { void commit({ rotation: Number(v) }); }}
          options={LCD_ROTATIONS.map(r => ({
            value: String(r.value),
            label: localizeNumbers(`${r.degrees}°`, numberFormat),
          }))}
          disabled={!loaded}
        />
      </SettingsSection>

      <SettingsSection title={t('devices.corsair.deviceScreenSection')} boxClassName={styles.sectionBox}>
        <SettingSelect
          label={t('devices.corsair.deviceScreenLabel')}
          value={deviceMediaId ?? ''}
          onChange={v => {
            // Re-picking the current choice would rewrite the cooler's flash for nothing.
            if (v === (deviceMediaId ?? '')) return;
            void applyDeviceScreen(v === '' ? null : v);
          }}
          options={[
            { value: '', label: t('devices.corsair.deviceScreenCoolant') },
            ...(storedUnlisted && deviceMediaId
              ? [{ value: deviceMediaId, label: t('devices.corsair.deviceScreenStored') }]
              : []),
            ...media.map(m => ({ value: m.id, label: m.name })),
          ]}
          disabled={!loaded || savingScreen}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={e => {
            handleFileChange(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          tone="neutral"
          icon={<Upload size={14} />}
          loading={savingScreen}
          disabled={!loaded || savingScreen}
          onClick={() => fileRef.current?.click()}
        >
          {t('devices.corsair.deviceScreenUpload')}
        </Button>
        <Button
          size="sm"
          tone="neutral"
          icon={<Sparkles size={16} aria-hidden />}
          loading={savingScreen}
          disabled={!loaded || savingScreen}
          onClick={() => setKlipyOpen(true)}
        >
          {t('lighting.controls.klipyBrowse')}
        </Button>
        {screenError !== null && <Notice tone="critical" role="alert">{screenError}</Notice>}
      </SettingsSection>

      <KlipyPicker
        open={klipyOpen}
        busySlug={klipyBusy}
        importError={klipyOpen ? klipyError : null}
        thumbAspect={1}
        onPick={gif => { void handleKlipyPick(gif); }}
        onClose={() => { setKlipyOpen(false); setKlipyError(null); }}
      />

      {cropState && (
        <MediaCropper
          src={cropState.src}
          kind={cropState.kind}
          fallbackSrc={cropState.fallbackSrc}
          aspect={1}
          busy={savingScreen}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}
