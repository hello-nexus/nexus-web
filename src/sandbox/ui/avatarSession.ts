// Host-side glue over the vendored avatar runtime (see src/avatar/README.md).
// Only reachable via AvatarComposite's dynamic import(), so `three` and the
// vendored pack/runtime code never reach the main dashboard bundle.
//
// Owns exactly the wiring the pinned ui-avatar contract describes: dance /
// listening / energy route through NexusBridge signals (the same mappings
// table the pack's own NexusBridge component would use); reaction triggers
// the animator directly, bypassing the bridge's mapping table; intro plays
// the one-shot walk-in + camera push-in. Pointer orbit/zoom is gated by the
// canvas's pointer-events, owned by AvatarComposite's claim bookkeeping
// (CameraController itself has no enable/disable switch, so pointer-events
// is the only host-side lever without touching the vendored class).

import * as THREE from 'three';
import { getToken } from '../../api/auth';
import { loadPack, type AvatarPack } from '../../avatar/pack/loadPack';
import type { ScriptFieldValue } from '../../avatar/pack/types';
import { AvatarRuntime } from '../../avatar/runtime/AvatarRuntime';
import { TOON_TUNING } from '../../avatar/runtime/materials/toonShader';
import { CameraController, cameraOptionsFromFields } from '../../avatar/runtime/behaviors/cameraController';
import { IntroSequence } from '../../avatar/runtime/behaviors/introSequence';
import { DemoSequencer, sequencerOptionsFromFields } from '../../avatar/runtime/behaviors/demoSequencer';
import { NexusBridge, bridgeOptionsFromFields, type BridgeEvent } from '../../avatar/runtime/behaviors/nexusBridge';
import { OutlineEffect, outlineParamsFromScene } from '../../avatar/runtime/post/outline';

export interface AvatarSessionOptions {
  /** Overlay div the intro fade drives via opacity (1 = covered, 0 = clear). */
  onFadeProgress?: (alpha01: number) => void;
  /**
   * Screen-space outline post pipeline (2 extra scene passes + a fullscreen
   * pass per frame). Off by default: at widget sizes the toon ramp carries
   * the look and the cost triples the render bill.
   */
  outline?: boolean;
  /** Runs the authored reaction showcase loop (DemoAnimationSequencer port). */
  demo?: boolean;
}

export interface AvatarSession {
  resize(width: number, height: number, pixelRatio: number): void;
  tick(dt: number): void;
  handleSignal(event: BridgeEvent): void;
  triggerReaction(trigger: string): void;
  setDemo(on: boolean): void;
  startIntro(): void;
  /** Camera zoom as 0..1 of the deepest closeup. */
  getZoom(): number;
  setZoom(fraction: number): void;
  dispose(): void;
}

function componentFields(pack: AvatarPack, type: string): Record<string, ScriptFieldValue> {
  const comps = pack.scripts?.components ?? [];
  const comp = comps.find((c) => c.type === type && c.nodePath.startsWith('scene:')) ?? comps.find((c) => c.type === type);
  return comp?.fields ?? {};
}

