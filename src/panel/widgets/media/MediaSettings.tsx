import type { WidgetSettingsProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import { SettingsSection, SettingsSelect, SettingsToggle, SettingsHint } from '../common/SettingsRow/SettingsRow';
import { MEDIA_VISUALIZER_EFFECTS, normalizeVisualizerEffect, visualizerLabelKey } from './mediaVisualizers';

export function MediaSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const visualizer = widget.config?.visualizer === true;
  const effect = normalizeVisualizerEffect(widget.config?.visualizerEffect);

  return (
    <SettingsSection title={t('panel.media.visualizer.label')}>
      <SettingsToggle
        label={t('panel.media.visualizer.startOn')}
        checked={visualizer}
        onChange={value => onUpdate({ visualizer: value })}
      />
      <SettingsSelect
        label={t('panel.media.visualizer.effect')}
        value={effect}
        options={MEDIA_VISUALIZER_EFFECTS.map(key => ({ value: key, label: t(visualizerLabelKey(key)) }))}
        onChange={value => onUpdate({ visualizerEffect: value })}
      />
      <SettingsHint>{t('panel.media.visualizer.hint')}</SettingsHint>
    </SettingsSection>
  );
}

export default MediaSettings;
