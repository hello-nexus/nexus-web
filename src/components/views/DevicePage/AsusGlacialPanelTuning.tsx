import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Notice } from '../../common/Notice/Notice';
import { SettingRow, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useToast } from '../../common/Toast/Toast';
import {
  getGlacialTuning,
  resetGlacialTuningStats,
  resumeGlacialTuning,
  setGlacialTuning,
  type GlacialScaleMode,
  type GlacialTuning,
  type GlacialTuningSettings,
} from '../../../api/asus-glacial-lcd';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 1000;
const IDLE_COMMIT_MS = 3000;
const SCALE_STEPS = [25, 33, 50, 75, 100] as const;
const SCALE_MODES: readonly GlacialScaleMode[] = ['send', 'upscale'];
const SCALE_MODE_KEYS: Record<GlacialScaleMode, string> = {
  send: 'devices.asus-glacial-lcd.tuning.scaleModeSend',
  upscale: 'devices.asus-glacial-lcd.tuning.scaleModeUpscale',
};
const KB = 1024;

const MAX_FPS_NO_CAP = 30;

/** What Restore defaults writes: the service defaults. */
export const GLACIAL_TUNING_DEFAULTS: GlacialTuningSettings = {
  maxFps: MAX_FPS_NO_CAP,
  pacePercent: 19,
  replyDriven: false,
  scalePercent: 100,
  scaleMode: 'send',
  jpegQuality: 65,
  chunkKb: 4,
  doubleBuffer: false,
};

