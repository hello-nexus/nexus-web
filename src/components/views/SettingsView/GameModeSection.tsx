import { BellOff, Cloud, Gamepad2, MonitorOff } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { useGameMode } from '../../../hooks/useGameMode';
import { useTranslation } from '../../../lib/i18n';
import type { GameModeSetting } from '../../../api/gameMode';

const STATES: readonly GameModeSetting[] = ['auto', 'on', 'off'];

/**
 * Game Mode settings. The state select is the trigger (auto / always on /
 * off); the toggles below are what it does while active. The two panel actions
 * are off by default because they change what the hardware is doing.
 */
export function GameModeSection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const { status, setState, setEffects } = useGameMode(serviceOnline);

  const effects = status?.effects;
  const disabled = !serviceOnline || !status;

  return (
    <SettingsSection title={t('gameMode.title')}>
      <SettingSelect
        label={t('gameMode.state.label')}
        anchorId="set-game-mode"
        icon={<Gamepad2 />}
        iconLeading="subtle"
        description={status?.active ? t('gameMode.state.activeNow') : undefined}
        value={status?.state ?? 'auto'}
        options={STATES.map(value => ({ value, label: t(`gameMode.state.${value}`) }))}
        onChange={value => void setState(value as GameModeSetting)}
        disabled={disabled}
      />
      <SettingToggle
        label={t('gameMode.holdNotifications.label')}
        anchorId="set-game-mode-notifications"
        icon={<BellOff />}
        iconLeading="subtle"
        description={t('gameMode.holdNotifications.description')}
        checked={effects?.holdNotifications ?? true}
        onChange={() => void setEffects({ holdNotifications: !effects?.holdNotifications })}
        disabled={disabled}
      />
      <SettingToggle
        label={t('gameMode.holdNetwork.label')}
        anchorId="set-game-mode-network"
        icon={<Cloud />}
        iconLeading="subtle"
        description={t('gameMode.holdNetwork.description')}
        checked={effects?.holdBackgroundNetwork ?? true}
        onChange={() => void setEffects({ holdBackgroundNetwork: !effects?.holdBackgroundNetwork })}
        disabled={disabled}
      />
      <SettingToggle
        label={t('gameMode.displaysOff.label')}
        anchorId="set-game-mode-displays"
        icon={<MonitorOff />}
        iconLeading="subtle"
        description={t('gameMode.displaysOff.description')}
        checked={effects?.turnPanelDisplaysOff ?? false}
        onChange={() => void setEffects({ turnPanelDisplaysOff: !effects?.turnPanelDisplaysOff })}
        disabled={disabled}
      />
    </SettingsSection>
  );
}
