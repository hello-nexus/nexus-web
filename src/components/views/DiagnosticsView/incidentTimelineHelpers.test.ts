import { describe, expect, it } from 'vitest';
import type { DiagnosticsIncident } from '../../../api/diagnostics';
import {
  filterIncidentsToDomain,
  incidentEvents,
  incidentLanes,
  incidentTimelineDomain,
} from './incidentTimelineHelpers';

function incident(overrides: Partial<DiagnosticsIncident> & Pick<DiagnosticsIncident, 'id' | 'timeUtc' | 'source'>): DiagnosticsIncident {
  return {
    severity: 'info', title: 'x', detail: '', app: null, data: {}, repeatCount: 1, firstUtc: null, ...overrides,
  };
}

describe('incidentTimelineDomain', () => {
  it('spans the window ending at now for an hours query', () => {
    const now = 1_000 * 3_600_000; // arbitrary epoch on an hour boundary
    expect(incidentTimelineDomain({ hours: 24 }, now)).toEqual([now - 24 * 3_600_000, now]);
  });

  it('spans a single local calendar day for a date query', () => {
    const [start, end] = incidentTimelineDomain({ date: '2026-07-06' }, Date.parse('2026-07-06T12:00:00'));
    expect(new Date(start).getHours()).toBe(0);
    expect(end - start).toBe(24 * 3_600_000);
  });
});

describe('filterIncidentsToDomain', () => {
  it('keeps only incidents inside the window', () => {
    const base = Date.parse('2026-07-06T12:00:00Z');
    const list = [
      incident({ id: 'in', timeUtc: new Date(base).toISOString(), source: 'whea' }),
      incident({ id: 'before', timeUtc: new Date(base - 5 * 3_600_000).toISOString(), source: 'whea' }),
    ];
    const kept = filterIncidentsToDomain(list, [base - 3_600_000, base + 3_600_000]);
    expect(kept.map(i => i.id)).toEqual(['in']);
  });
});

describe('incidentLanes', () => {
  it('emits the fixed grouped lane set (never stripped), app last', () => {
    const ids = incidentLanes(k => k).map(l => l.id);
    expect(ids).toEqual(['crash', 'hardware', 'gpu', 'disk', 'shutdown', 'app']);
    expect(ids[ids.length - 1]).toBe('app');
  });
});

describe('incidentEvents', () => {
  it('maps severity to color/weight and assigns the lane by group, carrying the incident', () => {
    const crit = incident({ id: 'c', timeUtc: '2026-07-06T00:00:00Z', source: 'appCrash', severity: 'critical' });
    const [event] = incidentEvents([crit]);
    expect(event.laneId).toBe('app');
    expect(event.weight).toBe(2);
    expect(event.color).toBe('var(--bad)');
    expect(event.incident).toBe(crit);
  });

  it('merges GPU timeout and GPU driver into one "gpu" lane', () => {
    const events = incidentEvents([
      incident({ id: 't', timeUtc: '2026-07-06T00:00:00Z', source: 'tdr' }),
      incident({ id: 'd', timeUtc: '2026-07-06T00:00:00Z', source: 'gpuDriver' }),
    ]);
    expect(events.map(e => e.laneId)).toEqual(['gpu', 'gpu']);
  });

  it('merges bugcheck and live-kernel into one "crash" lane', () => {
    const events = incidentEvents([
      incident({ id: 'b', timeUtc: '2026-07-06T00:00:00Z', source: 'bugcheck' }),
      incident({ id: 'k', timeUtc: '2026-07-06T00:00:00Z', source: 'liveKernel' }),
    ]);
    expect(events.map(e => e.laneId)).toEqual(['crash', 'crash']);
  });

  it('drops memDiag (memory test result) - not an incident-timeline category', () => {
    expect(incidentEvents([incident({ id: 'm', timeUtc: '2026-07-06T00:00:00Z', source: 'memDiag' })])).toEqual([]);
  });

  it('groups the Linux incident sources (kernel into "crash", oomKill/segfault/unitFailed into "app")', () => {
    const events = incidentEvents([
      incident({ id: 'k', timeUtc: '2026-07-06T00:00:00Z', source: 'kernel' }),
      incident({ id: 'o', timeUtc: '2026-07-06T00:00:00Z', source: 'oomKill' }),
      incident({ id: 's', timeUtc: '2026-07-06T00:00:00Z', source: 'segfault' }),
      incident({ id: 'u', timeUtc: '2026-07-06T00:00:00Z', source: 'unitFailed' }),
    ]);
    expect(events.map(e => e.laneId)).toEqual(['crash', 'app', 'app', 'app']);
  });
});
