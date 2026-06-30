import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { SettingsSection } from '../../../../components/common/SettingsSection/SettingsSection';
import { SettingToggle, SettingRow } from '../../../../components/common/SettingRow/SettingRow';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { Button } from '../../../../components/common/Button/Button';
import type { HubComposition, HubCompositionPatch } from '../../../../api/lighting';

interface Props {
  composition: HubComposition;
  onChange: (patch: HubCompositionPatch) => void;
  /** When set, render a button that deep-links to the hub's device page (where
   * per-port fan counts - and thus the device set - are configured). */
  onOpenDeviceSettings?: () => void;
}

export function HubCompositionPanel({ composition, onChange, onOpenDeviceSettings }: Props) {
  const { t } = useTranslation();

  const portOptions = useMemo(() =>
    Array.from({ length: composition.portCount }, (_, i) => ({
      key: String(i),
      label: t('lighting.ledMap.hubPortLabel', { n: String(i + 1) }),
    })),
    [composition.portCount, t],
  );

  const activePortKeys = useMemo(() => {
    const s = new Set<string>();
    composition.activePorts.forEach((on, i) => { if (on) s.add(String(i)); });
    return s;
  }, [composition.activePorts]);

  const activePortCount = composition.mirror ? 1 : composition.activePorts.filter(Boolean).length;
  const zonesPerPort = composition.hasRingsAxis && !composition.combineRings ? 2 : 1;
  const deviceCount = activePortCount * zonesPerPort;

  const handleTogglePort = (key: string) => {
    const idx = parseInt(key, 10);
    const next = [...composition.activePorts];
    next[idx] = !next[idx];
    onChange({ ports: next });
  };

  return (
    <SettingsSection
      title={t('lighting.ledMap.hubCompositionTitle')}
      description={t('lighting.ledMap.hubDeviceCount', { count: String(deviceCount) })}
    >
      {composition.hasMirror && (
        <SettingToggle
          label={t('lighting.ledMap.hubMirror')}
          checked={composition.mirror}
          onChange={v => onChange({ mirror: v })}
        />
      )}
      {composition.hasRingsAxis && (
        <SettingToggle
          label={t('lighting.ledMap.hubCombineRings')}
          checked={composition.combineRings}
          onChange={v => onChange({ combineRings: v })}
        />
      )}
      {composition.hasPortToggle && (
        <SettingRow label={t('lighting.ledMap.hubPorts')}>
          <ChipGroup
            multiSelect
            options={portOptions}
            activeKeys={activePortKeys}
            onToggleKey={handleTogglePort}
            ariaLabel={t('lighting.ledMap.hubPorts')}
          />
        </SettingRow>
      )}
      {onOpenDeviceSettings && (
        <Button
          size="sm"
          tone="neutral"
          icon={<SlidersHorizontal size={14} />}
          onClick={onOpenDeviceSettings}
        >
          {t('lighting.ledMap.hubOpenDeviceSettings')}
        </Button>
      )}
    </SettingsSection>
  );
}
