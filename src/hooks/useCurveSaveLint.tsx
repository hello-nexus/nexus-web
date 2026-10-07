import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  healCooling, lintCurves, saveCurves, setGuardConfig,
  type CurveHazard, type HealState, type WireCurve,
} from '../api/cooling';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { hazardSignature, lintLines, newGuardError, type GuardErrorState } from '../panel/widgets/cooling/page/guardUtils';
import { useTranslation } from '../lib/i18n';
import styles from '../panel/widgets/cooling/page/ThermalGuardPanel.module.scss';

type CurvesBody = { globalSpeedModifier: number; curves: WireCurve[] };

interface Waiter {
  resolve: (res: unknown) => void;
  reject: (err: unknown) => void;
}

interface PendingPrompt {
  hazards: CurveHazard[];
  fixAvailable: boolean;
  settle: (fix: boolean) => void;
}

/**
 * Curve save with the hazard lint in front of it, shared by the cooling page
 * and the immersive view. Hazards open a Fix / Save anyway prompt; Fix saves
 * and then heals, and a dismissal counts as Save anyway because saving is
 * never blocked. `prompt` is the modal to render beside the caller's view.
 *
 * One lint/save runs at a time and the newest body wins: a save that arrives
 * while another is in flight (or while the prompt is open) replaces any body
 * not yet saved, and every caller's promise resolves once a save covering it
 * has landed. Saves are never reordered.
 */
export function useCurveSaveLint(options: {
  /** Called with what a successful Fix changed. */
  onHealed: (heal: HealState) => void;
  /** Called after each successful save, before any heal. */
  onSaved?: () => void;
  /** False when the user switched hazard warnings off: saves then skip the lint and prompt. Absent means on. */
  lintEnabled?: boolean;
}): {
  saveWithLint: (body: CurvesBody) => Promise<unknown>;
  prompt: ReactNode;
  /** The last failed save or heal; cleared by the next successful save. */
  error: GuardErrorState | null;
} {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [error, setError] = useState<GuardErrorState | null>(null);
  const pendingRef = useRef<PendingPrompt | null>(null);
  const latestRef = useRef<CurvesBody | null>(null);
  const waitersRef = useRef<Waiter[]>([]);
  const runningRef = useRef(false);
  const ackedRef = useRef('');
  const unmountedRef = useRef(false);
  // "Don't warn me again", ticked in the open prompt; and an opt-out sent but not yet reflected in `lintEnabled`.
  const [dontAsk, setDontAsk] = useState(false);
  const dontAskRef = useRef(false);
  const lintOptedOutRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const tRef = useRef(t);
  tRef.current = t;

  const run = useCallback(async () => {
    runningRef.current = true;
    // Waiters whose body was superseded before it saved ride along to the next save.
    let batch: Waiter[] = [];
    try {
      while (latestRef.current) {
        const body = latestRef.current;
        latestRef.current = null;
        batch = batch.concat(waitersRef.current.splice(0));
        try {
          let hazards: CurveHazard[] = [];
          let fixAvailable = false;
          const lintOff = optionsRef.current.lintEnabled === false || lintOptedOutRef.current;
          if (!unmountedRef.current && !lintOff) {
            const lint = await lintCurves(body);
            hazards = lint?.hazards ?? [];
            fixAvailable = lint?.fixAvailable ?? false;
          }
          if (latestRef.current) continue;
          const signature = hazardSignature(hazards);
          let fix = false;
          let optOutFailed = false;
          if (hazards.length === 0) {
            ackedRef.current = '';
          } else if (signature !== ackedRef.current && !unmountedRef.current) {
            dontAskRef.current = false;
            setDontAsk(false);
            fix = await new Promise<boolean>(settle => {
              const prompt: PendingPrompt = { hazards, fixAvailable, settle };
              pendingRef.current = prompt;
              setPending(prompt);
            });
            pendingRef.current = null;
            setPending(null);
            // Ticked on either choice: switch the warnings off, in a request of its own.
            if (dontAskRef.current && !unmountedRef.current) {
              lintOptedOutRef.current = true;
              const res = await setGuardConfig({ lintWarnings: false });
              if (!res || !res.state) {
                lintOptedOutRef.current = false;
                optOutFailed = true;
              }
            }
            // Only Save anyway acknowledges a hazard set; Fix does not, so a body
            // built from pre-heal curves prompts again instead of undoing the heal.
            if (!fix) ackedRef.current = signature;
            // A newer body replaces this one and is linted fresh.
            if (latestRef.current) continue;
          }
          const res = await saveCurves(body);
          const saved = !!res && !(res as { error?: boolean }).error;
          if (!saved) {
            setError(newGuardError(tRef.current('cooling.guard.error.save')));
          } else {
            // Reported after the save so its success does not wipe it.
            setError(optOutFailed ? newGuardError(tRef.current('cooling.guard.error.lintWarnings')) : null);
            optionsRef.current.onSaved?.();
            if (fix) {
              const heal = await healCooling();
              if (heal && heal.channels.length > 0) optionsRef.current.onHealed(heal);
              else setError(newGuardError(tRef.current('cooling.guard.error.heal')));
            }
          }
          for (const w of batch) w.resolve(res);
          batch = [];
        } catch (err) {
          for (const w of batch) w.reject(err);
          batch = [];
        }
      }
    } finally {
      runningRef.current = false;
      // A body queued after the loop's last check still needs its turn.
      if (latestRef.current) void run();
    }
  }, []);

  const saveWithLint = useCallback((body: CurvesBody) => new Promise<unknown>((resolve, reject) => {
    latestRef.current = body;
    waitersRef.current.push({ resolve, reject });
    if (!runningRef.current) void run();
  }), [run]);

  // A prompt still open at unmount settles as Save anyway so the edit lands
  // and no caller waits forever.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      pendingRef.current?.settle(false);
    };
  }, []);

  // The server's value wins again once it reports warnings on.
  const lintEnabledOpt = options.lintEnabled;
  useEffect(() => {
    if (lintEnabledOpt !== false) lintOptedOutRef.current = false;
  }, [lintEnabledOpt]);

  const answer = (fix: boolean) => { pending?.settle(fix); };

  const canFix = pending?.fixAvailable ?? true;
  const prompt = (
    <ConfirmModal
      open={pending !== null}
      destructive={false}
      title={t('cooling.guard.dialog.title')}
      message={t('cooling.guard.dialog.message')}
      bullets={pending ? lintLines(pending.hazards, t) : undefined}
      note={canFix ? t('cooling.guard.dialog.note') : undefined}
      confirmLabel={t('cooling.guard.dialog.fix')}
      cancelLabel={t('cooling.guard.dialog.saveAnyway')}
      hideConfirm={!canFix}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    >
      <label className={styles.dontAsk}>
        <input
          type="checkbox"
          checked={dontAsk}
          onChange={e => {
            dontAskRef.current = e.target.checked;
            setDontAsk(e.target.checked);
          }}
        />
        <span>{t('cooling.guard.dialog.dontAsk')}</span>
      </label>
    </ConfirmModal>
  );

  return { saveWithLint, prompt, error };
}
