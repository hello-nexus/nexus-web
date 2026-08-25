import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { useAudioMixer } from '../../../hooks/useAudioMixer';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import type { AudioDevice, AudioMixerPreset, AudioSession } from '../../../api/mixer';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { useFaderPager } from '../common/useFaderPager';
import { useMeasuredPager } from '../common/useMeasuredPager';
import { PanelArrowButton } from '../../chrome/PanelArrowButton';
import { AudioMixerIds } from './mixerIds';
import { MixerOutputSection } from './MixerOutputSection';
import { MixerOutputPicker } from './MixerOutputPicker';
import { MixerStrip } from './MixerStrip';
import { MIXER_PREVIEW } from './mixerPreviewData';
import styles from './MixerWidget.module.scss';

// Four is what fits across a 4x4 tile at a usable fader width; past that the
// row pages rather than shrinking the controls.
const FADERS_PER_PAGE = 4;
// Chips are as wide as their name, so how many fit is measured, not counted.
// Both values mirror .presets' hgap and .presetStage's paged padding.
const PRESET_GAP = 6;
const PRESET_ARROW_RESERVE = 38;

export function MixerWidget({ widget }: WidgetProps) {
  return <MixerBody {...useMixerView(widget.config)} />;
}

export interface MixerView {
  supported: boolean;
  master: MasterStrip | null;
  output: OutputHeader;
  sessions: AudioSession[];
  presets: AudioMixerPreset[];
  changeVolume: (id: string, volume: number) => void;
  commitVolume: (id: string, volume: number) => void;
  toggleMuted: (id: string, muted: boolean) => void;
  applyPreset: (id: string) => void;
  immersive?: boolean;
}

interface MasterStrip {
  volume: number;
  muted: boolean;
  supported: boolean;
  change: (volume: number) => void;
  commit: (volume: number) => void;
  toggle: () => void;
}

interface OutputHeader {
  name: string;
  outputs: AudioDevice[];
  inputs: AudioDevice[];
  selectOutput: (deviceId: string) => void;
  selectInput: (deviceId: string) => void;
}

/**
 * Shared by the tile and the fullscreen view. Preview mode short-circuits every
 * read, so the catalog renders a mix without opening a socket or a fetch.
 */
export function useMixerView(
  config: WidgetProps['widget']['config'],
): MixerView {
  const preview = usePanelPreview();
  const live = !preview;
  const devices = useAudioDevices(live);
  // The endpoints ride the mixer's config revision, so a switch made anywhere
  // re-reads the device list instead of waiting out its 5s poll.
  const mixer = useAudioMixer(live, devices.refresh);
  const volume = useSystemVolume(live);

  const showMaster = (config?.showMaster as boolean | undefined) ?? true;
  const hideIdle = (config?.hideIdle as boolean | undefined) ?? false;
  const showPresets = (config?.showPresets as boolean | undefined) ?? true;

  const sessions = preview ? MIXER_PREVIEW.sessions : mixer.sessions;
  const visible = hideIdle ? sessions.filter(s => s.active) : sessions;
  const previewMaster = MIXER_PREVIEW.master;

  const master: MasterStrip | null = !showMaster ? null : preview
    ? {
        volume: previewMaster.volume,
        muted: previewMaster.muted,
        supported: true,
        change: () => {},
        commit: () => {},
        toggle: () => {},
      }
    : {
        volume: volume.state.volume,
        muted: volume.state.muted,
        supported: volume.state.supported,
        change: v => { volume.previewVolume(v); volume.commitVolume(v); },
        commit: v => { volume.previewVolume(v); volume.commitVolume(v, { flush: true }); },
        toggle: () => { volume.setMuted(!volume.state.muted); },
      };

  const output: OutputHeader = preview
    ? {
        name: MIXER_PREVIEW.outputs[0].name,
        outputs: MIXER_PREVIEW.outputs,
        inputs: MIXER_PREVIEW.inputs,
        selectOutput: () => {},
        selectInput: () => {},
      }
    : {
        name: devices.activeOutput?.name ?? '',
        outputs: devices.outputs,
        inputs: devices.inputs,
        selectOutput: devices.selectOutput,
        selectInput: devices.selectInput,
      };

  return {
    supported: preview ? true : mixer.supported,
    master,
    output,
    sessions: visible,
    presets: showPresets ? (preview ? MIXER_PREVIEW.presets : mixer.presets) : [],
    changeVolume: mixer.changeVolume,
    commitVolume: mixer.commitVolume,
    toggleMuted: mixer.toggleMuted,
    // Refresh here as well as on the revision: the POST resolves after the
    // service has switched the endpoint, which beats the round trip.
    applyPreset: id => { void mixer.applyPreset(id).then(devices.refresh); },
  };
}

