import { AdvancedModeSettings } from '../common/AdvancedModeSettings';
import { SettingsSection, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';

const LABEL_KEY = 'panel.widget.showModeButtons';

export function LightingSettings(props: WidgetSettingsProps) {
  const { t } = useTranslation();
  const { widget, onUpdate } = props;
  return (
    <>
      <AdvancedModeSettings {...props} labelKey={LABEL_KEY} />
      <SettingsSection>
        <SettingsToggle
          label={t('panel.widget.showRecentlyUsed')}
          checked={widget.config?.showRecents === true}
          onChange={value => onUpdate({ ...widget.config, showRecents: value })}
        />
      </SettingsSection>
    </>
  );
}
