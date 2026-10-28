import { AdvancedModeSettings } from '../common/AdvancedModeSettings';
import type { WidgetSettingsProps } from '../types';

const LABEL_KEY = 'panel.widget.showModeButtons';

export function LightingSettings(props: WidgetSettingsProps) {
  return <AdvancedModeSettings {...props} labelKey={LABEL_KEY} />;
}
