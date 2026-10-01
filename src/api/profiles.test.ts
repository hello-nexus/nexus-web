import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfile, renameProfile, importProfileFile, inspectProfileFile } from './profiles';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  // The jsdom origin (http://localhost/, no port) reads as a remote origin,
  // so authFetchWithStatus would otherwise route these calls onto the cloud
  // relay. Force the direct LAN branch, matching serviceRelayRouting.test.ts.
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('createProfile', () => {
  it('resolves the profile on a 2xx response', async () => {
    const profile = { id: 'p1', name: 'Gaming', createdAt: '', updatedAt: '' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok', profile })));

    const result = await createProfile('Gaming');
    expect(result).toEqual({ status: 200, body: { error: false, msg: 'Ok', profile } });
  });

  it('preserves the 409 status and profile_name_taken msg instead of collapsing to null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { error: true, msg: 'profile_name_taken' })));

    const result = await createProfile('Gaming');
    expect(result).toEqual({ status: 409, body: { error: true, msg: 'profile_name_taken' } });
  });

  it('resolves status 0 with a null body on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const result = await createProfile('Gaming');
    expect(result).toEqual({ status: 0, body: null });
  });
});

describe('renameProfile', () => {
  it('preserves the 409 status and profile_name_taken msg', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(409, { error: true, msg: 'profile_name_taken' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await renameProfile('p1', 'Work');
    expect(result).toEqual({ status: 409, body: { error: true, msg: 'profile_name_taken' } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ name: 'Work' }));
  });
});

describe('importProfileFile', () => {
  it('resolves the profile on a 2xx response and sends the file bytes unchanged', async () => {
    const profile = { id: 'p2', name: 'Imported', createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok', profile }));
    vi.stubGlobal('fetch', fetchMock);

    const fileText = JSON.stringify({ name: 'Imported', settings: {} });
    const file = new File([fileText], 'Imported.nexusprofile');

    const result = await importProfileFile(file);
    expect(result).toEqual({ status: 200, body: { error: false, msg: 'Ok', profile } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(fileText);
  });

  it('preserves the 409 status and profile_name_taken msg on a name collision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { error: true, msg: 'profile_name_taken' })));

    const file = new File([JSON.stringify({ name: 'Dup', settings: {} })], 'profile.json', { type: 'application/json' });
    const result = await importProfileFile(file);
    expect(result).toEqual({ status: 409, body: { error: true, msg: 'profile_name_taken' } });
  });

  it('leaves an unreadable file to the service, which answers 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { error: true, msg: 'Invalid profile JSON.' })));

    const file = new File(['not json'], 'profile.json', { type: 'application/json' });
    const result = await importProfileFile(file);
    expect(result).toEqual({ status: 400, body: { error: true, msg: 'Invalid profile JSON.' } });
  });

  it('adds appData=skip when app data is left out', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['{}'], 'Gaming.nexusprofile');
    await importProfileFile(file, true, false);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/import?replace=true&appData=skip');
  });

  it('posts to the plain import path when replace is omitted or false', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([JSON.stringify({ name: 'Gaming' })], 'profile.json', { type: 'application/json' });

    await importProfileFile(file);
    let [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/import');
    expect(url).not.toContain('replace');

    await importProfileFile(file, false);
    [url] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/profiles/import');
    expect(url).not.toContain('replace');
  });

  it('posts to /profiles/import?replace=true when replace is true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([JSON.stringify({ name: 'Gaming' })], 'profile.json', { type: 'application/json' });
    await importProfileFile(file, true);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/import?replace=true');
  });

  it('sends a legacy zip .nexusprofile as raw bytes, leaving format detection to the service', async () => {
    const profile = { id: 'p3', name: 'Archived', createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok', profile }));
    vi.stubGlobal('fetch', fetchMock);

    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const file = new File([zipBytes], 'nexus-Gaming.nexusprofile');
    const result = await importProfileFile(file);

    expect(result).toEqual({ status: 200, body: { error: false, msg: 'Ok', profile } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/import');
    expect(url).not.toContain('replace');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream');
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(zipBytes);
  });

  it('appends replace=true for a .nexusprofile import too', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: 'Ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([new Uint8Array([0x50, 0x4b])], 'nexus-Gaming.nexusprofile');
    await importProfileFile(file, true);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/import?replace=true');
  });

  it('resolves status 0 without a network call when a .nexusprofile read throws', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([new Uint8Array([0x50, 0x4b])], 'nexus-Gaming.nexusprofile');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('read failed'));

    const result = await importProfileFile(file);
    expect(result).toEqual({ status: 0, body: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('inspectProfileFile', () => {
  it('returns the name and app ids the service reads from the file', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { name: 'Gaming', appIds: ['com.hellonexus.aquarium'], format: 'json' }));
    vi.stubGlobal('fetch', fetchMock);

    const info = await inspectProfileFile(new File(['{}'], 'Gaming.nexusprofile'));
    expect(info).toEqual({ name: 'Gaming', appIds: ['com.hellonexus.aquarium'], format: 'json' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/import/inspect');
    expect(init.method).toBe('POST');
  });

  it('returns null when the service cannot read the file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { error: true })));
    expect(await inspectProfileFile(new File(['x'], 'x.json'))).toBeNull();
  });
});
