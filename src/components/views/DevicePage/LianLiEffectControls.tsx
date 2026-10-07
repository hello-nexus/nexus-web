import type { ReactNode } from 'react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import type { LianLiEffect, LianLiLightingMode } from '../../../api/lianli';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

// Firmware brightness and speed are discrete levels, shown as a percent.
const PERCENT_PER_LEVEL = 25;
const DEFAULT_COLOR = '#ffffff';
const DEFAULT_COLOR_SECONDARY = '#000000';

interface LianLiEffectControlsProps {
  modes: readonly LianLiLightingMode[];
  effect: LianLiEffect;
  /** The data has not arrived yet, or the Lighting page drives the hub. */
  disabled: boolean;
  loaded: boolean;
  /** Local state for an edit in progress. */
  onPreview: (effect: LianLiEffect) => void;
  /** Saves the changed fields. */
  onCommit: (patch: Partial<LianLiEffect>) => void;
  /** Rendered under the mode picker. */
  children?: ReactNode;
}

/** Mode, brightness, speed, direction and palette of one firmware animation. */
export function LianLiEffectControls({ modes, effect, disabled, loaded, onPreview, onCommit, children }: LianLiEffectControlsProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const selectedMode = modes.find(m => m.key === effect.mode) ?? null;
  // With no colours chosen the firmware plays the mode's own palette, so the pickers show it.
  const shownColors = effect.colors.length > 0 ? effect.colors : (selectedMode?.defaultColors ?? []);

  const setColors = (colors: string[], commit: boolean) => {
    onPreview({ ...effect, colors });
    if (commit) onCommit({ colors });
  };

  return (
    <>
      <SettingSelect
        label={t('devices.lianli.lightingMode')}
        value={effect.mode}
        onChange={v => {
          onPreview({ ...effect, mode: v });
          onCommit({ mode: v });
        }}
        options={modes.map(m => ({ value: m.key, label: m.label }))}
        disabled={disabled}
      />

      {children}

      {selectedMode?.hasBrightness && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli.lightingBrightness')}
          value={effect.brightness * PERCENT_PER_LEVEL}
          min={0}
          max={100}
          step={PERCENT_PER_LEVEL}
          formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
          ariaLabel={t('devices.lianli.lightingBrightnessAria')}
          disabled={disabled}
          onChange={(v: number, commit?: boolean) => {
            const level = Math.round(v / PERCENT_PER_LEVEL);
            onPreview({ ...effect, brightness: level });
            if (commit) onCommit({ brightness: level });
          }}
          onCommit={(v: number) => onCommit({ brightness: Math.round(v / PERCENT_PER_LEVEL) })}
        />
      )}

      {selectedMode?.hasSpeed && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli.lightingSpeed')}
          value={effect.speed * PERCENT_PER_LEVEL}
          min={0}
          max={100}
          step={PERCENT_PER_LEVEL}
          formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
          ariaLabel={t('devices.lianli.lightingSpeedAria')}
          disabled={disabled}
          onChange={(v: number, commit?: boolean) => {
            const level = Math.round(v / PERCENT_PER_LEVEL);
            onPreview({ ...effect, speed: level });
            if (commit) onCommit({ speed: level });
          }}
          onCommit={(v: number) => onCommit({ speed: Math.round(v / PERCENT_PER_LEVEL) })}
        />
      )}

      {selectedMode?.hasDirection && (
        <SettingSelect
          label={t('devices.lianli.lightingDirection')}
          value={String(effect.direction)}
          onChange={v => {
            const direction = Number(v);
            onPreview({ ...effect, direction });
            onCommit({ direction });
          }}
          options={[
            { value: '0', label: t('devices.lianli.directionLtr') },
            { value: '1', label: t('devices.lianli.directionRtl') },
          ]}
          disabled={disabled}
        />
      )}

      {selectedMode && selectedMode.colorsMax > 0 && loaded && (
        <div className={`${styles.colorBlock} ${disabled ? styles.rowDisabled : ''}`} data-settings-aside="true">
          {selectedMode.colorsMax === 2 ? (
            <div className={styles.colorPairRow}>
              {([0, 1] as const).map(i => {
                const color = shownColors[i] ?? DEFAULT_COLOR_SECONDARY;
                const withColor = (hex: string) => {
                  const next = [...shownColors];
                  while (next.length < 2) next.push(DEFAULT_COLOR_SECONDARY);
                  next[i] = hex;
                  return next;
                };
                return (
                  <div key={i} className={styles.colorEntry}>
                    <span className={styles.colorLabel}>
                      {t('devices.lianli.colorN', { n: i + 1 })}
                    </span>
                    <HsvPicker
                      value={color}
                      onPreview={(hex: string) => setColors(withColor(hex), false)}
                      onCommit={(hex: string) => setColors(withColor(hex), true)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {shownColors.map((color, i) => {
                const withColor = (hex: string) => shownColors.map((c, idx) => (idx === i ? hex : c));
                return (
                  <div key={i} className={styles.colorEntry}>
                    <HsvPicker
                      value={color}
                      onPreview={(hex: string) => setColors(withColor(hex), false)}
                      onCommit={(hex: string) => setColors(withColor(hex), true)}
                    />
                    <div className={styles.colorActions}>
                      {/* An emptied list plays the mode's defaults, so the last colour of a mode that has them stays. */}
                      {shownColors.length > Math.max(selectedMode.colorsMin, selectedMode.defaultColors?.length ? 1 : 0) && (
                        <Button
                          size="sm"
                          tone="neutral"
                          onClick={() => setColors(shownColors.filter((_, idx) => idx !== i), true)}
                        >
                          {t('devices.lianli.removeColor')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {shownColors.length < selectedMode.colorsMax && (
                <div className={styles.colorActions}>
                  <Button size="sm" tone="neutral" onClick={() => setColors([...shownColors, DEFAULT_COLOR], true)}>
                    {t('devices.lianli.addColor')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
