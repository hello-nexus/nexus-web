// Host-bridge coverage for the audio capability: the manifest gate (no
// capability / preview / streamed / no WebAudio support -> the worker gets
// no audio.* methods at all), the per-instance engine construction, and
// that the engine is disposed once the keep-alive window elapses.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { SandboxContext } from '../host';

interface FakeHandle { receiver: unknown; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
interface FakeEngine {
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  clock: ReturnType<typeof vi.fn>;
  solo: ReturnType<typeof vi.fn>;
  park: ReturnType<typeof vi.fn>;
  unpark: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  reverb: ReturnType<typeof vi.fn>;
  volume: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

async function loadSandbox(opts: { webAudioSupported?: boolean } = {}) {
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
  const engines: FakeEngine[] = [];
  const AudioInstanceEngine = vi.fn(function (this: FakeEngine) {
    this.load = vi.fn();
    this.play = vi.fn();
    this.clock = vi.fn();
    this.solo = vi.fn();
    this.park = vi.fn();
    this.unpark = vi.fn();
    this.stop = vi.fn();
    this.reverb = vi.fn();
    this.volume = vi.fn();
    this.dispose = vi.fn();
    engines.push(this);
  });
  vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
  const gestures: Array<() => void> = [];
  vi.doMock('../RemoteTree', () => ({ RemoteTree: ({ onGesture }: { onGesture?: () => void }) => { if (onGesture) gestures.push(onGesture); return null; } }));
  vi.doMock('../audioEngine', () => ({
    AudioInstanceEngine,
    isWebAudioSupported: () => opts.webAudioSupported ?? true,
  }));
  const { SandboxedWidget } = await import('../SandboxedWidget');
  return { SandboxedWidget, spawnSpy, handles, engines, gestures };
}

describe('SandboxedWidget audio bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.doUnmock('../host');
    vi.doUnmock('../RemoteTree');
    vi.doUnmock('../audioEngine');
  });

  it('wires the seven audio.* methods to a fresh engine when audio is granted', async () => {
    const { SandboxedWidget, spawnSpy, engines } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.audioLoad).toBeTypeOf('function');
    expect(context.api.audioPlay).toBeTypeOf('function');
    expect(context.api.audioClock).toBeTypeOf('function');
    expect(context.api.audioSolo).toBeTypeOf('function');
    expect(context.api.audioStop).toBeTypeOf('function');
    expect(context.api.audioReverb).toBeTypeOf('function');
    expect(context.api.audioVolume).toBeTypeOf('function');
    expect(engines).toHaveLength(1);

    const channels = [new Float32Array(4)];
    context.api.audioLoad!('kick', channels, 44100);
    expect(engines[0].load).toHaveBeenCalledWith('kick', channels, 44100, undefined);
    context.api.audioPlay!('kick', { gain: 0.5 });
    expect(engines[0].play).toHaveBeenCalledWith('kick', { gain: 0.5 });
  });

  it('honours a solo claim only shortly after a press on the widget', async () => {
    const { SandboxedWidget, spawnSpy, engines, gestures } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    context.api.audioSolo!('music');
    expect(engines[0].solo).not.toHaveBeenCalled();
    expect(gestures.length).toBeGreaterThan(0);
    gestures[gestures.length - 1]();
    context.api.audioSolo!('music');
    expect(engines[0].solo).toHaveBeenCalledWith('music');
  });

  it('keeps a remounted widget\'s audio going: the park waits a tick and a reuse cancels it', async () => {
    const { SandboxedWidget, engines } = await loadSandbox();
    const el = (
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio
      />
    );
    const first = render(el);
    first.unmount();
    render(el);
    vi.advanceTimersByTime(0);
    expect(engines).toHaveLength(1);
    expect(engines[0].park).not.toHaveBeenCalled();
    expect(engines[0].unpark).toHaveBeenCalled();
  });

  it('unparks a widget remounted after its park went through, reusing the worker', async () => {
    const { SandboxedWidget, engines } = await loadSandbox();
    const el = (
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio
      />
    );
    render(el).unmount();
    vi.advanceTimersByTime(0);
    expect(engines[0].park).toHaveBeenCalledTimes(1);
    engines[0].unpark.mockClear();
    render(el);
    expect(engines).toHaveLength(1);
    expect(engines[0].unpark).toHaveBeenCalledTimes(1);
  });

  it('never exposes audio.* when the manifest lacks the audio capability', async () => {
    const { SandboxedWidget, spawnSpy, engines } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.audioLoad).toBeUndefined();
    expect(context.api.audioPlay).toBeUndefined();
    expect(engines).toHaveLength(0);
  });

  it('stays host-free in preview even when the manifest grants audio', async () => {
    const { SandboxedWidget, spawnSpy, engines } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio preview
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.audioLoad).toBeUndefined();
    expect(engines).toHaveLength(0);
  });

  it('stays silent on a streamed panel render even when the manifest grants audio', async () => {
    const { SandboxedWidget, spawnSpy, engines } = await loadSandbox();
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio streamed
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.audioLoad).toBeUndefined();
    expect(engines).toHaveLength(0);
  });

  it('never exposes audio.* when this document has no WebAudio support', async () => {
    const { SandboxedWidget, spawnSpy, engines } = await loadSandbox({ webAudioSupported: false });
    render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio
      />,
    );
    const context = spawnSpy.mock.calls[0][2] as SandboxContext;
    expect(context.api.audioLoad).toBeUndefined();
    expect(engines).toHaveLength(0);
  });

  it('disposes the engine once the keep-alive window elapses after unmount', async () => {
    const { SandboxedWidget, engines } = await loadSandbox();
    const { unmount } = render(
      <SandboxedWidget
        runtimeUrl="blob:rt" entryUrl="blob:v1"
        widgetId="com.hellonexus.aquarium" instanceId="inst-1"
        audio
      />,
    );
    expect(engines).toHaveLength(1);
    unmount();
    // The last mount going away parks the engine on the next tick - its
    // music stops and its solo clock passes back - but keeps the worker's
    // buffers for a remount.
    vi.advanceTimersByTime(0);
    expect(engines[0].park).toHaveBeenCalledTimes(1);
    expect(engines[0].dispose).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(engines[0].dispose).toHaveBeenCalledTimes(1);
  });
});
