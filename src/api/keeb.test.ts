import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type KeebMacro,
  type KeebSettings,
  type KeyboardState,
  type SetFirmwareLightingBody,
  type SetGameModeBody,
  type SetLayerKeyBody,
  type SetPassiveLightingBody,
  type SetRotaryWheelsBody,
  getKeebLayer,
  getKeebMacro,
  getKeebRotaryFunctions,
  getKeebSettings,
  getKeebState,
  resetKeebLayer,
  setKeebFirmwareLighting,
  setKeebGameMode,
  setKeebLayerKey,
  setKeebMacro,
  setKeebPassiveLighting,
  setKeebRotary,
  setKeebRotarySensitivity,
} from './keeb';
import { fetchService, postService } from './service';

vi.mock('./service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(),
}));

const mockFetch = vi.mocked(fetchService);
const mockPost = vi.mocked(postService);

const state: KeyboardState = {
  isConnected: true,
  profile: 1,
  layout: 'ANSI',
  layer: 1,
  keys: [[{ mode: 'StandardKey', function: 'A', input: null }]],
};

const settings: KeebSettings = {
  shiftKeyDisabled: false,
  windowsKeyDisabled: false,
  altF4Disabled: false,
  altTabDisabled: false,
  animationMode: 'Wave',
  speed: 'Medium',
  direction: 'Left',
  brightness: 50,
  keyIndicator: false,
  keyReactive: false,
  keyReactiveMask: false,
  keyReactiveMode: 'Single',
  keyReactiveColor: { r: 255, g: 0, b: 0, a: 255 },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('boolean settings wrappers', () => {
  const fwBody: SetFirmwareLightingBody = {
    animationMode: 'Ripple',
    speed: 'Fast',
    direction: 'Right',
    brightness: 80,
    keyIndicator: true,
  };
  const plBody: SetPassiveLightingBody = {
    keyReactive: true,
    keyReactiveMask: false,
    keyReactiveMode: 'Single',
    keyReactiveColor: { r: 0, g: 255, b: 0, a: 255 },
  };
  const gmBody: SetGameModeBody = { altF4: true, altTab: false, shiftTab: true, windowsKey: false };
  const rotBody: SetRotaryWheelsBody = { left: 'Volume', right: 'Zoom', apps: [] };

  it('return true when the service acks (non-null response)', async () => {
    mockPost.mockResolvedValue({ error: false });
    await expect(setKeebFirmwareLighting(fwBody)).resolves.toBe(true);
    await expect(setKeebPassiveLighting(plBody)).resolves.toBe(true);
    await expect(setKeebGameMode(gmBody)).resolves.toBe(true);
    await expect(setKeebRotary(rotBody)).resolves.toBe(true);
    await expect(setKeebRotarySensitivity('High')).resolves.toBe(true);
  });

  it('return false when the post fails (null response)', async () => {
    mockPost.mockResolvedValue(null);
    await expect(setKeebFirmwareLighting(fwBody)).resolves.toBe(false);
    await expect(setKeebPassiveLighting(plBody)).resolves.toBe(false);
    await expect(setKeebGameMode(gmBody)).resolves.toBe(false);
    await expect(setKeebRotary(rotBody)).resolves.toBe(false);
    await expect(setKeebRotarySensitivity('High')).resolves.toBe(false);
  });

  it('return false on a 200 carrying the ApiResponse.Fail envelope', async () => {
    mockPost.mockResolvedValue({ error: true, msg: 'keeb disconnected' });
    await expect(setKeebFirmwareLighting(fwBody)).resolves.toBe(false);
    await expect(setKeebRotary(rotBody)).resolves.toBe(false);
  });

  it('post to their endpoints with the given bodies', async () => {
    mockPost.mockResolvedValue({ error: false });
    await setKeebFirmwareLighting(fwBody);
    expect(mockPost).toHaveBeenLastCalledWith('/keeb/firmware/lighting', fwBody);
    await setKeebPassiveLighting(plBody);
    expect(mockPost).toHaveBeenLastCalledWith('/keeb/passive-lighting', plBody);
    await setKeebGameMode(gmBody);
    expect(mockPost).toHaveBeenLastCalledWith('/keeb/game-mode', gmBody);
    await setKeebRotary(rotBody);
    expect(mockPost).toHaveBeenLastCalledWith('/keeb/rotary', rotBody);
    await setKeebRotarySensitivity('Low');
    expect(mockPost).toHaveBeenLastCalledWith('/keeb/rotary/sensitivity', { sensitivity: 'Low' });
  });
});

describe('setKeebLayerKey', () => {
  const body: SetLayerKeyBody = { x: 1, y: 2, func: 'B', mode: 'MediaKey', input: null };

  it('posts to the layer key endpoint and returns the server state', async () => {
    mockPost.mockResolvedValue(state);
    await expect(setKeebLayerKey(1, body)).resolves.toBe(state);
    expect(mockPost).toHaveBeenCalledWith('/keeb/layer/1/key', body);
  });

  it('returns null when the post fails', async () => {
    mockPost.mockResolvedValue(null);
    await expect(setKeebLayerKey(2, body)).resolves.toBeNull();
    expect(mockPost).toHaveBeenCalledWith('/keeb/layer/2/key', body);
  });
});

describe('resetKeebLayer', () => {
  it('posts an empty body to the layer reset endpoint and returns the server state', async () => {
    mockPost.mockResolvedValue(state);
    await expect(resetKeebLayer(3)).resolves.toBe(state);
    expect(mockPost).toHaveBeenCalledWith('/keeb/layer/3/reset', {});
  });

  it('returns null when the post fails', async () => {
    mockPost.mockResolvedValue(null);
    await expect(resetKeebLayer(0)).resolves.toBeNull();
  });
});

describe('macros', () => {
  const macro: KeebMacro = {
    index: 5,
    keys: [{ key: 'A', duration: 10, type: 'Make', category: 'keyboard' }],
  };

  it('getKeebMacro unwraps the macro from the response wrapper', async () => {
    mockFetch.mockResolvedValue({ error: false, macro });
    await expect(getKeebMacro(5)).resolves.toBe(macro);
    expect(mockFetch).toHaveBeenCalledWith('/keeb/macro/5');
  });

  it('getKeebMacro returns null when the fetch fails', async () => {
    mockFetch.mockResolvedValue(null);
    await expect(getKeebMacro(5)).resolves.toBeNull();
  });

  it('setKeebMacro posts the keys and unwraps the macro', async () => {
    mockPost.mockResolvedValue({ error: false, macro });
    await expect(setKeebMacro(5, macro.keys)).resolves.toBe(macro);
    expect(mockPost).toHaveBeenCalledWith('/keeb/macro/5', { keys: macro.keys });
  });

  it('setKeebMacro returns null when the post fails', async () => {
    mockPost.mockResolvedValue(null);
    await expect(setKeebMacro(2, [])).resolves.toBeNull();
    expect(mockPost).toHaveBeenCalledWith('/keeb/macro/2', { keys: [] });
  });
});

describe('getKeebRotaryFunctions', () => {
  it('unwraps the functions list', async () => {
    mockFetch.mockResolvedValue({ error: false, functions: ['Volume', 'Zoom'] });
    await expect(getKeebRotaryFunctions()).resolves.toEqual(['Volume', 'Zoom']);
    expect(mockFetch).toHaveBeenCalledWith('/keeb/rotary/functions');
  });

  it('returns an empty list when the fetch fails', async () => {
    mockFetch.mockResolvedValue(null);
    await expect(getKeebRotaryFunctions()).resolves.toEqual([]);
  });
});

describe('state and settings pass-throughs', () => {
  it('getKeebState fetches the requested layer', async () => {
    mockFetch.mockResolvedValue(state);
    await expect(getKeebState(2)).resolves.toBe(state);
    expect(mockFetch).toHaveBeenCalledWith('/keeb/state?layer=2');
  });

  it('getKeebState defaults to layer 0 and passes null through', async () => {
    mockFetch.mockResolvedValue(null);
    await expect(getKeebState()).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('/keeb/state?layer=0');
  });

  it('getKeebLayer fetches the layer endpoint', async () => {
    mockFetch.mockResolvedValue(state);
    await expect(getKeebLayer(1)).resolves.toBe(state);
    expect(mockFetch).toHaveBeenCalledWith('/keeb/layer/1');
  });

  it('getKeebSettings fetches the settings endpoint', async () => {
    mockFetch.mockResolvedValue(settings);
    await expect(getKeebSettings()).resolves.toBe(settings);
    expect(mockFetch).toHaveBeenCalledWith('/keeb/settings');
  });

  it('getKeebSettings passes null through', async () => {
    mockFetch.mockResolvedValue(null);
    await expect(getKeebSettings()).resolves.toBeNull();
  });
});
