import { useEffect, useState } from 'react';
import { fetchDisplays, setDisplayBrightness } from '../../../api/displays';
import { useDeviceScheduleBinding } from '../../../hooks/useDeviceScheduleBinding';
import { useTranslation } from '../../../lib/i18n';
import { BrightnessScheduleButton } from '../../common/BrightnessScheduleButton/BrightnessScheduleButton';
import { SettingSlider } from '../../common/SettingRow/SettingRow';

// DDC answers slowly after it is switched on, so the first read may not yet report support.
const PROBE_MS = 1500;
const PROBE_TRIES = 6;

/**
 * The brightness row of a DDC display on the Displays tab: the same slider row
 * as the device pages, with the schedule sun keyed by the display id (the key
 * the service uses for DDC monitors). Renders nothing until the display
 * reports DDC brightness.
 */
export function DisplayBrightnessRow({ displayId }: { displayId: string }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<number | null>(null);
  const { binding, modal } = useDeviceScheduleBinding(value !== null ? displayId : null, true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let tries = 0;
    const probe = () => {
      fetchDisplays().then(list => {
        if (cancelled) return;
        const display = list?.displays.find(d => d.id === displayId);
        if (display?.brightnessControl.supported) {
          setValue(display.brightnessControl.current ?? 50);
          return;
        }
        if (++tries < PROBE_TRIES) timer = window.setTimeout(probe, PROBE_MS);
      }).catch(() => {
        if (!cancelled && ++tries < PROBE_TRIES) timer = window.setTimeout(probe, PROBE_MS);
      });
    };
    probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [displayId]);

  if (value === null) return null;
  const write = (v: number) => {
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
        labelSuffix={binding && <BrightnessScheduleButton binding={binding} />}
        value={value}
        min={0}
        max={100}
        onChange={write}
        onCommit={write}
      />
    </>
  );
}
