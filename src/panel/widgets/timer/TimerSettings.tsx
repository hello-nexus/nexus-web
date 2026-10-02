import { useEffect, useRef } from 'react';
import type { WidgetSettingsProps } from '../types';
import { SettingsSection, SettingsSelect, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import { useTranslation } from '../../../lib/i18n';
import { TIMER_ALARM_SECONDS, TIMER_ALARM_SOUNDS, readTimerAlarm, timerAlarmUrl, type TimerAlarmSound } from './timerAlarm';

export function TimerSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const alarm = readTimerAlarm(widget.config);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => previewRef.current?.pause(), []);

  const pickSound = (value: string) => {
    onUpdate({ alarmSound: value });
    previewRef.current ??= new Audio();
    previewRef.current.src = timerAlarmUrl(value as TimerAlarmSound);
    previewRef.current.play().catch(() => {});
  };

  return (
    <SettingsSection title={t('panel.widget.timer.settings.alarm')}>
      <SettingsToggle
        label={t('panel.widget.timer.settings.playSound')}
        checked={alarm.enabled}
        onChange={value => onUpdate({ alarm: value })}
      />
      {alarm.enabled && (
        <>
          <SettingsSelect
            label={t('panel.widget.timer.settings.sound')}
            value={alarm.sound}
            options={TIMER_ALARM_SOUNDS.map(s => ({ value: s, label: t(`panel.widget.timer.sound.${s}`) }))}
            onChange={pickSound}
          />
          <SettingsSelect
            label={t('panel.widget.timer.settings.ringFor')}
            value={String(alarm.seconds)}
            options={TIMER_ALARM_SECONDS.map(s => ({ value: String(s), label: t('panel.widget.timer.settings.seconds', { n: s }) }))}
            onChange={value => onUpdate({ alarmSeconds: Number(value) })}
          />
        </>
      )}
    </SettingsSection>
  );
}

export default TimerSettings;
