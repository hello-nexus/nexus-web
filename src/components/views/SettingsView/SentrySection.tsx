import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, Smartphone, Timer, TriangleAlert } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, type SettingState } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { armSentry, fetchSentry, type SentryState } from '../../../api/sentry';
import { isRemoteOrigin, isRemotePaired } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';

const POLL_MS = 5000;

// The service accepts lock-and-arm only from the local desktop.
const CAN_LOCK_HERE = !isRemoteOrigin && !isRemotePaired;

const TONES: Record<'on' | 'off' | 'warn', SettingState['tone']> = { on: 'good', off: 'neutral', warn: 'warn' };

// Locks the PC and arms Sentry; hidden where the OS has no lock input watch.
export function SentrySection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<SentryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);
  const readingRef = useRef(false);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const read = async () => {
      if (document.hidden || busyRef.current || readingRef.current) return;
      readingRef.current = true;
      try {
        const next = await fetchSentry().catch(() => null);
        if (cancelled || busyRef.current || !next) return;
        setState(next);
      } finally {
        readingRef.current = false;
      }
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
  const cooldownMinutes = Math.max(1, Math.ceil(state.cooldownSeconds / 60));

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
        {CAN_LOCK_HERE && (
          <Button type="button" size="sm" tone="accent" loading={busy} disabled={!serviceOnline} onClick={lockAndArm}>
            {t('sentry.settings.arm.action')}
          </Button>
        )}
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
      {state.cooldownSeconds > 0 && (
        <SettingRow
          label={t(pluralKey('sentry.settings.cooldown', language, cooldownMinutes), { count: cooldownMinutes })}
          icon={<Timer />}
          iconLeading="subtle"
        />
      )}
    </SettingsSection>
  );
}