/** The Nexus panel streaming controls: apply at once, with a live view of what the uploads are doing. */
export function AsusGlacialPanelTuning() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const [tuning, setTuning] = useState<GlacialTuning | null>(null);
  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  // A field is protected from the poll while the user holds it (previewed, not yet committed)
  // or while any write for it is in flight.
  const gestureRef = useRef(new Map<keyof GlacialTuningSettings, { value: unknown; timer: number }>());
  const inflightRef = useRef(new Map<keyof GlacialTuningSettings, number>());
  // Bumped on every write, so a poll that started before it cannot undo it.
  const writeGenRef = useRef(0);
  const num = (v: number, digits = 0) => localizeNumbers(v.toFixed(digits), numberFormat);

  const isProtected = (key: keyof GlacialTuningSettings) =>
    gestureRef.current.has(key) || (inflightRef.current.get(key) ?? 0) > 0;

  const applyFresh = useCallback((fresh: GlacialTuning, settingsAllowed: boolean) => {
    setTuning(prev => {
      if (!prev || !settingsAllowed) return prev ? { ...prev, stats: fresh.stats } : fresh;
      const settings = { ...fresh.settings } as Record<string, unknown>;
      for (const key of Object.keys(settings) as Array<keyof GlacialTuningSettings>) {
        if (isProtected(key)) settings[key] = prev.settings[key];
      }
      return { settings: settings as unknown as GlacialTuningSettings, stats: fresh.stats };
    });
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (document.hidden) return;
    if (pollingRef.current) {
      if (force) refreshQueuedRef.current = true;
      return;
    }
    pollingRef.current = true;
    const gen = writeGenRef.current;
    try {
      const next = await getGlacialTuning(abortRef.current?.signal);
      if (!aliveRef.current || next === null) return;
      applyFresh(next, gen === writeGenRef.current);
    } catch {
      // A failed read leaves the last view; the next tick tries again.
    } finally {
      pollingRef.current = false;
      if (refreshQueuedRef.current && aliveRef.current) {
        refreshQueuedRef.current = false;
        void refresh(true);
      }
    }
  }, [applyFresh]);

  useEffect(() => {
    aliveRef.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    const gestures = gestureRef.current;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      abort.abort();
      window.clearInterval(id);
      for (const g of gestures.values()) window.clearTimeout(g.timer);
      gestures.clear();
    };
  }, [refresh]);

  const commit = useCallback(async (patch: Partial<GlacialTuningSettings>) => {
    const keys = Object.keys(patch) as Array<keyof GlacialTuningSettings>;
    for (const key of keys) {
      const g = gestureRef.current.get(key);
      if (g) window.clearTimeout(g.timer);
      gestureRef.current.delete(key);
      inflightRef.current.set(key, (inflightRef.current.get(key) ?? 0) + 1);
    }
    writeGenRef.current += 1;
    let next: GlacialTuning | null = null;
    try {
      next = await setGlacialTuning(patch);
    } catch {
      next = null;
    }
    for (const key of keys) inflightRef.current.set(key, Math.max(0, (inflightRef.current.get(key) ?? 1) - 1));
    // The toast is global, so a failure is told even when this card is gone.
    if (next === null) push({ title: t('devices.asus-glacial-lcd.failedTitle'), body: t('devices.asus-glacial-lcd.failedBody') });
    if (!aliveRef.current) return;
    writeGenRef.current += 1;
    if (next !== null) applyFresh(next, true);
    else void refresh(true);
  }, [push, t, refresh, applyFresh]);

  const preview = useCallback((local: Partial<GlacialTuningSettings>) => {
    for (const key of Object.keys(local) as Array<keyof GlacialTuningSettings>) {
      const prior = gestureRef.current.get(key);
      if (prior) window.clearTimeout(prior.timer);
      // A change that never reaches the slider's release (assistive input, a held key) is committed once it goes quiet.
      const timer = window.setTimeout(() => { void commit({ [key]: local[key] } as Partial<GlacialTuningSettings>); }, IDLE_COMMIT_MS);
      gestureRef.current.set(key, { value: local[key], timer });
    }
    setTuning(prev => prev && { ...prev, settings: { ...prev.settings, ...local } });
  }, [commit]);

  const edit = useCallback((local: Partial<GlacialTuningSettings>) => {
    preview(local);
    void commit(local);
  }, [preview, commit]);

  const act = useCallback(async (run: () => Promise<boolean>) => {
    let ok = false;
    try {
      ok = await run();
    } catch {
      ok = false;
    }
    if (!ok) push({ title: t('devices.asus-glacial-lcd.failedTitle'), body: t('devices.asus-glacial-lcd.failedBody') });
    void refresh();
  }, [push, t, refresh]);

  const ready = tuning !== null;
  const s = tuning?.settings;
  const stats = tuning?.stats;

  const slider = (
    key: 'maxFps' | 'pacePercent' | 'jpegQuality' | 'chunkKb',
    label: string,
    hint: string,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
  ) => (
    <SettingSlider
      editable
      trackFill
      label={label}
      description={hint}
      descriptionBelow
      value={s?.[key] ?? min}
      min={min}
      max={max}
      step={step}
      formatValue={format}
      disabled={!ready}
      onChange={(v: number) => { preview({ [key]: v }); }}
      onCommit={(v: number) => { void commit({ [key]: v }); }}
    />
  );

  return (
    <SettingsSection title={t('devices.asus-glacial-lcd.tuning.section')} boxClassName={styles.sectionBox}>
      {stats?.stalled && (
        <Notice
          tone="warning"
          role="status"
          actions={<Button size="sm" onClick={() => { void act(resumeGlacialTuning); }}>{t('devices.asus-glacial-lcd.tuning.resume')}</Button>}
        >
          {t('devices.asus-glacial-lcd.tuning.stalled')}
        </Notice>
      )}

      {slider('maxFps', t('devices.asus-glacial-lcd.tuning.maxFps'), t('devices.asus-glacial-lcd.tuning.maxFpsHint'), 0.2, 30, 0.1, v => (v >= MAX_FPS_NO_CAP ? t('devices.asus-glacial-lcd.tuning.noCap') : t('devices.asus-glacial-lcd.tuning.unitFps', { n: num(v, 1) })))}
      {slider('pacePercent', t('devices.asus-glacial-lcd.tuning.pacePercent'), t('devices.asus-glacial-lcd.tuning.pacePercentHint'), 0, 100, 1, v => localizeNumbers(`${v}%`, numberFormat))}
      <SettingToggle
        label={t('devices.asus-glacial-lcd.tuning.replyDriven')}
        description={t('devices.asus-glacial-lcd.tuning.replyDrivenHint')}
        checked={s?.replyDriven ?? false}
        disabled={!ready}
        onChange={on => edit({ replyDriven: on })}
      />
      <SettingRow
        label={t('devices.asus-glacial-lcd.tuning.scalePercent')}
        description={t('devices.asus-glacial-lcd.tuning.scalePercentHint')}
        descriptionBelow
      >
        <ChipGroup
          ariaLabel={t('devices.asus-glacial-lcd.tuning.scalePercent')}
          activeKey={String(s?.scalePercent ?? '')}
          options={SCALE_STEPS.map(n => ({ key: String(n), label: localizeNumbers(`${n}%`, numberFormat), disabled: !ready }))}
          onChange={key => edit({ scalePercent: Number(key) })}
        />
      </SettingRow>
      <SettingRow
        label={t('devices.asus-glacial-lcd.tuning.scaleMode')}
        description={t('devices.asus-glacial-lcd.tuning.scaleModeHint')}
        descriptionBelow
      >
        <ChipGroup
          ariaLabel={t('devices.asus-glacial-lcd.tuning.scaleMode')}
          activeKey={s?.scaleMode ?? ''}
          options={SCALE_MODES.map(m => ({ key: m, label: t(SCALE_MODE_KEYS[m]), disabled: !ready }))}
          onChange={key => edit({ scaleMode: key as GlacialScaleMode })}
        />
      </SettingRow>
      {slider('jpegQuality', t('devices.asus-glacial-lcd.tuning.jpegQuality'), t('devices.asus-glacial-lcd.tuning.jpegQualityHint'), 30, 95, 1, v => num(v))}
      {slider('chunkKb', t('devices.asus-glacial-lcd.tuning.chunkKb'), t('devices.asus-glacial-lcd.tuning.chunkKbHint'), 1, 16, 1, v => t('devices.asus-glacial-lcd.tuning.unitKb', { n: num(v) }))}
      <SettingToggle
        label={t('devices.asus-glacial-lcd.tuning.doubleBuffer')}
        description={t('devices.asus-glacial-lcd.tuning.doubleBufferHint')}
        checked={s?.doubleBuffer ?? false}
        disabled={!ready}
        onChange={on => edit({ doubleBuffer: on })}
      />

      <SettingRow label={t('devices.asus-glacial-lcd.tuning.rate')}>
        <span>{stats ? t('devices.asus-glacial-lcd.tuning.unitPerSec', { n: num(stats.uploadsPerSec, 2) }) : ''}</span>
      </SettingRow>
      <SettingRow label={t('devices.asus-glacial-lcd.tuning.lastUpload')}>
        <span>{stats ? t('devices.asus-glacial-lcd.tuning.unitMs', { n: num(stats.lastUploadMs) }) : ''}</span>
      </SettingRow>
      <SettingRow label={t('devices.asus-glacial-lcd.tuning.lastEncode')}>
        <span>{stats ? t('devices.asus-glacial-lcd.tuning.unitMs', { n: num(stats.lastEncodeMs) }) : ''}</span>
      </SettingRow>
      <SettingRow label={t('devices.asus-glacial-lcd.tuning.lastFrame')}>
        <span>{stats ? t('devices.asus-glacial-lcd.tuning.unitKb', { n: num(stats.lastFrameBytes / KB, 1) }) : ''}</span>
      </SettingRow>
      <SettingRow label={t('devices.asus-glacial-lcd.tuning.uploads')}>
        <span>{stats ? t('devices.asus-glacial-lcd.tuning.uploadsValue', { ok: num(stats.uploadsOk), failed: num(stats.uploadsFailed) }) : ''}</span>
      </SettingRow>
      {stats?.lastError && (
        <SettingRow label={t('devices.asus-glacial-lcd.tuning.lastError')}>
          <span>{stats.lastError}</span>
        </SettingRow>
      )}
      <SettingRow label={t('devices.asus-glacial-lcd.tuning.actions')}>
        <Button size="sm" disabled={!ready} onClick={() => { void act(resetGlacialTuningStats); }}>
          {t('devices.asus-glacial-lcd.tuning.resetStats')}
        </Button>
        <Button size="sm" disabled={!ready} onClick={() => edit(GLACIAL_TUNING_DEFAULTS)}>
          {t('devices.asus-glacial-lcd.tuning.restoreDefaults')}
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}
