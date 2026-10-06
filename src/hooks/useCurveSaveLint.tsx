import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  healCooling, lintCurves, saveCurves,
  type CurveHazard, type HealState, type WireCurve,
} from '../api/cooling';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { useToastSafe } from '../components/common/Toast/Toast';
import { hazardSignature, lintLines } from '../panel/widgets/cooling/page/guardUtils';
import { useTranslation } from '../lib/i18n';

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
export function useCurveSaveLint(onHealed: (heal: HealState) => void): {
  saveWithLint: (body: CurvesBody) => Promise<unknown>;
  prompt: ReactNode;
} {
  const { t } = useTranslation();
  const toast = useToastSafe();
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const pendingRef = useRef<PendingPrompt | null>(null);
  const latestRef = useRef<CurvesBody | null>(null);
  const waitersRef = useRef<Waiter[]>([]);
  const runningRef = useRef(false);
  const ackedRef = useRef('');
  const unmountedRef = useRef(false);
  const onHealedRef = useRef(onHealed);
  onHealedRef.current = onHealed;
  const toastRef = useRef({ toast, t });
  toastRef.current = { toast, t };

  const run = useCallback(async () => {
    runningRef.current = true;
    // Waiters whose body was superseded before it saved ride along to the next save.
    let batch: Waiter[] = [];
    let fixCarried = false;
    try {
      while (latestRef.current) {
        const body = latestRef.current;
        latestRef.current = null;
        batch = batch.concat(waitersRef.current.splice(0));
        try {
          let hazards: CurveHazard[] = [];
          let fixAvailable = false;
          if (!unmountedRef.current) {
            const lint = await lintCurves(body);
            hazards = lint?.hazards ?? [];
            fixAvailable = lint?.fixAvailable ?? false;
          }
          if (latestRef.current) continue;
          const signature = hazardSignature(hazards);
          let fix: boolean = fixCarried;
          if (hazards.length === 0) {
            ackedRef.current = '';
          } else if (signature !== ackedRef.current && !unmountedRef.current) {
            fix = await new Promise<boolean>(settle => {
              const prompt: PendingPrompt = { hazards, fixAvailable, settle };
              pendingRef.current = prompt;
              setPending(prompt);
            });
            pendingRef.current = null;
            setPending(null);
            if (!fix) ackedRef.current = signature;
            // A newer body arrived while the prompt was open: it replaces this one.
            if (latestRef.current) { fixCarried = fixCarried || fix; continue; }
          }
          const res = await saveCurves(body);
          fixCarried = false;
          if (fix) {
            const heal = await healCooling();
            if (heal && heal.channels.length > 0) {
              ackedRef.current = signature;
              onHealedRef.current(heal);
            } else {
              toastRef.current.toast.push({ title: toastRef.current.t('cooling.guard.error.heal') });
            }
          }
          for (const w of batch) w.resolve(res);
          batch = [];
        } catch (err) {
          for (const w of batch) w.reject(err);
          batch = [];
          fixCarried = false;
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
    />
  );

  return { saveWithLint, prompt };
}
