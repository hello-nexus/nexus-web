// Pure functions that build and parse Razer's 91-byte HID feature report.
// No I/O - these are the byte-for-byte equivalent of the service's
// RazerReport.cs + RazerClient.cs, driven by the shared JSON spec.
import { RAZER_SPEC, type RazerCommand } from './spec';

/** The 91-byte HID feature buffer: [reportId=0, status, txid, remaining_hi, remaining_lo, proto, dsize, class, id, args[80], crc, reserved]. */
export type RazerFrame = Uint8Array;

/** Arguments for a Razer command - 80 bytes, caller provides the active subset at the front. */
export interface BuildFrameArgs {
  command: RazerCommand;
  transactionId: number;
  args: readonly number[];
}

/** Build a fully-framed 91-byte Razer feature report with CRC. */
export function buildFrame({ command, transactionId, args }: BuildFrameArgs): RazerFrame {
  const { reportSize, crcStart, crcEnd, crcStore } = RAZER_SPEC.framing;
  const buf = new Uint8Array(reportSize);
  buf[0] = 0;                        // HID report id
  buf[1] = 0;                        // status
  buf[2] = transactionId;
  buf[3] = 0;                        // remaining packets hi
  buf[4] = 0;                        // remaining packets lo
  buf[5] = 0;                        // protocol type
  buf[6] = command.dataSize;
  buf[7] = command.class;
  buf[8] = command.id;
  const argOffset = 9;
  for (let i = 0; i < Math.min(args.length, 80); i++) {
    buf[argOffset + i] = args[i] & 0xFF;
  }
  buf[crcStore] = computeCrc(buf, crcStart, crcEnd);
  buf[reportSize - 1] = 0;           // reserved
  return buf;
}

/** XOR of bytes [start, end] inclusive. */
export function computeCrc(buf: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i <= end; i++) {
    crc ^= buf[i];
  }
  return crc & 0xFF;
}

/** Parsed reply from the device. */
export interface RazerReply {
  status: number;
  transactionId: number;
  commandClass: number;
  commandId: number;
  dataSize: number;
  /** args[0..79] - the payload the device sent back */
  args: Uint8Array;
}

/**
 * Parse a reply. Accepts either the raw 91-byte buffer (report id + payload) OR
 * the 90-byte payload-only buffer Chrome hands us from `receiveFeatureReport`
 * (which strips the report id).
 */
export function parseReply(buf: Uint8Array): RazerReply {
  // Chromium's `receiveFeatureReport` returns data EXCLUDING the report id,
  // so the payload bytes are shifted one earlier. Normalize both shapes.
  const hasReportId = buf.length === RAZER_SPEC.framing.reportSize;
  const base = hasReportId ? 1 : 0;
  return {
    status: buf[base + 0],
    transactionId: buf[base + 1],
    commandClass: buf[base + 6],
    commandId: buf[base + 7],
    dataSize: buf[base + 5],
    args: buf.slice(base + 8, base + 88),
  };
}

/** Does the reply indicate a successful device response? (0x02 = success per OpenRazer). */
export function isSuccess(reply: RazerReply): boolean {
  return reply.status === 0x02;
}
