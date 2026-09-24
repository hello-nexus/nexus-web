import { useEffect, useState } from 'react';
import { lightingOutputUrl } from '../api/lighting';
import { publishLedFrame, clearLedFrame } from '../lib/ledFrameStore';

export interface LightingFrameState {
  connected: boolean;
  /** At least one frame carrying canvas pixels arrived on this connection. */
  live: boolean;
}

const EMPTY: LightingFrameState = { connected: false, live: false };

/** Keeps the lighting output socket open; frames go to ledFrameStore, not React state. */
export function useLightingFrames(enabled = true): LightingFrameState {
  const [state, setState] = useState<LightingFrameState>(EMPTY);

  useEffect(() => {
    // Gated off (e.g. when connected via relay - the binary output stream is
    // too much bandwidth to forward). Stay on the empty state so consumers fall
    // back to a static preview.
    if (!enabled) { setState(EMPTY); clearLedFrame(); return undefined; }
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let live = false;

    const connect = async () => {
      const url = await lightingOutputUrl();
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => { if (!cancelled) setState(p => (p.connected ? p : { ...p, connected: true })); };
      socket.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const parsed = parseFrame(new Uint8Array(event.data));
        publishLedFrame(parsed.canvasPixels, parsed.canvasW, parsed.canvasH);
        const nowLive = !!parsed.canvasPixels && parsed.canvasW > 0;
        if (nowLive !== live && !cancelled) {
          live = nowLive;
          setState({ connected: true, live });
        }
      };
      socket.onclose = () => { if (!cancelled) { live = false; setState(EMPTY); clearLedFrame(); reconnectTimer = setTimeout(connect, 2000); } };
      socket.onerror = () => { try { socket?.close(); } catch { /* socket already closed/torn down */ } };
    };

    connect();
    // clearLedFrame here as well as in onclose: cancelled short-circuits that
    // handler, so without this the last frame stays in the module-scope store
    // and every card that subscribes afterwards paints it, frozen, forever.
    return () => { cancelled = true; try { socket?.close(); } catch { /* socket already closed/torn down */ } if (reconnectTimer !== null) clearTimeout(reconnectTimer); clearLedFrame(); };
  }, [enabled]);

  return state;
}

function parseFrame(bytes: Uint8Array): { canvasPixels: Uint8Array | null; canvasW: number; canvasH: number } {
  // v3: canvas pixels, then per-device data (unused here - device cards sample
  // the canvas). v2 frames carry no canvas.
  if (bytes.length >= 5 && bytes[0] === 0x03) {
    const canvasW = bytes[1] | (bytes[2] << 8);
    const canvasH = bytes[3] | (bytes[4] << 8);
    // subarray is a zero-copy view over the WS ArrayBuffer (which is already a
    // fresh allocation per message). slice() would copy ~43 KB per frame at
    // 30 fps on top of that; the consumer only reads the pixels, never mutates.
    const canvasPixels = bytes.subarray(5, 5 + canvasW * canvasH * 3);
    return { canvasPixels, canvasW, canvasH };
  }
  return { canvasPixels: null, canvasW: 0, canvasH: 0 };
}
