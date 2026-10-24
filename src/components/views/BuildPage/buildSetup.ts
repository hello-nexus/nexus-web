import { fetchPcSetup, putPcSetup, type PcSetup } from '../../../api/pcSetup';

type Reply = Record<string, unknown>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function withId(requestId: unknown, body: Reply): Reply {
  return { type: 'nexus-build:setup', v: 1, ...(typeof requestId === 'string' ? { requestId } : {}), ...body };
}

/** Answers `nexus-build:setup-get` with the saved record (rev 0 and an empty setup when none). */
export async function relaySetupGet(data: Reply): Promise<Reply> {
  const record = await fetchPcSetup();
  return withId(data.requestId, record ? { rev: record.rev, setup: record.setup } : { error: 'unreachable' });
}

/** Answers `nexus-build:setup-put`: the saved record, the current record with `conflict: true` on a stale rev, or `error: <code>`. */
export async function relaySetupPut(data: Reply): Promise<Reply> {
  const { baseRev, setup } = data;
  if (typeof baseRev !== 'number' || !Number.isInteger(baseRev) || baseRev < 0 || !isObject(setup)) {
    return withId(data.requestId, { error: 'bad_message' });
  }
  const res = await putPcSetup(baseRev, setup as unknown as PcSetup);
  switch (res.kind) {
    case 'saved':
      return withId(data.requestId, { rev: res.rev, setup });
    case 'conflict':
      return withId(data.requestId, { rev: res.record.rev, setup: res.record.setup, conflict: true });
    case 'invalid':
      return withId(data.requestId, { error: res.code });
    default:
      return withId(data.requestId, { error: 'unreachable' });
  }
}

/** The unsolicited `nexus-build:setup` after a topic ping; null when the record cannot be read. */
export async function relaySetupPush(): Promise<{ rev: number; message: Reply } | null> {
  const record = await fetchPcSetup();
  return record ? { rev: record.rev, message: withId(undefined, { rev: record.rev, setup: record.setup }) } : null;
}
