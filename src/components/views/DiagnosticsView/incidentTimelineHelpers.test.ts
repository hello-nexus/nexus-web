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
  it('emits every category as a lane (never stripped) in reliability order, appCrash last', () => {
    const ids = incidentLanes(k => k).map(l => l.id);
    expect(ids).toEqual(['bugcheck', 'whea', 'liveKernel', 'tdr', 'gpuDriver', 'disk', 'dirtyShutdown', 'memDiag', 'appCrash']);
    expect(ids[ids.length - 1]).toBe('appCrash');
  });
});

describe('incidentEvents', () => {
  it('maps severity to color and weight, carrying the incident', () => {
    const crit = incident({ id: 'c', timeUtc: '2026-07-06T00:00:00Z', source: 'appCrash', severity: 'critical' });
    const [event] = incidentEvents([crit]);
    expect(event.laneId).toBe('appCrash');
    expect(event.weight).toBe(2);
    expect(event.color).toBe('var(--bad)');
    expect(event.incident).toBe(crit);
  });
});
