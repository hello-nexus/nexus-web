import { memo } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { EFFECTS, categoryOf, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { useShaderParams } from '../../../../hooks/useShaderParams';
import { clampToSpec } from '../../../../lib/shaderParams';
import { Slider } from '../../../../components/common/Slider/Slider';
import { Select } from '../../../../components/common/Select/Select';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { EffectTemplateSelector } from '../../../../components/common/EffectTemplateSelector/EffectTemplateSelector';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { StaticColorSlots } from './StaticColorSlots';
import styles from '../LightingPage.module.scss';

/** value clamped to [min, max] for display, in the slider's own units. */
function clampDisplay(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Body of the animate-effect controls: preset swatches row, palette ring,
 * slider stack, and scoped reset footer. Rendered directly in the right-pane
 * Effect tab and wrapped in the slide-drawer shell used by FullscreenShader.
 * All slider state flows up through the same onChange/onCommit/onReset handlers
 * so the two mount points share a single React state tree.
 */
export const EffectControls = memo(function EffectControls({
  effect, state, bundle,
  onTemplateSelect, canReset,
  onChange, onCommit, onReset,
  rgbActiveSlot, panelSlots, staticMode,
}: {
  effect: string;
  state: EffectState;
  bundle: EffectTemplateBundle;
  onTemplateSelect: (idx: number) => void;
  canReset: boolean;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
  /** Preset slot live on the RGB hardware (bulb badge). Panels only. */
  rgbActiveSlot?: number | null;
  /** Preset slots used as a background by ≥1 panel (panel badge). Panels only. */
  panelSlots?: Set<number> | null;
  /** Static mode: no speed control, and patterns gain a hex colour entry. */
  staticMode?: boolean;
}) {
  const { t } = useTranslation();
  const def = EFFECTS.find(e => e.key === effect);
  const { specs, loaded } = useShaderParams(effect);
  if (!def) return null;
  const selected = bundle.selected;
  // Simple fills are a fixed base colour: no colour wheel, no speed, no
  // contrast, and no preset slots - one look plus its sliders. Saturation is
  // the HSV-S post-process multiplier; simple.frag narrows u_saturation's own
  // range with a hint_range override line, so satSpec needs no isSimple branch.
  const isSimple = categoryOf(effect) === 'simple';
  // Static patterns write fragColor directly from their own colour params, so
  // the tint post-process (palette ring, saturation, contrast, the global hex)
  // has no effect on them - showing those controls would be a dead UI.
  const ownsColors = !!def.colors?.length;
  const isSimpleWhite = effect === 'simplewhite';
  const speedSpec = specs['u_speed'];
  const satSpec = specs['u_saturation'];
  const contrastSpec = specs['u_contrast'];
  const intensitySpec = specs['u_intensity'];
  return (
    <div className={styles.effectControls}>
      {!isSimple && (
        <EffectTemplateSelector
          className={styles.drawerTemplates}
          effect={effect}
          slots={bundle.slots}
          activeIndex={selected}
          onSelect={onTemplateSelect}
          ariaLabel="Presets"
          rgbActiveSlot={rgbActiveSlot}
          panelSlots={panelSlots}
        />
      )}
      <div className={styles.drawerSliders}>
        {ownsColors && (
          <StaticColorSlots slots={def.colors!} state={state} specs={specs} onChange={onChange} onCommit={onCommit} />
        )}
        {!isSimple && !ownsColors && (
          <div className={styles.paletteRingWrap}>
            <PaletteRing
              hue={state.hue}
              colorize={state.colorize}
              onChange={(hue, colorize, commit) => onChange({ hue, colorize }, commit)}
              onCommit={onCommit}
            />
          </div>
        )}
        {loaded && !def.hideSpeed && !staticMode && speedSpec && (
          <Slider orientation="stacked" editable trackFill label={t('lighting.controls.speed')}
            value={clampDisplay(state.speed, speedSpec.min * 50, speedSpec.max * 50)}
            min={Math.round(speedSpec.min * 50)} max={Math.round(speedSpec.max * 50)} zeroMarker
            onChange={(v, commit) => onChange({ speed: v }, commit)} onCommit={onCommit} />
        )}
        {loaded && !isSimpleWhite && !ownsColors && satSpec && (
          <Slider orientation="stacked" editable trackFill label={t('lighting.controls.saturation')}
            value={clampDisplay(Math.round(state.saturation * 100), Math.round(satSpec.min * 100), Math.round(satSpec.max * 100))}
            min={Math.round(satSpec.min * 100)} max={Math.round(satSpec.max * 100)}
            onChange={(v, commit) => onChange({ saturation: v / 100 }, commit)} onCommit={onCommit} />
        )}
        {loaded && !isSimple && !ownsColors && contrastSpec && (
          <Slider orientation="stacked" editable trackFill label={t('lighting.controls.contrast')}
            value={clampDisplay(Math.round(state.contrast * 100), Math.round(contrastSpec.min * 100), Math.round(contrastSpec.max * 100))}
            min={Math.round(contrastSpec.min * 100)} max={Math.round(contrastSpec.max * 100)}
            onChange={(v, commit) => onChange({ contrast: v / 100 }, commit)} onCommit={onCommit} />
        )}
        {loaded && def.showIntensity && intensitySpec && (
          <Slider orientation="stacked" editable trackFill label={t('lighting.controls.intensity')}
            value={clampDisplay(Math.round(state.intensity * 100), Math.round(intensitySpec.min * 100), Math.round(intensitySpec.max * 100))}
            min={Math.round(intensitySpec.min * 100)} max={Math.round(intensitySpec.max * 100)}
            onChange={(v, commit) => onChange({ intensity: v / 100 }, commit)} onCommit={onCommit} />
        )}
        {loaded && def.params.map(p => {
          const spec = specs[p.name];
          if (!spec) return null;
          const label = p.labelKey ? t(p.labelKey) : p.label;
          if (p.options) {
            const currentVal = Math.round(clampToSpec(state.params[p.name] ?? spec.defaultValue, spec));
            return (
              <div key={p.name} className={styles.paramEnumRow}>
                <span className={styles.paramEnumLabel}>{label}</span>
                <Select
                  ariaLabel={label}
                  options={p.options.map(o => ({ value: String(o.value), label: t(o.labelKey) }))}
                  value={String(currentVal)}
                  onChange={v => onChange({ params: { ...state.params, [p.name]: Number(v) } }, true)}
                />
              </div>
            );
          }
          const scale = spec.step < 1 ? Math.round(1 / spec.step) : 1;
          const rawValue = clampToSpec(state.params[p.name] ?? spec.defaultValue, spec);
          const displayValue = Math.round(rawValue * scale);
          const min = Math.round(spec.min * scale);
          const max = Math.round(spec.max * scale);
          return (
            <Slider orientation="stacked" editable trackFill key={p.name} label={label} value={displayValue} min={min} max={max} zeroMarker={p.zeroMarker}
              onChange={(v, commit) => onChange({ params: { ...state.params, [p.name]: v / scale } }, commit)}
              onCommit={onCommit} />
          );
        })}
      </div>
      <div className={styles.drawerFooter}>
        <HoverTooltip
          body={canReset
            ? `${t('lighting.controls.reset')} preset ${selected + 1}`
            : `Preset ${selected + 1} is unchanged`}
          side="top"
        >
          <button
            type="button"
            className={styles.drawerReset}
            onClick={onReset}
            disabled={!canReset}
            aria-label={`${t('lighting.controls.reset')} preset ${selected + 1}`}
          >{t('lighting.controls.reset')}</button>
        </HoverTooltip>
      </div>
    </div>
  );
});
