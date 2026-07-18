import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAssistantStatus, runAssistantQuery } from '../api/aiIntegration';

export type AssistantQueryState = 'idle' | 'loading' | 'success' | 'error';

export interface AssistantQueryResult {
  answer: string;
  tools: string[];
}

export interface AssistantQuery {
  /** Runtime running, an active model set, and that model actually installed
   *  - the same readiness gate as AiIntegrationSection's showQueryBar. */
  usable: boolean;
  state: AssistantQueryState;
  result: AssistantQueryResult | null;
  submit: (prompt: string) => void;
  /** Drop a shown loading/answer/error state back to idle without touching
   *  `usable` (the user edited the query, so it stops describing this run). */
  reset: () => void;
}

/**
 * Local AI assistant availability + query submission for the top search bar.
 * Status is fetched once per palette open (mirrors useSearchLiveState's
 * enabled-edge fetch). `submit` is single-flight (a second call while loading
 * is a no-op) and sequence-guarded so a response that lands after `reset` (or
 * after the palette closed, which resets too) never overwrites newer state.
 */
export function useAssistantQuery(enabled: boolean): AssistantQuery {
  const [usable, setUsable] = useState(false);
  const [state, setState] = useState<AssistantQueryState>('idle');
  const [result, setResult] = useState<AssistantQueryResult | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!enabled) {
      seqRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setUsable(false);
      setState('idle');
      setResult(null);
      return;
    }
    let cancelled = false;
    fetchAssistantStatus().then((status) => {
      if (cancelled || !status) return;
      const modelReady = !!status.activeModel && status.installedModels.some((m) => m.id === status.activeModel);
      setUsable(status.runtimeState === 'running' && modelReady);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  const reset = useCallback(() => {
    seqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
    setResult(null);
  }, []);

  const submit = useCallback((prompt: string) => {
    if (state === 'loading') return;
    const seq = ++seqRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setState('loading');
    setResult(null);
    void runAssistantQuery(prompt, controller.signal).then((resp) => {
      if (!mountedRef.current || seqRef.current !== seq) return;
      if (resp) {
        setState('success');
        setResult({ answer: resp.answer, tools: resp.toolsRun.map((r) => r.name) });
      } else {
        setState('error');
      }
    }).catch(() => {
      if (!mountedRef.current || seqRef.current !== seq) return;
      setState('error');
    });
  }, [state]);

  return { usable, state, result, submit, reset };
}
