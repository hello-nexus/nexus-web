import { useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { hsvToHex } from '../../../../lib/settings';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../../../components/common/Slider/Slider';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import type { EffectColorSlot, EffectState } from '../../../../types/lighting';
import styles from '../LightingPage.module.scss';

// Layout enum, not display text; hoisted so the JSX carries no literal.
const STACKED = 'stacked' as const;

/** A slot is three float params, so colours ride the same dictionary the
 *  numeric params already use. */
function read(slot: EffectColorSlot, params: Record<string, number>) {
  return {
    h: params[`u_${slot.id}Hue`] ?? slot.defaultHue,
    s: params[`u_${slot.id}Sat`] ?? slot.defaultSat,
    v: params[`u_${slot.id}Val`] ?? slot.defaultVal,
  };
}

export function slotHex(slot: EffectColorSlot, params: Record<string, number>): string {
  const { h, s, v } = read(slot, params);
  return hsvToHex(h * 360, s * 100, v * 100);
}

/**
 * Colour picker for a static pattern: the same hue wheel the animate drawer
 * uses, plus saturation and brightness. With more than one colour a swatch row
 * selects which the wheel edits, so a four-colour effect still fits the pane.
 */
export function StaticColorSlots({ slots, state, onChange, onCommit }: {
  slots: EffectColorSlot[];
  state: EffectState;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
}) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(slots[0]?.id);
  const active = slots.find(s => s.id === activeId) ?? slots[0];
  if (!active) return null;

  const { h, s, v } = read(active, state.params);
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
                    style={{ backgroundColor: slotHex(slot, state.params) }}
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
