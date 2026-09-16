import { useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { hsvToHex } from '../../../../lib/settings';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../../../components/common/Slider/Slider';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import type { EffectColorSlot, EffectState } from '../../../../types/lighting';
import type { ShaderParamSpec } from '../../../../lib/shaderParams';
import styles from '../LightingPage.module.scss';

// Layout enum, not display text; hoisted so the JSX carries no literal.
const STACKED = 'stacked' as const;

/** A slot is three float params, so colours ride the same dictionary the
 *  numeric params already use; defaults come from the shader spec, falling
 *  back to a saturated red before the spec has loaded. */
function read(slot: EffectColorSlot, params: Record<string, number>, specs: Record<string, ShaderParamSpec>) {
  return {
    h: params[`u_${slot.id}Hue`] ?? specs[`u_${slot.id}Hue`]?.defaultValue ?? 0,
    s: params[`u_${slot.id}Sat`] ?? specs[`u_${slot.id}Sat`]?.defaultValue ?? 1,
    v: params[`u_${slot.id}Val`] ?? specs[`u_${slot.id}Val`]?.defaultValue ?? 1,
  };
}

export function slotHex(slot: EffectColorSlot, params: Record<string, number>, specs: Record<string, ShaderParamSpec>): string {
  const { h, s, v } = read(slot, params, specs);
  return hsvToHex(h * 360, s * 100, v * 100);
}

/**
 * Colour picker for a static pattern: the same hue wheel the animate drawer
 * uses, plus saturation and brightness. With more than one colour a swatch row
 * selects which the wheel edits, so a four-colour effect still fits the pane.
 */
export function StaticColorSlots({ slots, state, specs, onChange, onCommit }: {
  slots: EffectColorSlot[];
  state: EffectState;
  specs: Record<string, ShaderParamSpec>;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
}) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(slots[0]?.id);
  const active = slots.find(s => s.id === activeId) ?? slots[0];
  if (!active) return null;

  const { h, s, v } = read(active, state.params, specs);
  const patch = (next: { h?: number; s?: number; v?: number }, commit: boolean) => {
    onChange({
      params: {
        ...state.params,
        [`u_${active.id}Hue`]: next.h ?? h,
        [`u_${active.id}Sat`]: next.s ?? s,
        [`u_${active.id}Val`]: next.v ?? v,
      },
    }, commit);
  };

  return (
    <div className={styles.staticColorSlots}>
      {slots.length > 1 && (
        <>
          <span className={styles.staticSwatchTitle}>{t('lighting.controls.colors')}</span>
          <div className={styles.staticSwatchRow}>
            {slots.map(slot => {
              const selected = slot.id === active.id;
              return (
                <HoverTooltip key={slot.id} body={t(slot.labelKey)} side="top">
                  <button
                    type="button"
                    className={`${styles.staticSwatch} ${selected ? styles.staticSwatchActive : ''}`}
                    style={{ backgroundColor: slotHex(slot, state.params, specs) }}
                    onClick={() => setActiveId(slot.id)}
                    aria-label={t(slot.labelKey)}
                    aria-pressed={selected}
                  />
                </HoverTooltip>
              );
            })}
          </div>
        </>
      )}
      <div className={styles.paletteRingWrap}>
        <PaletteRing
          hueOnly
          hue={h}
          colorize={0}
          onChange={(nextHue, _colorize, commit) => patch({ h: nextHue }, commit)}
          onCommit={onCommit}
        />
      </div>
      <Slider orientation={STACKED} editable trackFill label={t('lighting.controls.saturation')} value={Math.round(s * 100)} min={0} max={100}
        onChange={(val, commit) => patch({ s: val / 100 }, !!commit)} onCommit={onCommit} />
      <Slider orientation={STACKED} editable trackFill label={t('lighting.controls.param.brightness')} value={Math.round(v * 100)} min={0} max={100}
        onChange={(val, commit) => patch({ v: val / 100 }, !!commit)} onCommit={onCommit} />
    </div>
  );
}
