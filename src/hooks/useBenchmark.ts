import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService, postService } from '../api/service';
import { useTopic } from './useMultiplexSocket';
import type {
  BenchmarkProgressFrame,
  BenchmarkResult,
  StartBenchmarkResponse,
} from '../types/benchmark';

type RunStatus = 'idle' | 'starting' | 'running' | 'complete' | 'failed' | 'cancelled';

interface UseBenchmarkResult {
  status: RunStatus;
  runId: string | null;
  progress: BenchmarkProgressFrame | null;
  result: BenchmarkResult | null;
  error: string | null;
  start: (opts?: { includeGpu?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useBenchmark(serviceOnline: boolean): UseBenchmarkResult {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topic = runId ? `benchmark/${runId}` : '';
  const progress = useTopic<BenchmarkProgressFrame>(topic, serviceOnline && runId != null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const fetchResult = useCallback(async (id: string) => {
    const res = await fetchService<BenchmarkResult>(`/benchmark/result/${id}`);
    if (res && res.state === 'complete') {
      setResult(res);
      setStatus('complete');
      stopPolling();
    } else if (res && res.state === 'failed') {
      setResult(res);
      setError(res.error ?? 'benchmark failed');
      setStatus('failed');
      stopPolling();
    }
  }, [stopPolling]);

  // When the WebSocket tells us the run is terminal, pull the final result.
  // The effect is reacting to an external WS frame (progress) by issuing a
  // REST fetch whose response will then update local state; this is a
  // legitimate external-system sync, not a derivable value, so the
  // set-state-in-effect rule does not apply.
  useEffect(() => {
    if (!progress || !runId) return;
    if (progress.state === 'complete' || progress.state === 'failed' || progress.state === 'cancelled') {
       
      fetchResult(runId);
      if (progress.state === 'cancelled') setStatus('cancelled');
    }
  }, [progress, runId, fetchResult]);

  const start = useCallback(async (opts?: { includeGpu?: boolean }) => {
    setError(null);
    setResult(null);
    setStatus('starting');
    const res = await postService<StartBenchmarkResponse>('/benchmark/start', {
      includeGpu: opts?.includeGpu ?? true,
    });
    if (!res || !res.started || !res.runId) {
      setError(res?.error ?? 'failed to start benchmark');
      setStatus('failed');
      return;
    }
    setRunId(res.runId);
    setStatus('running');

    // Fallback poller -- if the WS frame is missed for any reason, pull
    // status every 2 s so the UI doesn't stall forever.
    stopPolling();
    pollTimer.current = setInterval(async () => {
      const status = await fetchService<BenchmarkProgressFrame>(`/benchmark/status/${res.runId}`);
      if (status && status.state !== 'running') {
        fetchResult(res.runId);
      }
    }, 2000);
  }, [fetchResult, stopPolling]);

  const cancel = useCallback(async () => {
    if (!runId) return;
    await postService(`/benchmark/cancel/${runId}`, {});
    setStatus('cancelled');
  }, [runId]);

  const reset = useCallback(async () => {
    await postService(`/benchmark/reset`, {});
    setStatus('idle');
    setRunId(null);
    setResult(null);
    setError(null);
    stopPolling();
  }, [stopPolling]);

  return { status, runId, progress, result, error, start, cancel, reset };
}
