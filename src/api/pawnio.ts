import { authFetchWithStatus, fetchService } from './service';

export type PawnIoState =
  | 'ok'
  | 'notInstalled'
  | 'installFailed'
  | 'restartRequired'
  | 'notRunning'
  | 'blocked'
  | 'permissionDeclined';

export type PawnIoFixAction = 'install' | 'repair' | 'restart' | 'none';

/** GET /pawnio and the body POST /pawnio/fix returns after its attempt. */
export interface PawnIoStatus {
  installed: boolean;
  open: boolean;
  state: PawnIoState;
  errorCode: number | null;
  fixAction: PawnIoFixAction;
  fixing: boolean;
  /** True only in a /pawnio/fix response that scheduled the service's own restart. */
  restarting: boolean;
}

const STATES: readonly PawnIoState[] = [
  'ok', 'notInstalled', 'installFailed', 'restartRequired', 'notRunning', 'blocked', 'permissionDeclined',
];

/**
 * Reads a /pawnio body. Anything that does not positively name a known state
 * (an older service that only sends installed/open, an error envelope, a
 * non-object) is null: callers treat null as healthy, so the gate never shows
 * on a guess.
 */
export function parsePawnIoStatus(raw: unknown): PawnIoStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PawnIoStatus>;
  if (typeof r.state !== 'string' || !STATES.includes(r.state as PawnIoState)) return null;
  return {
    installed: r.installed === true,
    open: r.open === true,
    state: r.state as PawnIoState,
    errorCode: typeof r.errorCode === 'number' ? r.errorCode : null,
    fixAction: r.fixAction ?? 'none',
    fixing: r.fixing === true,
    restarting: r.restarting === true,
  };
}

/** Null when the request failed or the body names no state; never throws. */
export async function fetchPawnIoStatus(signal?: AbortSignal): Promise<PawnIoStatus | null> {
  try {
    return parsePawnIoStatus(await fetchService<unknown>('/pawnio', signal));
  } catch {
    return null;
  }
}

/** What a /pawnio/fix attempt came back with. */
export type PawnIoFixResult =
  | { kind: 'status'; status: PawnIoStatus }
  | { kind: 'flashing' }
  | { kind: 'failed' };

/** The service refuses the driver actions with 409 while a firmware flash runs; its message names the flash. */
function isFlashRefusal(status: number, body: { msg?: unknown } | null): boolean {
  return status === 409 && typeof body?.msg === 'string' && /firmware/i.test(body.msg);
}

async function readBody(response: Response | null): Promise<{ msg?: unknown } | null> {
  try {
    return response ? (await response.json()) as { msg?: unknown } : null;
  } catch {
    return null;
  }
}

/** Runs the install or repair; resolves with the status after the attempt. */
export async function fixPawnIo(): Promise<PawnIoFixResult> {
  try {
    const { response, status } = await authFetchWithStatus('/pawnio/fix', { method: 'POST', body: {} });
    const body = await readBody(response);
    if (isFlashRefusal(status, body)) return { kind: 'flashing' };
    const parsed = response?.ok ? parsePawnIoStatus(body) : null;
    return parsed ? { kind: 'status', status: parsed } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export type PawnIoRestartResult = 'ok' | 'flashing' | 'refused';

/** Asks the service to restart the PC. 'flashing' is the firmware-update refusal; 'refused' is any other failure. */
export async function restartPcForPawnIo(): Promise<PawnIoRestartResult> {
  try {
    const { response, status } = await authFetchWithStatus('/pawnio/restart-pc', { method: 'POST', body: {} });
    if (response?.ok) return 'ok';
    return isFlashRefusal(status, await readBody(response)) ? 'flashing' : 'refused';
  } catch {
    return 'refused';
  }
}
