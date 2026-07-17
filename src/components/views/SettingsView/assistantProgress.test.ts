import { describe, expect, it } from 'vitest';
import { isAssistantTransient, progressPercent } from './assistantProgress';
import type { AssistantPullProgress } from '../../../api/aiIntegration';

function pull(overrides: Partial<AssistantPullProgress> = {}): AssistantPullProgress {
  return { model: 'qwen3.5:4b', status: 'pulling manifest', received: 0, total: 0, ...overrides };
}

describe('isAssistantTransient', () => {
  it('is transient while the runtime is downloading', () => {
    expect(isAssistantTransient('downloading', null)).toBe(true);
  });

  it('is transient while the runtime is starting', () => {
    expect(isAssistantTransient('starting', null)).toBe(true);
  });

  it('is transient while a model pull is in flight', () => {
    expect(isAssistantTransient('running', pull({ status: 'downloading' }))).toBe(true);
  });

  it('is not transient once a pull reports success', () => {
    expect(isAssistantTransient('running', pull({ status: 'success' }))).toBe(false);
  });

  it('is not transient when running with no pull and no null pull', () => {
    expect(isAssistantTransient('running', null)).toBe(false);
  });

  it('is not transient when installed and idle', () => {
    expect(isAssistantTransient('installed', null)).toBe(false);
  });
});

describe('progressPercent', () => {
  it('computes a rounded percent', () => {
    expect(progressPercent(512, 1024)).toBe(50);
  });

  it('returns 0 when total is unknown (zero)', () => {
    expect(progressPercent(0, 0)).toBe(0);
  });

  it('clamps at 100 even if received exceeds total', () => {
    expect(progressPercent(2000, 1000)).toBe(100);
  });

  it('never goes negative', () => {
    expect(progressPercent(-5, 100)).toBe(0);
  });
});
