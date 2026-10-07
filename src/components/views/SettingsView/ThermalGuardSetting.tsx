import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Thermometer, TriangleAlert } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { Slider } from '../../common/Slider/Slider';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { useThermalGuard } from '../../../hooks/useThermalGuard';
import { useTranslation } from '../../../lib/i18n';
import type { GuardResponse } from '../../../api/cooling';
import { guardEnabled } from '../../../panel/widgets/cooling/page/guardUtils';
import styles from './ThermalGuardSetting.module.scss';

const STACKED = 'stacked' as const;
// The bar spans these bounds, widened to include a detected value outside them;
// the service clamps an override to the same range.
const LIMIT_MIN_C = 90;
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
  /** The limit the user asked for that the service has not confirmed yet. */
  pendingLimit: number | 'reset' | null;
  /** The guard is off: the row stays visible but greyed out, like a dependent setting. */
  disabled: boolean;
  error: string | null;
  onCommit: (c: number) => void;
  onReset: () => void;
}

function LimitRow({ guard, pendingLimit, disabled, error, onCommit, onReset }: LimitRowProps) {
  const { t } = useTranslation();
  // The value while the thumb is being dragged or keyed, before it is committed.
  const [draft, setDraft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyedRef = useRef<number | null>(null);
  const immediateRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  // limitC is omitted while the guard is off, so read the override and the detected value first.
  const detected = guard.detectedLimitC ?? guard.limitC ?? LIMIT_MIN_C;
  const serverLimit = guard.limitOverrideC ?? detected;
  const shown = pendingLimit === 'reset' ? detected : pendingLimit ?? serverLimit;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const throttleText = t('cooling.guard.limit.throttleMark', { temp: Math.round(detected) });
  const barMin = Math.min(LIMIT_MIN_C, Math.floor(detected));
  const barMax = Math.max(LIMIT_MAX_C, Math.ceil(detected));

  const settle = (value: number) => {
    keyedRef.current = null;
    setDraft(null);
    if (value !== shownRef.current) onCommitRef.current(value);
  };

  // A keyed value still waiting out its settle time is written when the row goes away.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (keyedRef.current != null && keyedRef.current !== shownRef.current) onCommitRef.current(keyedRef.current);
  }, []);

  // Pointer release and typed edits commit at once; keyboard steps settle after a short wait.
  const commit = (value: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediateRef.current) {
      immediateRef.current = false;
      settle(value);
      return;
    }
    keyedRef.current = value;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      settle(value);
    }, COMMIT_SETTLE_MS);
  };

  // Reset wins over a keyed value still waiting to settle.
  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    keyedRef.current = null;
    setDraft(null);
    onReset();
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
          {error && <span role="alert">{` ${error}`}</span>}
        </>
      )}
      descriptionBelow
      icon={<Thermometer />}
      iconLeading="subtle"
      anchorId="set-thermal-guard-limit"
      disabled={disabled}
    >
      <div className={styles.limitControl}>
        {/* Disabled only while the guard is off, never for a pending write: that would drop keyboard focus mid-adjustment. */}
        <Slider
          orientation={STACKED}
          editable
          trackFill
          min={barMin}
          max={barMax}
          marker={detected}
          markerLabel={<InfoTooltip message={throttleText} ariaLabel={throttleText} side="top" />}
          step={1}
          value={draft ?? shown}
          formatValue={v => t('cooling.curve.tempBadge', { temp: v })}
          onChange={(v, typed) => {
            setDraft(v);
            if (typed) immediateRef.current = true;
          }}
          onPointerDown={() => { immediateRef.current = true; }}
          onCommit={commit}
          disabled={disabled}
          ariaLabel={t('cooling.guard.limit.label')}
        />
        {guard.limitOverrideC != null && (
          <Button type="button" size="sm" disabled={disabled} onClick={reset}>
            {t('cooling.guard.limit.reset')}
          </Button>
        )}
      </div>
    </SettingRow>
  );
}

interface ThermalGuardSettingViewProps {
  guard: GuardResponse;
  /** A write is in flight; the switch disables. */
  pending: boolean;
  /** The limit asked for but not yet confirmed by the service; the slider shows it meanwhile. */
  pendingLimit?: number | 'reset' | null;
  error: string | null;
  /** A failed limit write, shown on the limit row apart from the switch's error. */
  limitError?: string | null;
  /** A failed hazard-warning write, shown on its own row. */
  lintWarningsError?: string | null;
  onLintWarningsChange?: (enabled: boolean) => void;
  onToggle: (enabled: boolean) => void;
  onSetLimit: (c: number) => void;
  onClearLimit: () => void;
}

/** The settings rows themselves, apart from the service wiring. */
export function ThermalGuardSettingView({
  guard, pending, pendingLimit = null, error, limitError = null, lintWarningsError = null, onLintWarningsChange = () => {}, onToggle, onSetLimit, onClearLimit,
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
        <LimitRow guard={guard} pendingLimit={pendingLimit} disabled={!guardEnabled(guard)} error={limitError} onCommit={onSetLimit} onReset={onClearLimit} />
      )}
      {/* Independent of the guard switch: it only governs the prompt when saving curves. */}
      <SettingToggle
        label={t('cooling.guard.lintWarnings.label')}
        description={(
          <>
            {t('cooling.guard.lintWarnings.description')}
            {lintWarningsError && <span role="alert">{` ${lintWarningsError}`}</span>}
          </>
        )}
        icon={<TriangleAlert />}
        iconLeading="subtle"
        anchorId="set-thermal-guard-lint"
        checked={guard.lintWarnings !== false}
        onChange={onLintWarningsChange}
      />
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
  const {
    guard, toggling, pendingLimit, toggleError, limitError, lintWarningsError, toggle, setLimit, clearLimit, setLintWarnings,
  } = useThermalGuard(serviceOnline);
  if (!guard) return null;
  return (
    <ThermalGuardSettingView
      guard={guard}
      pending={toggling}
      pendingLimit={pendingLimit}
      error={toggleError?.message ?? null}
      limitError={limitError?.message ?? null}
      lintWarningsError={lintWarningsError?.message ?? null}
      onLintWarningsChange={enabled => setLintWarnings(enabled)}
      onToggle={next => { void toggle(next); }}
      onSetLimit={c => setLimit(c)}
      onClearLimit={() => { void clearLimit(); }}
    />
  );
}
