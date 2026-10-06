import { useState } from 'react';
import { ShieldCheck, Thermometer } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Slider } from '../../common/Slider/Slider';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { useThermalGuard } from '../../../hooks/useThermalGuard';
import { useTranslation } from '../../../lib/i18n';
import type { GuardResponse } from '../../../api/cooling';
import styles from './ThermalGuardSetting.module.scss';

// Bounds of the user override: the service rejects values outside what a CPU
// can plausibly report, and these cover every shipping part.
const STACKED = 'stacked' as const;
const LIMIT_MIN_C = 80;
const LIMIT_MAX_C = 120;

interface LimitRowProps {
  guard: GuardResponse;
  pending: boolean;
  onCommit: (c: number) => void;
  onReset: () => void;
}

function LimitRow({ guard, pending, onCommit, onReset }: LimitRowProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<number | null>(null);
  const detected = guard.detectedLimitC ?? guard.limitC ?? LIMIT_MIN_C;
  const effective = guard.limitC ?? detected;

  // A limit read from the CPU is exact; letting it be overridden would only hide the real one.
  if (guard.detectedLimitSource === 'hardware') {
    return (
      <SettingRow
        label={t('cooling.guard.limit.label')}
        description={t('cooling.guard.limit.hardware', { temp: Math.round(detected) })}
        icon={<Thermometer />}
        iconLeading="subtle"
        anchorId="set-thermal-guard-limit"
      />
    );
  }

  const detectedKey = guard.detectedLimitSource === 'spec'
    ? 'cooling.guard.limit.detectedSpec'
    : 'cooling.guard.limit.detectedDefault';
  const commit = (value: number) => {
    setDraft(null);
    if (value !== effective) onCommit(value);
  };

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
      disabled={pending}
    >
      <div className={styles.limitControl}>
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
          disabled={pending}
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
  onSetLimit: (c: number) => void;
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
        checked={guard.state !== 'off'}
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
 * limit. Hidden until the service reports a guard, so an older service shows
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
      onSetLimit={c => { void setLimit(c); }}
      onClearLimit={() => { void clearLimit(); }}
    />
  );
}