export async function createAvatarSession(
  canvas: HTMLCanvasElement,
  packUrl: string,
  options: AvatarSessionOptions = {},
): Promise<AvatarSession> {
  // No custom key: keeps loadPack's dev "<container>.key" sidecar fetch as
  // the default delivery path for .nxpack containers; plain pack dirs ignore it.
  // App-asset .nxpack/.key GETs are bearer-authed (image extensions are public
  // in PathAuthMiddleware, these are not), so every pack request carries the
  // dashboard token.
  const authedFetch: typeof fetch = async (input, init) => {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const tFetch = performance.now();
  const pack = await loadPack(packUrl, { fetchImpl: authedFetch });
  const tParsed = performance.now();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Two-band toon shading (TCP2 ramp + shadow tint) - lit, so the character
  // reads with volume against the flat-baked stage; the runtime also grounds
  // her with a contact shadow.
  TOON_TUNING.unlit = false;
  const runtime = new AvatarRuntime(pack, renderer);
  const outline = options.outline
    ? new OutlineEffect(renderer, runtime.scene, runtime.camera, outlineParamsFromScene(pack.scene?.outline))
    : null;
  const renderFrame = (): void => {
    if (outline) outline.render();
    else renderer.render(runtime.scene, runtime.camera);
  };

  // First render otherwise compiles every GPU program synchronously (~800ms
  // stall measured); compileAsync uses KHR_parallel_shader_compile so the
  // programs build in parallel while the composite's loading state is up, and
  // the warm-up frame compiles whatever the scene compile misses.
  // compileAsync polls WebGLProgram.isReady(), which reads COMPLETION_STATUS_KHR
  // from KHR_parallel_shader_compile. Without that extension the parameter is
  // undefined, getProgramParameter returns null, no program is ever "ready",
  // and the promise never settles - the Q60's Chromium 83 / PowerVR WebView hit
  // exactly this and sat on a blank canvas forever. Take the synchronous path
  // there (the ~800ms stall this avoids is a nicety, not a requirement), and
  // keep a timeout so a slow driver can still never strand the load.
  if (renderer.extensions.has('KHR_parallel_shader_compile')) {
    await Promise.race([
      renderer.compileAsync(runtime.scene, runtime.camera),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  } else {
    renderer.compile(runtime.scene, runtime.camera);
  }
  renderFrame();

  // Host policy, independent of the pack's own inspector-tuned fields: no
  // console spam in a shipped panel widget, and no autonomous demo tour after
  // the intro settles (the pinned contract has no "demo tour" concept - only
  // the one-shot intro and pointer orbit).
  const bridge = new NexusBridge(runtime.stateMachine, {
    ...bridgeOptionsFromFields(componentFields(pack, 'NexusBridge')),
    debug: false,
    emitAck: false,
  });
  // One camera mode: rest = whole character, framed tight (little headroom /
  // footroom); the mouse wheel rides the zoom curve down to a 3/4 face
  // closeup, its focus pulled most of the way onto the head bone
  // (zoomFocusTarget below, by zoomFocusLock).
  const camera = new CameraController(runtime.camera, pack.gltf.scene, canvas, {
    ...cameraOptionsFromFields(componentFields(pack, 'CameraController')),
    runDemoOnStart: false,
    aspectFraming: 0,
    baseDistance: 2.05,
    minDistance: 0.85,
    // Rest AT the closeup: the wheel's deepest framing (3/4 face, pivoting
    // on the head bone) is the neutral pose rather than the far end of a zoom.
    restZoomFraction: 1,
    zoomYawOffsetDeg: 15,
    zoomFocusHeightOffset: 0.06,
    // A partial lock keeps the head framed without pinning the camera to it.
    zoomFocusLock: 0.72,
    overshootDeg: 7,
    overshootReturn: 0.995,
  });
  // GLTFLoader strips dots from node names (PropertyBinding.sanitizeNodeName).
  camera.zoomFocusTarget =
    pack.gltf.scene.getObjectByName('DEF-spine006') ?? pack.gltf.scene.getObjectByName('DEF-spine.006') ?? null;
  const intro = new IntroSequence(runtime.stateMachine, runtime.springBones, {
    onFadeProgress: options.onFadeProgress,
  });
  // Constructed unconditionally; remote props stream in after mount, so the
  // showcase is a runtime toggle (setDemo) rather than a creation-time option.
  const demo = new DemoSequencer(runtime.stateMachine, {
    ...sequencerOptionsFromFields(componentFields(pack, 'DemoAnimationSequencer')),
    runSelfDrivenSequence: true,
  });
  if (options.demo) demo.start();

  // The composite only calls these while `session` state holds this exact
  // object, torn down in the same effect that disposes it - but that is an
  // ordering guarantee at the call site, not one this object enforces on its
  // own. Guard explicitly so a future caller that reads a stale reference
  // (a ref instead of the state value, say) fails silently instead of
  // touching a disposed renderer/GL context.
  let disposed = false;
  const tBuilt = performance.now();
  let firstFrameLogged = false;
  console.debug('[avatar] load: fetch+decrypt+parse', Math.round(tParsed - tFetch), 'ms; scene build', Math.round(tBuilt - tParsed), 'ms');

  // Live-debug handle, opt-in via localStorage so production stays clean:
  // localStorage.setItem('nexus_avatar_debug', '1') then reload.
  if (typeof window !== 'undefined' && window.localStorage?.getItem('nexus_avatar_debug') === '1') {
    interface DebugWindow { __nexusAvatarSessions?: unknown[] }
    ((window as unknown as DebugWindow).__nexusAvatarSessions ??= []).push({ runtime, outline, camera, pack });
  }

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      runtime.camera.aspect = width / Math.max(height, 1);
      runtime.camera.updateProjectionMatrix();
      outline?.setSize(width, height, pixelRatio);
    },
    getZoom() {
      return camera.getZoomFraction();
    },
    setZoom(fraction) {
      if (disposed) return;
      camera.setZoomFraction(fraction);
    },
    tick(dt) {
      if (disposed) return;
      const t0 = firstFrameLogged ? 0 : performance.now();
      runtime.update(dt);
      bridge.update(dt);
      intro.update(dt);
      demo.update(dt);
      camera.update(dt);
      renderFrame();
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        console.debug('[avatar] first frame (incl shader compile)', Math.round(performance.now() - t0), 'ms');
      }
    },
    handleSignal(event) {
      if (disposed) return;
      bridge.handleEvent(event);
    },
    triggerReaction(trigger) {
      if (disposed) return;
      runtime.stateMachine.trigger(trigger);
    },
    setDemo(on) {
      if (disposed) return;
      if (on) demo.start();
      else demo.stop();
    },
    startIntro() {
      if (disposed) return;
      intro.start();
      camera.startIntroPushIn();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      demo.stop();
      camera.dispose();
      bridge.dispose();
      outline?.dispose();
      runtime.dispose();
      renderer.dispose();
    },
  };
}
