import { useEffect, useMemo, useState } from 'react';
import { fetchService } from '../../../api/service';
import { useSystemSpecs, type SystemSpecs } from '../../../hooks/useSystemSpecs';
import { buildFpsSignatureParams, primaryGpuModel } from '../../../panel/widgets/frames/fpsSignatureParams';

// Same rule as the cloud api's device case id: a catalog part id.
const CASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const BYTES_PER_GIB = 1024 ** 3;

export interface BuildMachine {
  processor?: string;
  primaryGpu?: string;
  memory?: string;
  motherboard?: string;
  storage?: string;
  monitor?: string;
  res?: string;
  hz?: number;
  ramGb?: number;
  caseId?: string;
  // The case was filled in by detection (a Y70 display), not chosen; absent when the user chose it.
  caseAuto?: true;
  devices?: BuildDevice[];
}

/** One detected cooler, fan or controller from the service's `/system/devices`; passed through to the frame untouched. */
export interface BuildDevice {
  key: string;
  modelKey: string;
  category: string;
  vendor: string;
  model: string;
  vid?: number;
  pid?: number;
  family?: string;
  count?: number;
  countSource?: string;
  radiatorMm?: number;
  partOf?: string;
}

export function isValidCaseId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && CASE_ID_PATTERN.test(value));
}

/** The `machine` of the Build hello: this PC's report, its case and its detected devices. */
export function buildMachine(specs: SystemSpecs, caseId: string | null, devices: BuildDevice[], caseAuto = false): BuildMachine {
  const sig = buildFpsSignatureParams(specs);
  return {
    processor: specs.processor || undefined,
    primaryGpu: primaryGpuModel(specs),
    memory: specs.memory || undefined,
    motherboard: specs.motherboard || undefined,
    storage: specs.storage || undefined,
    monitor: specs.monitor || undefined,
    res: sig?.res,
    hz: sig?.hz,
    ramGb: sig?.ramBytes != null ? Math.round(sig.ramBytes / BYTES_PER_GIB) : undefined,
    ...(caseId ? { caseId } : {}),
    ...(caseId && caseAuto ? { caseAuto: true as const } : {}),
    ...(devices.length > 0 ? { devices } : {}),
  };
}

/** The case the service keeps for this PC and whether detection filled it in; none when it keeps none or did not answer. */
export async function fetchMachineCaseState(): Promise<{ caseId: string | null; auto: boolean }> {
  const res = await fetchService<{ caseId?: string | null; auto?: boolean }>('/system/case');
  if (!res || typeof res.caseId !== 'string' || !isValidCaseId(res.caseId)) return { caseId: null, auto: false };
  return { caseId: res.caseId, auto: res.auto === true };
}

/** The case the service keeps for this PC; null when it keeps none or did not answer. */
export async function fetchMachineCase(): Promise<string | null> {
  return (await fetchMachineCaseState()).caseId;
}

/** Detected coolers, fans and controllers. An older service answers 404, which leaves the list empty. */
export async function fetchMachineDevices(): Promise<BuildDevice[]> {
  try {
    const res = await fetchService<{ devices?: unknown }>('/system/devices');
    if (!res || !Array.isArray(res.devices)) return [];
    return res.devices.filter((d): d is BuildDevice => !!d && typeof d.key === 'string' && typeof d.modelKey === 'string');
  } catch {
    return [];
  }
}

const LAYOUT_DEVICES = new Set(['cooler', 'fan']);

/**
 * What the case layout depends on among the machine's facts: the case, the board and memory, the processor and card, and the coolers and
 * fans detected. Build keeps it in the setup record beside the layout it resolved, so a differing key means the layout is out of date.
 */
export function layoutKeyOf(machine: BuildMachine): string {
  const devices = (machine.devices ?? [])
    .filter(d => LAYOUT_DEVICES.has(d.category))
    .map(d => `${d.key}:${d.count ?? ''}:${d.radiatorMm ?? ''}`)
    .sort();
  return [
    `case=${machine.caseId ?? ''}`,
    `cpu=${machine.processor ?? ''}`,
    `gpu=${machine.primaryGpu ?? ''}`,
    `board=${machine.motherboard ?? ''}`,
    `mem=${machine.memory ?? ''}`,
    ...devices.map(d => `dev=${d}`),
  ].join('|');
}

/** This PC as Build sees it, once the service has answered for the report, the case and the devices (an answer of none counts). */
export function useBuildMachine(enabled: boolean): { machine: BuildMachine | null; key: string | null } {
  const { specs } = useSystemSpecs(enabled);
  const [inputs, setInputs] = useState<{ caseId: string | null; devices: BuildDevice[] } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void Promise.all([fetchMachineCase(), fetchMachineDevices()]).then(([caseId, devices]) => {
      if (!cancelled) setInputs({ caseId, devices });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return useMemo(() => {
    if (!enabled || !specs || !inputs) return { machine: null, key: null };
    const machine = buildMachine(specs, inputs.caseId, inputs.devices);
    return { machine, key: layoutKeyOf(machine) };
  }, [enabled, specs, inputs]);
}
