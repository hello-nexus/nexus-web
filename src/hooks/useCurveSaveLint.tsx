import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  healCooling, lintCurves, saveCurves,
  type CurveHazard, type HealState, type WireCurve,
} from '../api/cooling';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { hazardSignature, lintLines } from '../panel/widgets/cooling/page/guardUtils';
import { useTranslation } from '../lib/i18n';

type CurvesBody = { globalSpeedModifier: number; curves: WireCurve[] };

/**
 * Curve save with the hazard lint in front of it, shared by the cooling page
 * and the immersive view. Hazards open a Fix / Save anyway prompt; Fix saves
 * and then heals, and a dismissal counts as Save anyway because saving is
 * never blocked. `prompt` is the modal to render beside the caller's view.
 */
export function useCurveSaveLint(onHealed: (heal: HealState | null) => void): {
  saveWithLint: (body: CurvesBody) => Promise<unknown>;
  prompt: ReactNode;
} {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{ hazards: CurveHazard[]; settle: (fix: boolean) => void } | null>(null);
  const openRef = useRef(false);
  const ackedRef = useRef('');
  const onHealedRef = useRef(onHealed);
  onHealedRef.current = onHealed;

  const saveWithLint = useCallback(async (body: CurvesBody) => {
    let fix = false;
    // A prompt already open covers this edit too; the lint reruns on the next one.
    if (!openRef.current) {
      const hazards = (await lintCurves(body))?.hazards ?? [];
      const signature = hazardSignature(hazards);
      if (hazards.length === 0) {
        ackedRef.current = '';
      } else if (signature !== ackedRef.current) {
        openRef.current = true;
        fix = await new Promise<boolean>(settle => { setPending({ hazards, settle }); });
        openRef.current = false;
        ackedRef.current = signature;
      }
    }
    const res = await saveCurves(body);
    if (fix) onHealedRef.current(await healCooling());
    return res;
  }, []);

  const answer = (fix: boolean) => { pending?.settle(fix); setPending(null); };

  const prompt = (
    <ConfirmModal
      open={pending !== null}
      destructive={false}
      title={t('cooling.guard.dialog.title')}
      message={t('cooling.guard.dialog.message')}
      bullets={pending ? lintLines(pending.hazards, t) : undefined}
      note={t('cooling.guard.dialog.note')}
      confirmLabel={t('cooling.guard.dialog.fix')}
      cancelLabel={t('cooling.guard.dialog.saveAnyway')}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );

  return { saveWithLint, prompt };
}
