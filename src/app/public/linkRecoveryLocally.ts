import { loopbackFetchInit, resolveHttp } from '../../api/service';

/**
 * Hands the link's token to a Nexus service running on this computer, which
 * completes the reset it is waiting on without a code. False when there is no
 * service, it is waiting on no reset, or the link belongs to another device.
 */
export async function linkRecoveryLocally(token: string): Promise<boolean> {
  try {
    const pair = await fetch(resolveHttp('/pair'), loopbackFetchInit);
    if (!pair.ok) return false;
    const { token: serviceToken } = (await pair.json()) as { token?: string };
    if (!serviceToken) return false;
    const res = await fetch(resolveHttp('/cloud/recovery/link'), {
      ...loopbackFetchInit,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceToken}` },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
