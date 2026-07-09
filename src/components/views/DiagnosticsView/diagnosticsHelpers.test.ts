import { describe, expect, it } from 'vitest';
import {
  buildSpecRows,
  coolingStatusColor,
  driveStatusColor,
  durationToken,
  formatBytes,
  incidentAppFaultLine,
  incidentSeverityColor,
  kindStatus,
  orderComponentsByKind,
  pnpProblemLabel,
  reasonLabel,
  reasonLabelKey,
  relativeTimeToken,
  resolveSectionState,
  statusColor,
  worstReason,
} from './diagnosticsHelpers';
import type { DiagnosticsComponent, DiagnosticsGpuResponse, DiagnosticsIncidentApp, DiagnosticsMemoryResponse, DiagnosticsReason } from '../../../api/diagnostics';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';

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

describe('orderComponentsByKind', () => {
  it('reorders to storage, memory, gpu, cooling, system regardless of server order', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'system:host', kind: 'system', name: 'System', status: 'ok', reasons: [] },
      { id: 'gpu:0', kind: 'gpu', name: 'GPU', status: 'ok', reasons: [] },
      { id: 'cooling:pump', kind: 'cooling', name: 'Pump', status: 'ok', reasons: [] },
      { id: 'storage:a', kind: 'storage', name: 'Drive A', status: 'ok', reasons: [] },
      { id: 'memory:aggregate', kind: 'memory', name: 'Memory', status: 'ok', reasons: [] },
    ];

    expect(orderComponentsByKind(components).map(c => c.kind))
      .toEqual(['storage', 'memory', 'gpu', 'cooling', 'system']);
  });

  it('keeps the relative server order for components sharing a kind', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'storage:b', kind: 'storage', name: 'Drive B', status: 'ok', reasons: [] },
      { id: 'storage:a', kind: 'storage', name: 'Drive A', status: 'ok', reasons: [] },
    ];

    expect(orderComponentsByKind(components).map(c => c.id)).toEqual(['storage:b', 'storage:a']);
  });

  it('does not mutate the input array', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'system:host', kind: 'system', name: 'System', status: 'ok', reasons: [] },
      { id: 'storage:a', kind: 'storage', name: 'Drive A', status: 'ok', reasons: [] },
    ];
    const original = [...components];

    orderComponentsByKind(components);

    expect(components).toEqual(original);
  });
});

