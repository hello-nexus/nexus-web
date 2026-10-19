import type { ReactNode } from 'react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import type { LianLiWirelessLightingEffect } from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const PERCENT_PER_LEVEL = 25;
// Palette slots shown for a service that reports no default colors of its own.
export const LIANLI_DEFAULT_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];

type Translate = ReturnType<typeof useTranslation>['t'];

export function effectLabel(t: Translate, key: string): string {
  return t(`devices.lianliEffect.${key}` as Parameters<Translate>[0]);
}

export interface LianLiEffectValue {
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
}

interface LianLiChainEffectControlsProps {
  modes: readonly LianLiWirelessLightingEffect[];
  value: LianLiEffectValue;
  /** What the mode picker lists; the chain adds its own non-effect choices. */
  modeOptions: { value: string; label: string }[];
  /** The picker's selection, which is not the effect while a non-effect choice is made. */
  modeValue: string;
  disabled: boolean;
  /** Dims the palette without locking it, as the Lighting page does while it owns the fan. */
  paletteDimmed?: boolean;
  hideBrightness?: boolean;
  /** Saves only the colors the effect uses; a service that caps the palette refuses more. */
  trimPalette?: boolean;
  /** Shows the speed slider even for an effect that has none of its own. */
  forceSpeed?: boolean;
  onModeChange: (key: string) => void;
  onPreview: (patch: Partial<LianLiEffectValue>) => void;
  onCommit: (patch: Partial<LianLiEffectValue>) => void;
  /** Rendered under the mode picker. */
  children?: ReactNode;
}

/** Mode, brightness, speed, direction and palette of one wireless-style animation. */
export function LianLiChainEffectControls({
  modes, value, modeOptions, modeValue, disabled, paletteDimmed = false, hideBrightness = false, forceSpeed = false, trimPalette = false,
  onModeChange, onPreview, onCommit, children,
}: LianLiChainEffectControlsProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const effect = modes.find(e => e.key === value.mode) ?? null;
  const percent = (v: number) => localizeNumbers(`${v}%`, numberFormat);
  const directionOptions = [
    { value: '0', label: t('devices.lianli.directionLtr') },
    { value: '1', label: t('devices.lianli.directionRtl') },
  ];

  // The palette is a fixed set of slots; an effect reads its first colorsMax. Empty slots show
  // what the effect plays by default.
  const fallbacks = effect?.defaultColors?.length ? effect.defaultColors : LIANLI_DEFAULT_COLORS;
  const palette = LIANLI_DEFAULT_COLORS.map((slot, i) => value.colors[i] ?? fallbacks[i] ?? slot);
  const setColor = (i: number, hex: string, commit: boolean) => {
    const next = [...palette];
    next[i] = hex;
    (commit ? onCommit : onPreview)({ colors: trimPalette && effect ? next.slice(0, effect.colorsMax) : next });
  };

  return (
    <>
      <SettingSelect
        label={t('devices.lianli.lightingMode')}
        value={modeValue}
        onChange={onModeChange}
        options={modeOptions}
        disabled={disabled}
      />

      {children}

      {!hideBrightness && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli.lightingBrightness')}
          value={value.brightness * PERCENT_PER_LEVEL}
          min={0}
          max={100}
          step={PERCENT_PER_LEVEL}
          formatValue={percent}
          ariaLabel={t('devices.lianli.lightingBrightnessAria')}
          disabled={disabled}
          onChange={(v: number, commit?: boolean) => {
            const level = Math.round(v / PERCENT_PER_LEVEL);
            (commit ? onCommit : onPreview)({ brightness: level });
          }}
          onCommit={(v: number) => onCommit({ brightness: Math.round(v / PERCENT_PER_LEVEL) })}
        />
      )}

      {(forceSpeed || effect?.hasSpeed) && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli.lightingSpeed')}
          value={value.speed * PERCENT_PER_LEVEL}
          min={0}
          max={100}
          step={PERCENT_PER_LEVEL}
          formatValue={percent}
          ariaLabel={t('devices.lianli.lightingSpeedAria')}
          disabled={disabled}
          onChange={(v: number, commit?: boolean) => {
            const level = Math.round(v / PERCENT_PER_LEVEL);
            (commit ? onCommit : onPreview)({ speed: level });
          }}
          onCommit={(v: number) => onCommit({ speed: Math.round(v / PERCENT_PER_LEVEL) })}
        />
      )}

      {effect?.hasDirection && (
        <SettingSelect
          label={t('devices.lianli.lightingDirection')}
          value={String(value.direction)}
          onChange={v => onCommit({ direction: Number(v) })}
          options={directionOptions}
          disabled={disabled}
        />
      )}

      {effect && effect.colorsMax > 0 && (
        <div className={`${styles.colorBlock} ${paletteDimmed ? styles.rowDisabled : ''}`} data-settings-aside="true">
          <div className={styles.colorPairRow}>
            {palette.slice(0, effect.colorsMax).map((color, i) => (
              <div key={i} className={styles.colorEntry}>
                <span className={styles.colorLabel}>{t('devices.lianli.colorN', { n: i + 1 })}</span>
                <HsvPicker
                  value={color}
                  onPreview={(hex: string) => setColor(i, hex, false)}
                  onCommit={(hex: string) => setColor(i, hex, true)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
