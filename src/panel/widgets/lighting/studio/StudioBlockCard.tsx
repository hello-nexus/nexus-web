import { useEffect, useState } from 'react';
import { AudioLines, GripVertical, Pin, X } from 'lucide-react';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import { Card } from '../../../../components/common/Card/Card';
import { Select } from '../../../../components/common/Select/Select';
import { Slider } from '../../../../components/common/Slider/Slider';
import { Button } from '../../../../components/common/Button/Button';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { ColorPickerWithPresets } from '../../../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import type { SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { useTranslation } from '../../../../lib/i18n';
import { DEFAULT_SENSOR_BINDING, type SensorSignal } from '../../../../lib/sensorBinding';
import { SensorBindingEditor } from '../../../../components/common/SensorPicker/SensorBindingEditor';
import { blocksForStage, type StudioBlockDef, type StudioParam } from './studioBlocks';
import {
  MOD_GATE, MOD_RATE, STUDIO_MOD_SOURCES, blockParams, isMusicSource, isSensorSource,
  type StudioBlock, type StudioMod, type StudioModSource, type StudioMusicSource,
} from './studioCompiler';
import styles from './ShaderStudio.module.scss';

const STACKED = 'stacked' as const;
const INLINE = 'inline' as const;

// How often a modulated slider's live marker follows the music.
const LIVE_AUDIO_MS = 66;

type Levels = Partial<Record<StudioMusicSource, number>>;

/** The current level of each of `sources`, sampled while there are any; null when silent. Re-renders only when a level moves. */
function useLiveLevels(audioRef: React.RefObject<AudioSnapshot | null> | undefined, sources: readonly StudioMusicSource[]): Levels | null {
  const [levels, setLevels] = useState<Levels | null>(null);
  const key = sources.join(',');
  useEffect(() => {
    if (!key || !audioRef) return;
    const wanted = key.split(',') as StudioMusicSource[];
    const id = window.setInterval(() => {
      const snap = audioRef.current;
      const next: Levels | null = snap ? Object.fromEntries(wanted.map(s => [s, Math.round((snap[s] ?? 0) * 100) / 100])) : null;
      setLevels(prev => (prev && next && wanted.every(s => prev[s] === next[s]) ? prev : next));
    }, LIVE_AUDIO_MS);
    return () => window.clearInterval(id);
  }, [key, audioRef]);
  return key ? levels : null;
}

// How often a sensor-driven slider's live marker follows the hardware; the readings themselves arrive about once a second.
const LIVE_SENSOR_MS = 250;

