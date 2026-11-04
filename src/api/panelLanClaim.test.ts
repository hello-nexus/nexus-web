import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimPanelPhonePairingLan, confirmPanelPhonePairingLan } from './panel';

afterEach(() => { vi.unstubAllGlobals(); });

describe('LAN claim probe', () => {
  it('advertises SAS approval support so the updated service does not refuse with update_required', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ paired: false, needsApproval: true, requestId: 'r', sas: '1' })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await claimPanelPhonePairingLan('10.0.0.2', '9400', 'tok');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://10.0.0.2:9400/panel/phone/claim');
    expect(JSON.parse(init.body as string)).toMatchObject({ pairToken: 'tok', supportsSasApproval: true });
    expect(res?.needsApproval).toBe(true);
  });

  it('polls the confirm route on the QR-derived host and returns null on a transport failure', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'waiting-host' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await confirmPanelPhonePairingLan('10.0.0.2', '9400', 'r')).toEqual({ status: 'waiting-host' });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://10.0.0.2:9400/panel/phone/pair-code/confirm');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await confirmPanelPhonePairingLan('10.0.0.2', '9400', 'r')).toBeNull();
  });
});
