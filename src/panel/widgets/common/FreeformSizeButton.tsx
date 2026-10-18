import { Scaling } from 'lucide-react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { useTranslation } from '../../../lib/i18n';

/** The size picker's entry into freeform resize mode; active while the widget holds a freeform span. */
export function FreeformSizeButton({ active, className, onPress }: { active: boolean; className?: string; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <IconLabelButton
      className={className}
      active={active}
      icon={<Scaling aria-hidden="true" />}
      label={t('devices.panels.widgetSettings.freeform')}
      ariaLabel={t('devices.panels.widgetSettings.freeform.aria')}
      onPress={onPress}
      title={t('devices.panels.widgetSettings.freeform.hint')}
    />
  );
}
