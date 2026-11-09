import { setDisplayBrightness } from '../../../api/displays';
import { useDdcBrightness } from '../../../hooks/useDdcBrightness';
import { useDeviceScheduleBinding } from '../../../hooks/useDeviceScheduleBinding';
import { useTranslation } from '../../../lib/i18n';
import { SettingSlider } from '../../common/SettingRow/SettingRow';

/**
 * The brightness row of a DDC display on the Displays tab: the same slider row
 * as the device pages, with the schedule sun keyed by the display id (the key
 * the service uses for DDC monitors). Renders nothing until the display
 * reports DDC brightness. A drag only moves the local value; the release
 * writes once.
 */
export function DisplayBrightnessRow({ displayId }: { displayId: string }) {
  const { t } = useTranslation();
  const { value, setValue } = useDdcBrightness(displayId);
  const { binding, modal } = useDeviceScheduleBinding(value !== null ? displayId : null, true);

  if (value === null) return null;
  const commit = (v: number) => {
    setValue(v);
    void setDisplayBrightness(displayId, v).catch(() => {});
  };
  return (
    <>
      {modal}
      <SettingSlider
        editable
        trackFill
        label={t('devices.y70.brightness')}
        schedule={binding ?? undefined}
        value={value}
        min={0}
        max={100}
        onChange={setValue}
        onCommit={commit}
      />
    </>
  );
}
