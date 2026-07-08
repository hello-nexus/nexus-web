// Contract-shaped fixtures for the diagnostics UI, used only as a dev-build
// fallback (see withMockFallback in diagnostics.ts) while the service routes
// in .deep-build/diagnostics-contract.md are still being built. Timestamps
// are fixed strings, not `new Date()`, so snapshots and screenshots stay
// deterministic across runs.
import type {
  CancelMemoryTestResponse,
  DiagnosticsCoolingResponse,
  DiagnosticsGpuResponse,
  DiagnosticsHealth,
  DiagnosticsIncidentsResponse,
  DiagnosticsMemoryResponse,
  DiagnosticsSmartResponse,
  DiagnosticsSystemResponse,
  ScheduleMemoryTestResponse,
} from './diagnostics';

const GENERATED_AT = '2026-07-08T02:00:00Z';

const NVME_DRIVE_ID = 'storage:S6Z1NX0T123456';
const SATA_DRIVE_ID = 'storage:WD-WCC7K1234567';

export function mockDiagnosticsHealth(): DiagnosticsHealth {
  return {
    generatedAt: GENERATED_AT,
    supported: true,
    overall: 'watch',
    components: [
      {
        id: NVME_DRIVE_ID,
        kind: 'storage',
        name: 'Samsung SSD 990 PRO 2TB',
        status: 'ok',
        reasons: [],
      },
      {
        id: SATA_DRIVE_ID,
        kind: 'storage',
        name: 'WD Blue 4TB',
        status: 'watch',
        reasons: [
          {
            code: 'smart.reallocated',
            severity: 'watch',
            summary: '5 reallocated sectors',
            detail: 'SMART attribute 05 raw value is 5 and previously was 0.',
          },
        ],
      },
      {
        id: 'memory:aggregate',
        kind: 'memory',
        name: 'System Memory',
        status: 'ok',
        reasons: [],
      },
      {
        id: 'gpu:0',
        kind: 'gpu',
        name: 'NVIDIA GeForce RTX 3070',
        status: 'watch',
        reasons: [
          {
            code: 'gpu.thermalThrottle',
            severity: 'watch',
            summary: 'Thermal throttling active',
            detail: 'The GPU is currently limiting clocks due to temperature.',
          },
        ],
      },
      {
        id: 'cooling:hyte-q60:pump',
        kind: 'cooling',
        name: 'HYTE Q60 Pump',
        status: 'act',
        reasons: [
          {
            code: 'cooling.pumpStall',
            severity: 'act',
            summary: 'Pump RPM reads 0',
            detail: 'The pump has reported 0 RPM for more than 60 seconds.',
          },
        ],
      },
      {
        id: 'system:host',
        kind: 'system',
        name: 'System',
        status: 'ok',
        reasons: [],
      },
    ],
  };
}

export function mockDiagnosticsIncidents(): DiagnosticsIncidentsResponse {
  return {
    supported: true,
    windowDays: 30,
    incidents: [
      {
        id: 'System/39714',
        timeUtc: '2026-07-06T23:54:42Z',
        source: 'whea',
        severity: 'warning',
        title: 'Corrected PCIe hardware error',
        detail: 'WHEA-Logger event 17 reported a corrected hardware error on a PCIe root port.',
        app: null,
        data: { bugcheckCode: '' },
      },
      {
        id: 'Application/8821',
        timeUtc: '2026-07-05T20:12:03Z',
        source: 'appCrash',
        severity: 'critical',
        title: 'Cyberpunk2077.exe crashed',
        detail: 'Exception code c0000005 in nvwgf2umx.dll.',
        app: {
          name: 'cyberpunk2077.exe',
          path: 'D:/SteamLibrary/steamapps/common/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
          exceptionCode: 'c0000005',
          faultingModule: 'nvwgf2umx.dll',
          isGame: true,
        },
        data: {},
      },
      {
        id: 'System/41003',
        timeUtc: '2026-07-04T09:03:11Z',
        source: 'dirtyShutdown',
        severity: 'warning',
        title: 'Unexpected shutdown',
        detail: 'The system did not shut down cleanly on the previous session.',
        app: null,
        data: {},
      },
      {
        id: 'Application/6120',
        timeUtc: '2026-07-02T14:47:55Z',
        source: 'appCrash',
        severity: 'info',
        title: 'notepad.exe crashed',
        detail: 'Exception code c0000005 in ntdll.dll.',
        app: {
          name: 'notepad.exe',
          path: 'C:/Windows/System32/notepad.exe',
          exceptionCode: 'c0000005',
          faultingModule: 'ntdll.dll',
          isGame: false,
        },
        data: {},
      },
      {
        id: 'System/12099',
        timeUtc: '2026-06-29T18:20:00Z',
        source: 'bugcheck',
        severity: 'critical',
        title: 'System crash (bugcheck 0x1a)',
        detail: 'The system restarted after a memory management bugcheck.',
        app: null,
        data: { bugcheckCode: '0x1a' },
      },
    ],
  };
}