describe('buildSpecRows', () => {
  const translate = (key: string, params?: Record<string, string>) => {
    if (key === 'diagnostics.specs.memoryWithXmp') return `${params?.memory} (XMP)`;
    if (key === 'diagnostics.specs.gpuWithDriver') return `${params?.gpu} (${params?.version})`;
    return key;
  };
  const specs: SystemSpecs = {
    pcName: 'NICOLA-PC', osBuild: '26100.4351', processor: 'AMD Ryzen 7 9800X3D',
    motherboard: 'ASUS ROG Crosshair', memory: '64 GB DDR5-6000', storage: '2 TB', graphicsCard: 'RTX 5080',
    monitor: '', soundCard: '', networkCard: '',
  };
  const memory: DiagnosticsMemoryResponse = { supported: true, modules: [], xmpLikelyActive: true, lastTest: null, testScheduled: false };
  const gpu: DiagnosticsGpuResponse = {
    supported: true,
    gpus: [{ name: 'NVIDIA GeForce RTX 5080', driverVersion: '591.86', temperatureC: 60, powerW: 200, throttle: { active: [], swPowerCapUs: 0, swThermalUs: 0, hwThermalUs: 0, hwPowerBrakeUs: 0 }, recentTdrCount: 0 }],
  };

  it('builds one row per known field, folding in XMP and the GPU driver version', () => {
    expect(buildSpecRows(specs, memory, gpu, translate)).toEqual([
      { label: 'diagnostics.specs.cpu', value: 'AMD Ryzen 7 9800X3D' },
      { label: 'diagnostics.specs.motherboard', value: 'ASUS ROG Crosshair' },
      { label: 'diagnostics.specs.memory', value: '64 GB DDR5-6000 (XMP)' },
      { label: 'diagnostics.specs.gpu', value: 'RTX 5080 (591.86)' },
      { label: 'diagnostics.specs.osBuild', value: '26100.4351' },
      { label: 'diagnostics.specs.pcName', value: 'NICOLA-PC' },
    ]);
  });

  it('omits the XMP suffix when XMP is not active', () => {
    const rows = buildSpecRows(specs, { ...memory, xmpLikelyActive: false }, gpu, translate);
    expect(rows.find(r => r.label === 'diagnostics.specs.memory')?.value).toBe('64 GB DDR5-6000');
  });

  it('falls back to the specs graphics card name when the gpu resource has no data yet', () => {
    const rows = buildSpecRows(specs, memory, null, translate);
    expect(rows.find(r => r.label === 'diagnostics.specs.gpu')?.value).toBe('RTX 5080');
  });

  it('never pairs a driver version onto specs.graphicsCard when more than one GPU is reported (ambiguous adapter identity)', () => {
    const multiGpu: DiagnosticsGpuResponse = {
      supported: true,
      gpus: [
        { name: 'Intel UHD Graphics 770', driverVersion: '31.0.101', temperatureC: 45, powerW: 15, throttle: { active: [], swPowerCapUs: 0, swThermalUs: 0, hwThermalUs: 0, hwPowerBrakeUs: 0 }, recentTdrCount: 0 },
        { name: 'NVIDIA GeForce RTX 5080', driverVersion: '591.86', temperatureC: 60, powerW: 200, throttle: { active: [], swPowerCapUs: 0, swThermalUs: 0, hwThermalUs: 0, hwPowerBrakeUs: 0 }, recentTdrCount: 0 },
      ],
    };
    const rows = buildSpecRows(specs, memory, multiGpu, translate);
    expect(rows.find(r => r.label === 'diagnostics.specs.gpu')?.value).toBe('RTX 5080');
  });

  it('omits every row when nothing has loaded yet', () => {
    expect(buildSpecRows(null, null, null, translate)).toEqual([]);
  });
});

describe('pnpProblemLabel', () => {
  it('resolves a mapped code to its translation key', () => {
    const translate = (key: string) => (key === 'diagnostics.system.problemCode.28' ? 'Drivers for this device are not installed.' : key);
    expect(pnpProblemLabel(28, translate)).toBe('Drivers for this device are not installed.');
  });

  it('falls back to a generic labeled line for an unmapped code', () => {
    const translate = (key: string, params?: Record<string, string>) =>
      key === 'diagnostics.system.problemCodeFallback' ? `Device Manager problem code ${params?.code}` : key;
    expect(pnpProblemLabel(99, translate)).toBe('Device Manager problem code 99');
  });
});

describe('incidentAppFaultLine', () => {
  const app = (overrides: Partial<DiagnosticsIncidentApp>): DiagnosticsIncidentApp => ({
    name: 'app.exe', path: 'C:/app.exe', exceptionCode: '', faultingModule: '', isGame: false, ...overrides,
  });

  it('joins module and code when both are present', () => {
    expect(incidentAppFaultLine(app({ faultingModule: 'ntdll.dll', exceptionCode: 'c0000005' }))).toBe('ntdll.dll (c0000005)');
  });

  it('drops the empty parens when only the module is known', () => {
    expect(incidentAppFaultLine(app({ faultingModule: 'ntdll.dll', exceptionCode: '' }))).toBe('ntdll.dll');
  });

  it('drops the leading space when only the code is known', () => {
    expect(incidentAppFaultLine(app({ faultingModule: '', exceptionCode: 'c0000005' }))).toBe('c0000005');
  });

  it('returns null when neither is known', () => {
    expect(incidentAppFaultLine(app({ faultingModule: '', exceptionCode: '' }))).toBeNull();
  });
});