/** The live 0..1 reading of each sensor-driven param of `mods`, by param key; null while none is sampled. */
function useLiveSensorLevels(signalRef: React.RefObject<SensorSignal | null> | undefined, mods: StudioBlock['mods']): Record<string, number> | null {
  const [levels, setLevels] = useState<Record<string, number> | null>(null);
  const bound = Object.entries(mods ?? {}).filter(([, m]) => isSensorSource(m.source));
  const key = JSON.stringify(bound.map(([k, m]) => [k, m.sensor]));
  useEffect(() => {
    if (!signalRef || bound.length === 0) return;
    const entries = JSON.parse(key) as [string, StudioMod['sensor']][];
    const id = window.setInterval(() => {
      const next: Record<string, number> = {};
      for (const [k, binding] of entries) {
        const v = signalRef.current?.(binding ?? DEFAULT_SENSOR_BINDING);
        if (v !== null && v !== undefined) next[k] = Math.round(v * 100) / 100;
      }
      setLevels(prev => (prev && Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every(k => prev[k] === next[k]) ? prev : next));
    }, LIVE_SENSOR_MS);
    return () => window.clearInterval(id);
    // bound is derived from key, which is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signalRef]);
  return bound.length > 0 ? levels : null;
}

const COLOR_PRESETS = ['#ff2a8c', '#ff7a1a', '#ffd21f', '#3dff8a', '#00e5ff', '#3a5bff', '#a64dff', '#ffffff'] as const;

export function rgbToHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b].map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Display scale: sliders show integers, as EffectControls does. */
const scaleOf = (p: StudioParam) => (p.step < 1 ? Math.round(1 / p.step) : 1);

interface StudioBlockCardProps {
  block: StudioBlock;
  def: StudioBlockDef;
  firstPattern: boolean;
  removable: boolean;
  /** Types the dropdown may switch to; others in the stage show disabled. */
  canSwitchTo: (type: string) => boolean;
  drag?: SortableRowArgs;
  onChange: (block: StudioBlock, commit: boolean) => void;
  onCommit: () => void;
  onTypeChange: (type: string) => void;
  onRemove: () => void;
  /** Params shown as knobs in the Lighting page's effect controls. */
  isPinned: (key: string) => boolean;
  onTogglePin: (key: string) => void;
  /** Live audio, so a modulated knob shows where the music has it now. */
  audioRef?: React.RefObject<AudioSnapshot | null>;
  /** Live sensor readings, so a sensor-driven knob shows where the hardware has it now. */
  sensorRef?: React.RefObject<SensorSignal | null>;
}

export function StudioBlockCard({
  block, def, firstPattern, removable, canSwitchTo, drag, onChange, onCommit, onTypeChange, onRemove, isPinned, onTogglePin, audioRef, sensorRef,
}: StudioBlockCardProps) {
  const { t } = useTranslation();
  const audio = useLiveLevels(audioRef, [...new Set(Object.values(block.mods ?? {}).map(m => m.source).filter(isMusicSource))]);
  const sensorLevels = useLiveSensorLevels(sensorRef, block.mods);
  const typeOptions = blocksForStage(def.stage).map(d => ({
    value: d.type,
    label: t(`lighting.studio.block.${d.type}`),
    disabled: d.type !== block.type && !canSwitchTo(d.type),
  }));

  const setParam = (key: string, value: number, commit: boolean) =>
    onChange({ ...block, params: { ...block.params, [key]: value } }, commit);

  const toggleMod = (key: string) => {
    const mods = { ...block.mods };
    if (mods[key]) delete mods[key];
    else mods[key] = { source: 'bass', amount: 0.5 };
    onChange({ ...block, mods }, true);
  };

  const setMod = (key: string, patch: Partial<StudioMod>, commit: boolean) => {
    const current = block.mods?.[key];
    if (!current) return;
    const next: StudioMod = { ...current, ...patch };
    // A rate belongs to a wave, a gate to music and a sensor binding to the sensor; switching kinds drops the others'.
    if (isSensorSource(next.source)) {
      delete next.rate;
      delete next.gate;
      next.sensor ??= DEFAULT_SENSOR_BINDING;
    } else {
      delete next.sensor;
      if (isMusicSource(next.source)) delete next.rate;
      else {
        delete next.gate;
        next.rate ??= MOD_RATE.def;
      }
    }
    onChange({ ...block, mods: { ...block.mods, [key]: next } }, commit);
  };

  const renderParam = (p: StudioParam) => {
    const label = t(`lighting.studio.param.${p.key}`);
    const value = block.params[p.key] ?? p.def;
    if (p.options) {
      return (
        <div key={p.key} className={styles.enumRow}>
          <span className={styles.enumLabel}>{label}</span>
          <Select
            ariaLabel={label}
            options={p.options.map((o, i) => ({ value: String(i), label: t(o) }))}
            value={String(Math.round(value))}
            onChange={v => setParam(p.key, Number(v), true)}
          />
        </div>
      );
    }
    const scale = scaleOf(p);
    const mod = block.mods?.[p.key];
    // As the shader does: value + amount x the param's span x the audio source's level (0 to 1), clamped.
    // The slider's band is how far full volume moves the knob; its marker, where the music has it now.
    const clampP = (v: number) => Math.min(p.max, Math.max(p.min, v));
    const swing = mod ? Math.min(1, Math.max(-1, mod.amount)) * (p.max - p.min) : 0;
    const reach = mod ? clampP(value + swing) : null;
    const sensorLive = mod && isSensorSource(mod.source) ? sensorLevels?.[p.key] : undefined;
    const live = mod && audio && isMusicSource(mod.source) ? clampP(value + swing * (audio[mod.source] ?? 0))
      : sensorLive !== undefined ? clampP(value + swing * sensorLive) : null;
    const modLabel = t('lighting.studio.mod.toggle');
    const pinLabel = t('lighting.studio.pin');
    const pinned = isPinned(p.key);
    return (
      <div key={p.key} className={styles.paramBlock}>
        <Slider
          orientation={STACKED} editable trackFill
          label={label}
          labelAction={(
            <span className={styles.paramActions}>
              <HoverTooltip body={pinLabel} side="left">
                <button
                  type="button"
                  className={`${styles.modToggle} ${pinned ? styles.modToggleOn : ''}`}
                  aria-label={pinLabel}
                  aria-pressed={pinned}
                  onClick={() => onTogglePin(p.key)}
                >
                  <Pin size={13} strokeWidth={1.75} />
                </button>
              </HoverTooltip>
              <HoverTooltip body={modLabel} side="left">
                <button
                  type="button"
                  className={`${styles.modToggle} ${mod ? styles.modToggleOn : ''}`}
                  aria-label={modLabel}
                  aria-pressed={!!mod}
                  onClick={() => toggleMod(p.key)}
                >
                  <AudioLines size={13} strokeWidth={1.75} />
                </button>
              </HoverTooltip>
            </span>
          )}
          value={Math.round(value * scale)}
          min={Math.round(p.min * scale)}
          max={Math.round(p.max * scale)}
          band={reach === null ? undefined : [Math.round(value * scale), Math.round(reach * scale)]}
          marker={live === null ? undefined : Math.round(live * scale)}
          onChange={(v, commit) => setParam(p.key, v / scale, !!commit)}
          onCommit={onCommit}
        />
        {mod && (
          <div className={styles.modRow}>
            <Select
              ariaLabel={t('lighting.studio.mod.source')}
              options={STUDIO_MOD_SOURCES.map(s => ({ value: s, label: t(`lighting.studio.mod.${s}`) }))}
              value={mod.source}
              onChange={v => setMod(p.key, { source: v as StudioModSource }, true)}
              height={28}
            />
            <Slider
              orientation={INLINE}
              trackFill
              zeroMarker
              ariaLabel={t('lighting.studio.mod.amount')}
              value={Math.round(mod.amount * 100)}
              min={-100}
              max={100}
              onChange={(v, commit) => setMod(p.key, { amount: v / 100 }, !!commit)}
              onCommit={onCommit}
            />
            {isSensorSource(mod.source) ? (
              <div className={styles.modShape}>
                <SensorBindingEditor
                  binding={mod.sensor ?? DEFAULT_SENSOR_BINDING}
                  ariaLabel={t('lighting.studio.mod.sensor')}
                  onChange={sensor => setMod(p.key, { sensor }, true)}
                />
              </div>
            ) : isMusicSource(mod.source) ? (
              <Slider
                className={styles.modShape}
                orientation={INLINE}
                trackFill
                label={t('lighting.studio.mod.gate')}
                value={Math.round((mod.gate ?? 0) * 100)}
                min={Math.round(MOD_GATE.min * 100)}
                max={Math.round(MOD_GATE.max * 100)}
                onChange={(v, commit) => setMod(p.key, { gate: v / 100 }, !!commit)}
                onCommit={onCommit}
              />
            ) : (
              <Slider
                className={styles.modShape}
                orientation={INLINE}
                trackFill
                label={t('lighting.studio.mod.rate')}
                formatValue={v => (v / 100).toFixed(2)}
                value={Math.round((mod.rate ?? MOD_RATE.def) * 100)}
                min={Math.round(MOD_RATE.min * 100)}
                max={Math.round(MOD_RATE.max * 100)}
                step={Math.round(MOD_RATE.step * 100)}
                onChange={(v, commit) => setMod(p.key, { rate: v / 100 }, !!commit)}
                onCommit={onCommit}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.attributes}
      className={drag?.isDragging ? drag.placeholderClassName : undefined}
    >
      <Card compact className={styles.blockCard}>
        <div className={styles.blockHeader}>
          {drag && (
            <span className={styles.dragHandle} aria-label={t('lighting.studio.reorder')} {...drag.listeners}>
              <GripVertical size={14} />
            </span>
          )}
          <Select
            className={styles.blockType}
            ariaLabel={t(`lighting.studio.stage.${def.stage}`)}
            options={typeOptions}
            value={block.type}
            onChange={onTypeChange}
            accentValue
          />
          {removable && (
            <Button size="sm" tone="ghost" icon={<X size={14} />} aria-label={t('lighting.studio.remove')} onClick={onRemove} />
          )}
        </div>
        <div className={styles.blockParams} data-no-dnd>
          {blockParams(def, firstPattern).map(renderParam)}
          {def.colors?.map(c => (
            <div key={c.key} className={styles.enumRow}>
              <span className={styles.enumLabel}>{t(`lighting.studio.param.${c.key}`)}</span>
              <ColorPickerWithPresets
                value={rgbToHex(block.colors?.[c.key] ?? c.def)}
                presets={COLOR_PRESETS}
                allowCustom
                pickerPortal
                onPreview={hex => onChange({ ...block, colors: { ...block.colors, [c.key]: hexToRgb(hex) } }, false)}
                onCommit={hex => onChange({ ...block, colors: { ...block.colors, [c.key]: hexToRgb(hex) } }, true)}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
