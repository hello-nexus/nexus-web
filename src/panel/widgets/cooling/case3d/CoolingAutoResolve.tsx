import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BuildPage, type BuildResolved, type HeadlessBuild } from '../../../../components/views/BuildPage/BuildPage';
import { useBuildMachine } from '../../../../components/views/BuildPage/buildMachine';
import { isRemoteOrigin } from '../../../../api/service';
import { usePcSetupRecord } from '../../../../hooks/usePcSetupRecord';
import { forgetTried, hasTried, layoutNeedsResolve, markTried, resolveOutcome } from '../../../../lib/cooling/autoResolve';

/** Build loads, matches the parts, writes the record and exports the case model; past this the try counts as failed. */
export const RESOLVE_TIMEOUT_MS = 45_000;

export type AutoResolvePhase = 'idle' | 'resolving' | 'failed';

export interface AutoResolveState {
  phase: AutoResolvePhase;
  /** Tries again after a failure. */
  retry: () => void;
}

/**
 * Gives Cooling a layout without the user opening Build: when the setup record has none, or holds one resolved for other inputs than
 * this PC has now, Build is framed out of sight to resolve it (the code Build itself runs, so the two always agree) and unmounted once the
 * record holds it. A key is tried once per session, so a layout that stays out of date cannot loop. Renders nothing of its own.
 */
export function CoolingAutoResolve({ children }: { children: (state: AutoResolveState) => ReactNode }) {
  const { record, loaded } = usePcSetupRecord(true);
  const { machine, key } = useBuildMachine(!isRemoteOrigin);
  const [frameKey, setFrameKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<BuildResolved | null>(null);

  const needed = loaded && key !== null && layoutNeedsResolve(record, key, machine?.caseId) && !hasTried(key);
  useEffect(() => {
    if (!needed || key === null || frameKey !== null) return;
    setFrameKey(key);
    setFailedKey(null);
    setMessage(null);
  }, [needed, key, frameKey]);

  const finish = useCallback((failed: boolean) => {
    if (frameKey === null) return;
    markTried(frameKey);
    if (failed) setFailedKey(frameKey);
    setFrameKey(null);
  }, [frameKey]);

  const outcome = frameKey === null ? 'waiting' : resolveOutcome(message, record);
  useEffect(() => {
    if (outcome !== 'waiting') finish(outcome === 'failed');
  }, [outcome, finish]);

  useEffect(() => {
    if (frameKey === null) return undefined;
    const timer = window.setTimeout(() => finish(true), RESOLVE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [frameKey, finish]);

  const retry = useCallback(() => {
    if (failedKey === null) return;
    forgetTried(failedKey);
    setFailedKey(null);
  }, [failedKey]);

  const headless = useMemo<HeadlessBuild | null>(() => (frameKey !== null && machine && key !== null
    ? { machine, layoutKey: key, onResolved: setMessage, onUnavailable: () => finish(true) }
    : null), [frameKey, machine, key, finish]);

  const phase: AutoResolvePhase = frameKey !== null ? 'resolving' : failedKey !== null && failedKey === key ? 'failed' : 'idle';
  return (
    <>
      {children({ phase, retry })}
      {headless && <BuildPage headless={headless} />}
    </>
  );
}
