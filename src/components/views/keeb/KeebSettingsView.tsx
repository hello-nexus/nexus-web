import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { KeebSettings, RGBA } from '../../../api/keeb';
import { Card } from '../../common/Card/Card';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { Slider } from '../../common/Slider/Slider';
import { useTranslation } from '../../../lib/i18n';
import styles from './KeebSettingsView.module.scss';

// Firmware enum values (wire contract). Display labels come from the
// keeb.fx.* / keeb.speed.* / keeb.reactive.* locale keys.
const FW_EFFECTS = ['Static', 'Breathe', 'Rainbow', 'Wave', 'Flow', 'PingPong'];
const FW_SPEEDS = ['Slow', 'LaidBack', 'Standard', 'Energetic', 'Rapid'];
const KEY_REACTIVE_MODES = ['SingleKey', 'HorizontalLine', 'VerticalLine', 'Ripple'];

const DIRECTIONS: { value: string; icon: ReactNode }[] = [
  { value: 'LeftToRight', icon: <ArrowRight size={16} aria-hidden="true" /> },
  { value: 'RightToLeft', icon: <ArrowLeft size={16} aria-hidden="true" /> },
  { value: 'TopToBottom', icon: <ArrowDown size={16} aria-hidden="true" /> },
  { value: 'BottomToTop', icon: <ArrowUp size={16} aria-hidden="true" /> },
];

export interface KeebSettingsViewProps {
  settings: KeebSettings | null;
  onSaveFirmwareLighting: (next: Pick<KeebSettings, 'animationMode' | 'speed' | 'direction' | 'brightness' | 'keyIndicator'>) => Promise<void>;
  onSavePassiveLighting: (next: Pick<KeebSettings, 'keyReactive' | 'keyReactiveMask' | 'keyReactiveMode' | 'keyReactiveColor'>) => Promise<void>;
  onSaveGameMode: (body: { altF4: boolean; altTab: boolean; shiftTab: boolean; windowsKey: boolean }) => Promise<void>;
}

