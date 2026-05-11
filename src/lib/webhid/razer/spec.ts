// Loads the shared Razer protocol spec (razer-mouse.json) and exposes a typed
// profile lookup. Same JSON file is embedded by the service; both consumers
// speak the same wire protocol.
import raw from '../spec/razer-mouse.json';

export type RazerPollingVariant = 'standard' | 'hyperpolling';

export interface RazerMouseProfile {
  pid: number;
  name: string;
  transactionId: number;
  maxDpi: number;
  polling: RazerPollingVariant;
  hasBattery: boolean;
  hasSleep: boolean;
}

export interface RazerCommand {
  class: number;
  id: number;
  dataSize: number;
  reads: boolean;
}

export interface RazerFraming {
  reportSize: number;
  reportIdByte: number;
  crcStart: number;   // inclusive, index in the 91-byte buffer
  crcEnd: number;     // inclusive
  crcStore: number;   // where to write the CRC
}

export interface RazerSpec {
  vendorId: number;
  varstore: number;
  framing: RazerFraming;
  commands: Record<string, RazerCommand>;
  pollingMaps: Record<RazerPollingVariant, Record<number, number>>;
  profiles: ReadonlyMap<number, RazerMouseProfile>;
}

function parseHex(v: string): number {
  return parseInt(v.replace(/^0x/i, ''), 16);
}

function parseCommand(v: { class: string; id: string; dataSize: number; reads: boolean }): RazerCommand {
  return {
    class: parseHex(v.class),
    id: parseHex(v.id),
    dataSize: v.dataSize,
    reads: v.reads,
  };
}

function parsePollingMap(m: Record<string, string>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [hz, code] of Object.entries(m)) {
    out[parseInt(hz, 10)] = parseHex(code);
  }
  return out;
}

function buildSpec(): RazerSpec {
  const commands: Record<string, RazerCommand> = {};
  for (const [k, v] of Object.entries(raw.commands)) {
    commands[k] = parseCommand(v as { class: string; id: string; dataSize: number; reads: boolean });
  }

  const profiles = new Map<number, RazerMouseProfile>();
  for (const d of raw.devices) {
    const pid = parseHex(d.pid);
    profiles.set(pid, {
      pid,
      name: d.name,
      transactionId: parseHex(d.transactionId),
      maxDpi: d.maxDpi,
      polling: d.polling as RazerPollingVariant,
      hasBattery: d.hasBattery,
      hasSleep: d.hasSleep,
    });
  }

  return {
    vendorId: parseHex(raw.vendorId),
    varstore: parseHex(raw.varstore),
    framing: {
      reportSize: raw.framing.reportSize,
      reportIdByte: raw.framing.reportIdByte,
      crcStart: raw.framing.crc.startByteInclusive,
      crcEnd: raw.framing.crc.endByteInclusive,
      crcStore: raw.framing.crc.storeAtByte,
    },
    commands,
    pollingMaps: {
      standard: parsePollingMap(raw.pollingMaps.standard),
      hyperpolling: parsePollingMap(raw.pollingMaps.hyperpolling),
    },
    profiles,
  };
}

export const RAZER_SPEC: RazerSpec = buildSpec();

export function getProfile(pid: number): RazerMouseProfile | undefined {
  return RAZER_SPEC.profiles.get(pid);
}
