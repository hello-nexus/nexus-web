import { memo } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { EFFECTS, categoryOf, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { Slider } from '../../../../components/common/Slider/Slider';
import { Select } from '../../../../components/common/Select/Select';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { EffectTemplateSelector } from '../../../../components/common/EffectTemplateSelector/EffectTemplateSelector';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

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
  rgbActiveSlot, panelSlots,
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
}) {
  const { t } = useTranslation();
  const def = EFFECTS.find(e => e.key === effect);
  if (!def) return null;
  const selected = bundle.selected;
  // Simple fills are a fixed base colour: no colour wheel, and the saturation
  // slider is HSV saturation (0 = white .. 100 = full colour), capped at 100.
  const isSimple = categoryOf(effect) === 'simple';
  return (
    <div className={styles.effectControls}>
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
      <div className={styles.drawerSliders}>
        {!isSimple && (
          <div className={styles.paletteRingWrap}>
            <PaletteRing
              hue={state.hue}
              colorize={state.colorize}
              onChange={(hue, colorize, commit) => onChange({ hue, colorize }, commit)}
              onCommit={onCommit}
            />
          </div>
        )}
        {!def.hideSpeed && (
          <Slider orientation="stacked" editable trackFill label={t('lighting.controls.speed')} value={state.speed} min={-100} max={100} zeroMarker
            onChange={(v, commit) => onChange({ speed: v }, commit)} onCommit={onCommit} />
        )}
        <Slider orientation="stacked" editable trackFill label={t('lighting.controls.saturation')} value={Math.round(Math.min(state.saturation, isSimple ? 1 : 4) * 100)} min={0} max={isSimple ? 100 : 400}
          onChange={(v, commit) => onChange({ saturation: v / 100 }, commit)} onCommit={onCommit} />
        <Slider orientation="stacked" editable trackFill label={t('lighting.controls.contrast')} value={Math.round(state.contrast * 100)} min={0} max={400}
          onChange={(v, commit) => onChange({ contrast: v / 100 }, commit)} onCommit={onCommit} />
        {def.showIntensity && (
          <Slider orientation="stacked" editable trackFill label={t('lighting.controls.intensity')} value={Math.round(state.intensity * 100)} min={0} max={100}
            onChange={(v, commit) => onChange({ intensity: v / 100 }, commit)} onCommit={onCommit} />
        )}
        {def.params.map(p => {
          const label = p.labelKey ? t(p.labelKey) : p.label;
          if (p.options) {
            const currentVal = Math.round(state.params[p.name] ?? p.defaultValue);
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
          const scale = p.step < 1 ? Math.round(1 / p.step) : 1;
          const displayValue = Math.round((state.params[p.name] ?? p.defaultValue) * scale);
          const min = Math.round(p.min * scale);
          const max = Math.round(p.max * scale);
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