/// Settings tab: firmware lighting, passive (key-reactive) overlay, game mode.
/// Every change writes through to the persistence layer immediately so the
/// next service start picks them up.
export function KeebSettingsView({
  settings,
  onSaveFirmwareLighting,
  onSavePassiveLighting,
  onSaveGameMode,
}: KeebSettingsViewProps) {
  const { t } = useTranslation();
  // Mirror server state locally so sliders feel instant. We push through to
  // the server on commit (slider release / select change).
  const [local, setLocal] = useState<KeebSettings | null>(settings);

  // Re-sync whenever the server-side fetch refreshes.
  useEffect(() => { setLocal(settings); }, [settings]);

  const setLocalField = useCallback(<K extends keyof KeebSettings>(key: K, value: KeebSettings[K]) => {
    setLocal(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  if (!local) {
    return <div className={styles.loading}>{t('keeb.loading')}</div>;
  }

  const pushFw = (patch: Partial<KeebSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    void onSaveFirmwareLighting({
      animationMode: next.animationMode,
      speed: next.speed,
      direction: next.direction,
      brightness: next.brightness,
      keyIndicator: next.keyIndicator,
    });
  };

  const pushPassive = (patch: Partial<KeebSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    void onSavePassiveLighting({
      keyReactive: next.keyReactive,
      keyReactiveMask: next.keyReactiveMask,
      keyReactiveMode: next.keyReactiveMode,
      keyReactiveColor: next.keyReactiveColor,
    });
  };

  const pushGameMode = (patch: Partial<Pick<KeebSettings, 'altF4Disabled' | 'altTabDisabled' | 'shiftKeyDisabled' | 'windowsKeyDisabled'>>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    void onSaveGameMode({
      altF4: next.altF4Disabled,
      altTab: next.altTabDisabled,
      shiftTab: next.shiftKeyDisabled,
      windowsKey: next.windowsKeyDisabled,
    });
  };

  return (
    <div className={styles.grid}>
      <Card title={t('keeb.settings.firmware.title')} subtitle={t('keeb.settings.firmware.subtitle')}>
        <SettingSelect
          label={t('keeb.settings.effect')}
          value={local.animationMode}
          onChange={v => pushFw({ animationMode: v })}
          options={FW_EFFECTS.map(e => ({ value: e, label: t(`keeb.fx.${e}`) }))}
        />
        <SettingSelect
          label={t('keeb.settings.speed')}
          value={local.speed}
          onChange={v => pushFw({ speed: v })}
          options={FW_SPEEDS.map(s => ({ value: s, label: t(`keeb.speed.${s}`) }))}
        />
        <SettingRow label={t('keeb.settings.brightness')}>
          <Slider
            min={0}
            max={100}
            value={local.brightness}
            onChange={(v, commit) => {
              setLocalField('brightness', v);
              if (commit) pushFw({ brightness: v });
            }}
            ariaLabel={t('keeb.settings.brightness')}
            formatValue={v => `${v}%`}
          />
        </SettingRow>
        <SettingRow label={t('keeb.settings.direction')}>
          <div className={styles.iconGroup}>
            {DIRECTIONS.map(d => (
              <IconLabelButton
                key={d.value}
                icon={d.icon}
                active={local.direction === d.value}
                ariaLabel={t(`keeb.dir.${d.value}`)}
                title={t(`keeb.dir.${d.value}`)}
                onPress={() => pushFw({ direction: d.value })}
              />
            ))}
          </div>
        </SettingRow>
      </Card>

      <Card title={t('keeb.settings.passive.title')} subtitle={t('keeb.settings.passive.subtitle')}>
        <SettingToggle
          label={t('keeb.settings.typeReactive')}
          checked={local.keyReactive}
          onChange={v => pushPassive({ keyReactive: v, keyReactiveMask: v ? local.keyReactiveMask : false })}
        />
        {local.keyReactive && (
          <>
            <SettingToggle
              label={t('keeb.settings.maskEffect')}
              description={t('keeb.settings.maskEffectHint')}
              checked={local.keyReactiveMask}
              onChange={v => pushPassive({ keyReactiveMask: v })}
            />
            <SettingSelect
              label={t('keeb.settings.mode')}
              value={local.keyReactiveMode}
              onChange={v => pushPassive({ keyReactiveMode: v })}
              options={KEY_REACTIVE_MODES.map(m => ({ value: m, label: t(`keeb.reactive.${m}`) }))}
            />
            <SettingRow label={t('keeb.settings.color')}>
              <HsvPicker
                value={rgbToHex(local.keyReactiveColor)}
                onPreview={hex => setLocalField('keyReactiveColor', hexToRgba(hex, local.keyReactiveColor.a))}
                onCommit={hex => pushPassive({ keyReactiveColor: hexToRgba(hex, local.keyReactiveColor.a) })}
              />
            </SettingRow>
          </>
        )}
      </Card>

      <Card title={t('keeb.settings.game.title')} subtitle={t('keeb.settings.game.subtitle')}>
        <SettingToggle
          label={t('keeb.settings.game.altF4')}
          checked={local.altF4Disabled}
          onChange={v => pushGameMode({ altF4Disabled: v })}
        />
        <SettingToggle
          label={t('keeb.settings.game.altTab')}
          checked={local.altTabDisabled}
          onChange={v => pushGameMode({ altTabDisabled: v })}
        />
        <SettingToggle
          label={t('keeb.settings.game.shiftTab')}
          checked={local.shiftKeyDisabled}
          onChange={v => pushGameMode({ shiftKeyDisabled: v })}
        />
        <SettingToggle
          label={t('keeb.settings.game.windowsKey')}
          checked={local.windowsKeyDisabled}
          onChange={v => pushGameMode({ windowsKeyDisabled: v })}
        />
      </Card>
    </div>
  );
}

function rgbToHex(c: RGBA): string {
  const n = (v: number) => v.toString(16).padStart(2, '0');
  return `#${n(c.r)}${n(c.g)}${n(c.b)}`;
}

function hexToRgba(hex: string, a: number): RGBA {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b, a };
}
