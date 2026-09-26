// Host-bridge coverage for the appData capability: the manifest gate (no
// capability / preview -> the worker gets no appDataGet/appDataPut at all,
// so it can never reach the service), the fixed appId binding (the worker's
// api calls only ever take a key - there is no appId parameter to spoof),
// and the per-key topic subscription that forwards a push into the worker.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { SandboxContext } from '../host';

interface FakeHandle { receiver: unknown; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }

async function loadSandbox() {
  vi.resetModules();
  const handles: FakeHandle[] = [];
  const spawnSpy = vi.fn(() => {
    const h: FakeHandle = {
      receiver: { connection: { mutate: vi.fn() }, subscribe: vi.fn(), root: { children: [] } },
      update: vi.fn(),
      dispose: vi.fn(),
    };
    handles.push(h);
    return h;
  });
  const getAppData = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { ok: true } });
  const putAppData = vi.fn().mockResolvedValue({ ok: true, revision: 2, updatedAt: 't2' });
  const topicCallbacks: Array<{ topic: string; onFrame: (raw: unknown) => void }> = [];
  vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
  vi.doMock('../RemoteTree', () => ({ RemoteTree: () => null }));
  vi.doMock('../appDataClient', () => ({
    getAppData,
    putAppData,
    appDataTopic: (appId: string, key: string) => `app-data/${appId}/${key}`,
  }));
  vi.doMock('../../hooks/useMultiplexSocket', () => ({
    useTopicCallback: (topic: string, _enabled: boolean, onFrame: (raw: unknown) => void) => {
      topicCallbacks.push({ topic, onFrame });
    },
  }));
  const { SandboxedWidget } = await import('../SandboxedWidget');
  return { SandboxedWidget, spawnSpy, handles, getAppData, putAppData, topicCallbacks };
}

describe('SandboxedWidget appData bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.doUnmock('../host');
    vi.doUnmock('../RemoteTree');
    vi.doUnmock('../appDataClient');
    vi.doUnmock('../../hooks/useMultiplexSocket');
  });

  it('wires appDataGet/appDataPut, bound to the widget id, when appData is granted', async () => {
    const { SandboxedWidget, spawnSpy, getAppData, putAppData } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        appData
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.appDataGet).toBeTypeOf('function');
    expect(context.api.appDataPut).toBeTypeOf('function');

    await context.api.appDataGet!('save');
    expect(getAppData).toHaveBeenCalledWith('com.hellonexus.aquarium', 'save');

    await context.api.appDataPut!('save', 1, { coins: 5 });
    expect(putAppData).toHaveBeenCalledWith('com.hellonexus.aquarium', 'save', 1, { coins: 5 });
  });

  it('never exposes appDataGet/appDataPut when the manifest lacks the appData capability', async () => {
    const { SandboxedWidget, spawnSpy, getAppData, putAppData } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.appDataGet).toBeUndefined();
    expect(context.api.appDataPut).toBeUndefined();
    expect(getAppData).not.toHaveBeenCalled();
    expect(putAppData).not.toHaveBeenCalled();
  });

  it('stays host-free in preview even when the manifest grants appData', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        appData preview
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.appDataGet).toBeUndefined();
    expect(context.api.appDataPut).toBeUndefined();
    expect(context.display).toEqual({ shape: 'rect', input: 'pointer' });
  });

  it('subscribes the topic for a key only after the worker actually reads or writes it, and forwards pushes', async () => {
    const { SandboxedWidget, spawnSpy, topicCallbacks } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        appData
      />,
    );
    expect(topicCallbacks).toHaveLength(0);

    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    await act(async () => { await context.api.appDataGet!('save'); });

    expect(topicCallbacks).toHaveLength(1);
    expect(topicCallbacks[0].topic).toBe('app-data/com.hellonexus.aquarium/save');

    const handle = spawnSpy.mock.results[0]!.value as FakeHandle;
    topicCallbacks[0].onFrame({ revision: 3, updatedAt: 't3', data: { coins: 9 } });
    expect(handle.update).toHaveBeenCalledWith({ appData: { key: 'save', revision: 3, updatedAt: 't3', data: { coins: 9 } } });
  });

  it('binds displayShape/displayInput from the props into the static context', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        displayShape="round" displayInput="none"
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.display).toEqual({ shape: 'round', input: 'none' });
  });
});