export function mockDiagnosticsSmart(): DiagnosticsSmartResponse {
  return {
    supported: true,
    drives: [
      {
        id: NVME_DRIVE_ID,
        name: 'Samsung SSD 990 PRO 2TB',
        serial: 'S6Z1NX0T123456',
        bus: 'nvme',
        sizeBytes: 2000398934016,
        temperatureC: 42,
        powerOnHours: 1234,
        powerCycles: 456,
        healthPercent: 97,
        status: 'good',
        statusReasons: [],
        attributes: [
          { id: 5, name: 'Reallocated Sectors Count', current: 100, worst: 100, threshold: 10, raw: 0, flagged: false },
          { id: 9, name: 'Power-On Hours', current: 99, worst: 99, threshold: 0, raw: 1234, flagged: false },
          { id: 12, name: 'Power Cycle Count', current: 99, worst: 99, threshold: 0, raw: 456, flagged: false },
        ],
        nvme: {
          criticalWarning: 0,
          availableSpare: 100,
          spareThreshold: 10,
          percentageUsed: 3,
          mediaErrors: 0,
          errorLogEntries: 0,
          unsafeShutdowns: 12,
          dataUnitsReadBytes: 512000000000,
          dataUnitsWrittenBytes: 780000000000,
        },
      },
      {
        id: SATA_DRIVE_ID,
        name: 'WD Blue 4TB',
        serial: 'WD-WCC7K1234567',
        bus: 'sata',
        sizeBytes: 4000787030016,
        temperatureC: 38,
        powerOnHours: 9820,
        powerCycles: 812,
        healthPercent: 82,
        status: 'caution',
        statusReasons: ['smart.reallocated'],
        attributes: [
          { id: 5, name: 'Reallocated Sectors Count', current: 90, worst: 90, threshold: 36, raw: 5, flagged: true },
          { id: 197, name: 'Current Pending Sector Count', current: 100, worst: 100, threshold: 0, raw: 0, flagged: false },
          { id: 9, name: 'Power-On Hours', current: 76, worst: 76, threshold: 0, raw: 9820, flagged: false },
        ],
        nvme: null,
      },
    ],
  };
}

export function mockDiagnosticsMemory(): DiagnosticsMemoryResponse {
  return {
    supported: true,
    modules: [
      { slot: 'DIMM_A1', sizeBytes: 17179869184, maxSpeedMts: 6000, configuredSpeedMts: 6000, manufacturer: 'Corsair', partNumber: 'CMK32GX5M2B6000C36' },
      { slot: 'DIMM_B1', sizeBytes: 17179869184, maxSpeedMts: 6000, configuredSpeedMts: 6000, manufacturer: 'Corsair', partNumber: 'CMK32GX5M2B6000C36' },
    ],
    xmpLikelyActive: true,
    lastTest: null,
    testScheduled: mockMemoryTestScheduled,
  };
}

export function mockDiagnosticsGpu(): DiagnosticsGpuResponse {
  return {
    supported: true,
    gpus: [
      {
        name: 'NVIDIA GeForce RTX 3070',
        driverVersion: '591.86',
        temperatureC: 62,
        powerW: 180.5,
        throttle: {
          active: ['swThermal'],
          swPowerCapUs: 30224350,
          swThermalUs: 1658139360,
          hwThermalUs: 0,
          hwPowerBrakeUs: 0,
        },
        recentTdrCount: 0,
        recentDriverErrorCount: 2,
      },
    ],
  };
}

export function mockDiagnosticsCooling(): DiagnosticsCoolingResponse {
  return {
    supported: true,
    devices: [
      { id: 'cooling:hyte-q60:pump', name: 'HYTE Q60 Pump', type: 'pump', rpm: 0, targetDutyPercent: 60, status: 'stalled', sinceUtc: '2026-07-08T01:40:00Z' },
      { id: 'cooling:hyte-q60:fan1', name: 'HYTE Q60 Fan 1', type: 'fan', rpm: 1180, targetDutyPercent: 55, status: 'ok', sinceUtc: null },
      { id: 'cooling:hyte-q60:fan2', name: 'HYTE Q60 Fan 2', type: 'fan', rpm: 1190, targetDutyPercent: 55, status: 'ok', sinceUtc: null },
    ],
  };
}

export function mockDiagnosticsSystem(): DiagnosticsSystemResponse {
  return {
    supported: true,
    pnpProblems: [],
    counts30d: {
      whea: 20,
      bugchecks: 1,
      dirtyShutdowns: 3,
      diskErrors: 0,
      tdrs: 0,
      gpuDriverErrors: 2,
      appCrashes: 5,
    },
  };
}

// The GET /diagnostics/memory mock reads this so a mocked schedule/cancel
// round-trip is reflected on the next refetch, matching the real service's
// persisted-flag behavior closely enough to exercise the confirm/cancel UI.
let mockMemoryTestScheduled = false;

export function mockScheduleMemoryTest(): ScheduleMemoryTestResponse {
  mockMemoryTestScheduled = true;
  return { scheduled: true, requiresReboot: true };
}

export function mockCancelMemoryTest(): CancelMemoryTestResponse {
  mockMemoryTestScheduled = false;
  return { scheduled: false };
}
