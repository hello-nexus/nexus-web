import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Thermometer } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Slider } from '../../common/Slider/Slider';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { useThermalGuard } from '../../../hooks/useThermalGuard';
import { useTranslation } from '../../../lib/i18n';
import type { GuardResponse } from '../../../api/cooling';
import { guardEnabled } from '../../../panel/widgets/cooling/page/guardUtils';
import styles from './ThermalGuardSetting.module.scss';

const STACKED = 'stacked' as const;
// The service clamps an out-of-range override; these bounds cover every shipping part.
const LIMIT_MIN_C = 85;
const LIMIT_MAX_C = 110;
const DETECTED_KEYS = {
  hardware: 'cooling.guard.limit.detectedHardware',
  spec: 'cooling.guard.limit.detectedSpec',
  default: 'cooling.guard.limit.detectedDefault',
} as const;
// Arrow keys commit on every key release; waiting for the value to settle sends one write per adjustment.
const COMMIT_SETTLE_MS = 400;

interface LimitRowProps {
  guard: GuardResponse;
  pending: boolean;
  onCommit: (c: number) => Promise<void> | void;
  onReset: () => void;
}

function LimitRow({ guard, pending, onCommit, onReset }: LimitRowProps) {
  const { t } = useTranslation();
  // Held from the first drag tick until the write answers, so the thumb does not snap back meanwhile.
  const [draft, setDraft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  const lastSentRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  // limitC is omitted while the guard is off, so read the override and the detected value first.
  const detected = guard.detectedLimitC ?? guard.limitC ?? LIMIT_MIN_C;
  const effective = guard.limitOverrideC ?? guard.detectedLimitC ?? guard.limitC ?? LIMIT_MIN_C;
  const effectiveRef = useRef(effective);
  effectiveRef.current = effective;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // One write in flight; a value that settles meanwhile is sent once it answers.
  const send = async (value: number) => {
    if (sendingRef.current) {
      queuedRef.current = value;
      return;
    }
    sendingRef.current = true;
    lastSentRef.current = effectiveRef.current;
    let next: number | null = value;
    while (next != null) {
      queuedRef.current = null;
      if (next !== lastSentRef.current) {
        lastSentRef.current = next;
        await onCommitRef.current(next);
      }
      next = queuedRef.current;
    }
    sendingRef.current = false;
    setDraft(null);
  };

  const commit = (value: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void send(value);
    }, COMMIT_SETTLE_MS);
  };

  const detectedKey = DETECTED_KEYS[guard.detectedLimitSource ?? 'default'];

  return (
    <SettingRow
      label={t('cooling.guard.limit.label')}
      description={(
        <>
          {t(detectedKey, { temp: Math.round(detected) })}
          <br />
          {t('cooling.guard.limit.note')}
        </>
      )}
      descriptionBelow
      icon={<Thermometer />}
      iconLeading="subtle"
      anchorId="set-thermal-guard-limit"
    >
      <div className={styles.limitControl}>
        {/* Never disabled while a write is pending: that would drop keyboard focus mid-adjustment. */}
        <Slider
          orientation={STACKED}
          editable
          trackFill
          min={LIMIT_MIN_C}
          max={LIMIT_MAX_C}
          step={1}
          value={draft ?? effective}
          formatValue={v => t('cooling.curve.tempBadge', { temp: v })}
          onChange={v => setDraft(v)}
          onCommit={commit}
          ariaLabel={t('cooling.guard.limit.label')}
        />
        {guard.limitOverrideC != null && (
          <Button type="button" size="sm" disabled={pending} onClick={onReset}>
            {t('cooling.guard.limit.reset')}
          </Button>
        )}
      </div>
    </SettingRow>
  );
}

interface ThermalGuardSettingViewProps {
  guard: GuardResponse;
  /** A write is in flight; the controls disable. */
  pending: boolean;
  error: string | null;
  onToggle: (enabled: boolean) => void;
  onSetLimit: (c: number) => Promise<void> | void;
  onClearLimit: () => void;
}

/** The settings rows themselves, apart from the service wiring. */
export function ThermalGuardSettingView({
  guard, pending, error, onToggle, onSetLimit, onClearLimit,
}: ThermalGuardSettingViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <SettingToggle
        label={t('cooling.guard.label')}
        description={(
          <>
            {t('cooling.guard.description')}
            {guard.state === 'inactive' && <span role="status">{` ${t('cooling.guard.inactive')}`}</span>}
            {error && <span role="alert">{` ${error}`}</span>}
          </>
        )}
        icon={<ShieldCheck />}
        iconLeading="subtle"
        anchorId="set-thermal-guard"
        checked={guardEnabled(guard)}
        disabled={pending}
        onChange={onToggle}
      />
      {guard.detectedLimitSource && (
        <LimitRow guard={guard} pending={pending} onCommit={onSetLimit} onReset={onClearLimit} />
      )}
    </>
  );
}

/**
 * Settings > Cooling controls for the CPU thermal guard: the switch (on by
 * default; the service reads a missing setting as on) and the temperature
 * limit slider (always shown, default the detected value). Hidden until the service reports a guard, so an older service shows
 * no dead controls.
 */
export function ThermalGuardSetting({ serviceOnline }: { serviceOnline: boolean }) {
  const { guard, toggling, error, toggle, setLimit, clearLimit } = useThermalGuard(serviceOnline);
  if (!guard) return null;
  return (
    <ThermalGuardSettingView
      guard={guard}
      pending={toggling}
      error={error?.message ?? null}
      onToggle={next => { void toggle(next); }}
      onSetLimit={setLimit}
      onClearLimit={() => { void clearLimit(); }}
    />
  );
}