export function MixerBody({
  supported,
  master,
  output,
  sessions,
  presets,
  immersive,
  changeVolume,
  commitVolume,
  toggleMuted,
  applyPreset,
}: MixerView) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Master rides the same row, so it pages with everything else.
  const faders: Array<AudioSession | null> = [...(master ? [null] : []), ...sessions];
  const pager = useFaderPager(faders, FADERS_PER_PAGE);
  const presetPager = useMeasuredPager(presets, p => p.name, {
    gap: PRESET_GAP,
    arrowReserve: PRESET_ARROW_RESERVE,
  });

  if (pickerOpen) {
    return (
      <div className={styles.mixer} data-immersive={immersive ? 'true' : 'false'}>
        <MixerOutputPicker
          outputs={output.outputs}
          inputs={output.inputs}
          onSelectOutput={output.selectOutput}
          onSelectInput={output.selectInput}
          onClose={() => setPickerOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className={styles.mixer} data-immersive={immersive ? 'true' : 'false'}>
      <MixerOutputSection name={output.name} onClick={() => setPickerOpen(true)} />

      <div className={styles.faderStage} data-paged={pager.paged ? 'true' : 'false'}>
        {pager.paged && (
          <PanelArrowButton
            side="prev"
            className={styles.faderArrow}
            disabled={pager.page === 0}
            onClick={pager.prev}
            ariaLabel={t('panel.widget.mixer.aria.prevFaders')}
          />
        )}
        <div className={styles.sliderGrid}>
          {pager.visible.map(session => (session === null ? (
            <MixerStrip
              key="@master"
              name={t('panel.widget.mixer.master')}
              volume={master!.volume}
              muted={master!.muted}
              disabled={!master!.supported}
              onChange={master!.change}
              onCommit={master!.commit}
              onToggleMute={master!.toggle}
            />
          ) : (
            <MixerStrip
              key={session.id}
              id={session.id}
              name={sessionLabel(session, t)}
              volume={session.volume}
              muted={session.muted}
              peak={session.peak}
              idle={!session.active}
              onChange={volume => changeVolume(session.id, volume)}
              onCommit={volume => commitVolume(session.id, volume)}
              onToggleMute={() => toggleMuted(session.id, !session.muted)}
            />
          )))}
        </div>
        {pager.paged && (
          <PanelArrowButton
            side="next"
            className={styles.faderArrow}
            disabled={pager.page >= pager.pages - 1}
            onClick={pager.next}
            ariaLabel={t('panel.widget.mixer.aria.nextFaders')}
          />
        )}
      </div>

      {sessions.length === 0 && (
        <div className={styles.hint}>
          {supported ? t('panel.widget.mixer.empty') : t('panel.widget.mixer.unsupported')}
        </div>
      )}

      {presets.length > 0 && (
        <div
          ref={presetPager.stageRef}
          className={styles.presetStage}
          data-paged={presetPager.paged ? 'true' : 'false'}
        >
          {presetPager.paged && (
            <PanelArrowButton
              side="prev"
              className={styles.presetArrow}
              disabled={presetPager.page === 0}
              onClick={presetPager.prev}
              ariaLabel={t('panel.widget.mixer.aria.prevPresets')}
            />
          )}
          <div ref={presetPager.rowRef} className={styles.presets}>
            {presetPager.visible.map(preset => (
              <button
                key={preset.id}
                type="button"
                data-pager-key={preset.name}
                className={styles.preset}
                aria-label={t('panel.widget.mixer.aria.applyPreset', { name: preset.name })}
                onClick={() => applyPreset(preset.id)}
              >
                {preset.name}
              </button>
            ))}
          </div>
          {presetPager.paged && (
            <PanelArrowButton
              side="next"
              className={styles.presetArrow}
              disabled={presetPager.page >= presetPager.pages - 1}
              onClick={presetPager.next}
              ariaLabel={t('panel.widget.mixer.aria.nextPresets')}
            />
          )}
        </div>
      )}
    </div>
  );
}

function sessionLabel(session: AudioSession, t: (key: string) => string): string {
  return session.id === AudioMixerIds.SystemSounds
    ? t('panel.widget.mixer.systemSounds')
    : session.name;
}
