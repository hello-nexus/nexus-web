import { describe, expect, it } from 'vitest';
import {
  coolingStatusColor,
  driveStatusColor,
  durationToken,
  formatBytes,
  incidentSeverityColor,
  kindStatus,
  reasonLabel,
  reasonLabelKey,
  relativeTimeToken,
  resolveSectionState,
  statusColor,
  worstReason,
} from './diagnosticsHelpers';
import type { DiagnosticsComponent, DiagnosticsReason } from '../../../api/diagnostics';

describe('statusColor', () => {
  it('maps every status to its token', () => {
    expect(statusColor('ok')).toBe('var(--good)');
    expect(statusColor('watch')).toBe('var(--warn)');
    expect(statusColor('act')).toBe('var(--bad)');
    expect(statusColor('unknown')).toBe('var(--text-dim)');
  });
});

describe('driveStatusColor / coolingStatusColor / incidentSeverityColor', () => {
  it('routes the worst tiers to --bad and the mid tiers to --warn', () => {
    expect(driveStatusColor('good')).toBe('var(--good)');
    expect(driveStatusColor('caution')).toBe('var(--warn)');
    expect(driveStatusColor('warning')).toBe('var(--warn)');
    expect(driveStatusColor('bad')).toBe('var(--bad)');
    expect(coolingStatusColor('stalled')).toBe('var(--bad)');
    expect(coolingStatusColor('suspect')).toBe('var(--warn)');
    expect(incidentSeverityColor('critical')).toBe('var(--bad)');
    expect(incidentSeverityColor('info')).toBe('var(--text-dim)');
  });
});

describe('reasonLabelKey / reasonLabel', () => {
  const reason: DiagnosticsReason = {
    code: 'smart.reallocated',
    severity: 'watch',
    summary: '5 reallocated sectors',
    detail: 'SMART attribute 05 raw value is 5.',
  };

  it('builds the key from the reason code', () => {
    expect(reasonLabelKey(reason)).toBe('diagnostics.reason.smart.reallocated');
  });

  it('uses the translated label when the key resolves', () => {
    const translate = (key: string) => (key === 'diagnostics.reason.smart.reallocated' ? 'Reallocated sectors' : key);
    expect(reasonLabel(reason, translate)).toBe('Reallocated sectors');
  });

  it('falls back to the server summary for an unmapped future code', () => {
    const unknown: DiagnosticsReason = { ...reason, code: 'future.newCode' };
    const translate = (key: string) => key; // simulates the i18n miss fallback
    expect(reasonLabel(unknown, translate)).toBe(unknown.summary);
  });
});

describe('relativeTimeToken', () => {
  const now = new Date('2026-07-08T02:00:00Z').getTime();

  it('buckets under a minute as justNow', () => {
    expect(relativeTimeToken('2026-07-08T01:59:30Z', now)).toEqual({ key: 'diagnostics.time.justNow' });
  });

  it('buckets minutes', () => {
    expect(relativeTimeToken('2026-07-08T01:55:00Z', now)).toEqual({ key: 'diagnostics.time.minsAgo', n: 5 });
  });

  it('buckets hours', () => {
    expect(relativeTimeToken('2026-07-07T23:00:00Z', now)).toEqual({ key: 'diagnostics.time.hoursAgo', n: 3 });
  });

  it('buckets days', () => {
    expect(relativeTimeToken('2026-07-05T02:00:00Z', now)).toEqual({ key: 'diagnostics.time.daysAgo', n: 3 });
  });
});

describe('durationToken', () => {
  it('buckets under a minute as seconds', () => {
    expect(durationToken(45_000_000)).toEqual({ key: 'diagnostics.duration.seconds', params: { s: '45' } });
  });

  it('buckets under an hour as minutes', () => {
    // 1,658,139,360us ~= 27.6min - the GPU throttle example from the contract.
    expect(durationToken(1_658_139_360)).toEqual({ key: 'diagnostics.duration.minutes', params: { m: '27' } });
  });

  it('buckets an hour or more as hours+minutes', () => {
    expect(durationToken(90 * 60 * 1_000_000)).toEqual({ key: 'diagnostics.duration.hoursMinutes', params: { h: '1', m: '30' } });
  });
});

describe('resolveSectionState', () => {
  it('shows loading before the first successful fetch', () => {
    expect(resolveSectionState({ hasData: false, loading: true, error: false, supported: true, isEmpty: false })).toBe('loading');
  });

  it('shows error only once a fetch has actually failed with no data', () => {
    expect(resolveSectionState({ hasData: false, loading: false, error: true, supported: true, isEmpty: false })).toBe('error');
  });

  it('shows notSupported once data has arrived but the platform lacks it', () => {
    expect(resolveSectionState({ hasData: true, loading: false, error: false, supported: false, isEmpty: false })).toBe('notSupported');
  });

  it('shows empty when supported but no items were found', () => {
    expect(resolveSectionState({ hasData: true, loading: false, error: false, supported: true, isEmpty: true })).toBe('empty');
  });

  it('shows content when data is present, supported, and non-empty', () => {
    expect(resolveSectionState({ hasData: true, loading: false, error: false, supported: true, isEmpty: false })).toBe('content');
  });
});

describe('worstReason / kindStatus', () => {
  const components: DiagnosticsComponent[] = [
    { id: 'storage:a', kind: 'storage', name: 'A', status: 'ok', reasons: [] },
    {
      id: 'storage:b', kind: 'storage', name: 'B', status: 'watch',
      reasons: [{ code: 'smart.reallocated', severity: 'watch', summary: 'watch reason', detail: '' }],
    },
    {
      id: 'cooling:pump', kind: 'cooling', name: 'Pump', status: 'act',
      reasons: [{ code: 'cooling.pumpStall', severity: 'act', summary: 'act reason', detail: '' }],
    },
  ];

  it('picks the highest-severity reason across all components', () => {
    expect(worstReason(components)?.code).toBe('cooling.pumpStall');
  });

  it('returns null when nothing is flagged', () => {
    expect(worstReason([{ id: 'x', kind: 'system', name: 'X', status: 'ok', reasons: [] }])).toBeNull();
  });

  it('rolls a kind up to its worst member status', () => {
    expect(kindStatus(components, 'storage')).toBe('watch');
    expect(kindStatus(components, 'cooling')).toBe('act');
  });

  it('reports unknown for a kind with no components', () => {
    expect(kindStatus(components, 'memory')).toBe('unknown');
  });
});

describe('formatBytes', () => {
  it('scales through the ladder', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2000398934016)).toBe('1.8 TB');
    expect(formatBytes(17179869184)).toBe('16 GB');
  });
});
