import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, Smartphone, Timer, TriangleAlert } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, type SettingState } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { armSentry, fetchSentry, type SentryState } from '../../../api/sentry';
import { useTranslation } from '../../../lib/i18n';

const POLL_MS = 5000;

const TONES: Record<'on' | 'off' | 'warn', SettingState['tone']> = { on: 'good', off: 'neutral', warn: 'warn' };

// Locks the PC and arms Sentry; hidden where the OS has no lock input watch.
export function SentrySection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const [state, setState] = useState<SentryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const read = async () => {
      if (busyRef.current) return;
      const next = await fetchSentry().catch(() => null);
      if (cancelled || busyRef.current || !next) return;
      setState(next);
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [serviceOnline]);

  const lockAndArm = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const result = await armSentry(true);
      if (result.ok) setState(result.state);
      else setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  if (!state?.supported) return null;

  return (
    <SettingsSection title={t('sentry.settings.title')}>
      <SettingRow
        label={t('sentry.settings.arm.label')}
        icon={<ShieldAlert />}
        iconLeading="subtle"
        description={t('sentry.settings.arm.description')}
        state={{
          label: state.armed ? t('sentry.settings.armed') : t('sentry.settings.off'),
          tone: state.armed ? TONES.on : TONES.off,
        }}
      >
        <Button type="button" size="sm" tone="accent" loading={busy} disabled={!serviceOnline} onClick={lockAndArm}>
          {t('sentry.settings.arm.action')}
        </Button>
      </SettingRow>
      {failed && (
        <SettingRow label={t('sentry.settings.failed')} icon={<TriangleAlert />} iconLeading="subtle" />
      )}
      <SettingRow
        label={t('sentry.settings.phones.label')}
        icon={<Smartphone />}
        iconLeading="subtle"
        description={state.alertPhones === 0 ? t('sentry.settings.phones.none') : undefined}
        state={{ label: String(state.alertPhones), tone: state.alertPhones === 0 ? TONES.warn : TONES.off }}
      />
      <SettingRow
        label={t('sentry.settings.cooldown')}
        icon={<Timer />}
        iconLeading="subtle"
      />
    </SettingsSection>
  );
}
