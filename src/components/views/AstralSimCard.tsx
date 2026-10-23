import { useEffect, useState } from 'react';
import { fetchDevSimAstral, setDevSimAstral, stopDevSimAstral, type DevSimAstral } from '../../api/devSim';
import { useTranslation } from '../../lib/i18n';
import { Card } from '../common/Card/Card';
import { ChipGroup } from '../common/ChipGroup/ChipGroup';
import { InlineError } from '../common/InlineError/InlineError';
import { SettingRow, SettingToggle } from '../common/SettingRow/SettingRow';
import { SettingsSection } from '../common/SettingsSection/SettingsSection';
import { Slider } from '../common/Slider/Slider';
import { ASTRAL_PRESETS, matchingPreset } from './astralSimPresets';
import styles from './ToolsView.module.scss';

/** Dev-tools-only card on the Tools page: a simulated ROG Astral driving the real page, alerts and countdown. */
export function AstralSimCard() {
  const { t } = useTranslation();
  const [sim, setSim] = useState<DevSimAstral | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchDevSimAstral().then(next => { if (!cancelled) { if (next) setSim(next); else setError(true); } });
    return () => { cancelled = true; };
  }, []);

  const send = async (request: Promise<DevSimAstral | null>) => {
    const next = await request;
    setError(!next);
    if (next) setSim(next);
  };
  const patch = (body: Partial<Omit<DevSimAstral, 'active'>>) => { void send(setDevSimAstral(body)); };
  const local = (body: Partial<DevSimAstral>) => setSim(prev => prev && { ...prev, ...body });

  if (!sim && !error) return null;
  const active = sim?.active ?? false;
  const pinAmps = sim?.pinAmps ?? ASTRAL_PRESETS.normal;

  return (
    <Card title={t('tools.simAstral.title')}>
      <span className={styles.dim}>{t('tools.simAstral.description')}</span>
      <SettingToggle
        label={t('tools.simAstral.card')}
        checked={active}
        disabled={!sim}
        onChange={on => { void send(on ? setDevSimAstral({}) : stopDevSimAstral()); }}
      />
      <SettingRow label={t('tools.simAstral.presets')}>
        <ChipGroup
          ariaLabel={t('tools.simAstral.presets')}
          activeKey={matchingPreset(pinAmps)}
          options={Object.keys(ASTRAL_PRESETS).map(key => ({ key, label: t(`tools.simAstral.preset.${key}`), disabled: !active }))}
          onChange={key => { local({ pinAmps: ASTRAL_PRESETS[key] }); patch({ pinAmps: ASTRAL_PRESETS[key] }); }}
        />
      </SettingRow>
      <SettingsSection title={t('tools.simAstral.level')} ariaLabel={t('tools.simAstral.level')}>
        {(['sag', 'lean'] as const).map(key => (
          <Slider
            key={key}
            editable
            trackFill
            orientation="stacked"
            label={t(`tools.simAstral.${key}`)}
            value={sim?.[key] ?? 0}
            min={-2}
            max={2}
            step={0.05}
            disabled={!active}
            formatValue={v => `${v.toFixed(2)}°`}
            onChange={v => local({ [key]: v })}
            onCommit={v => patch({ [key]: v })}
          />
        ))}
      </SettingsSection>
      <SettingsSection title={t('tools.simAstral.pins')} ariaLabel={t('tools.simAstral.pins')}>
        {pinAmps.map((amps, i) => (
          <Slider
            key={i}
            editable
            trackFill
            orientation="stacked"
            label={t('tools.simAstral.pin', { n: i + 1 })}
            value={amps}
            min={0}
            max={20}
            step={0.1}
            disabled={!active}
            formatValue={v => `${v.toFixed(1)} A`}
            onChange={v => local({ pinAmps: pinAmps.map((a, j) => (j === i ? v : a)) })}
            onCommit={v => patch({ pinAmps: pinAmps.map((a, j) => (j === i ? v : a)) })}
          />
        ))}
      </SettingsSection>
      {error && <InlineError>{t('tools.simAstral.error')}</InlineError>}
    </Card>
  );
}
