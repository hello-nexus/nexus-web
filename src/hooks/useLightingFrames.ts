import { useEffect, useRef, useState } from 'react';
import { lightingOutputUrl } from '../api/lighting';

export interface LightingFrameState {
  deviceColors: Map<number, string[]>;
  canvasPixels: Uint8Array | null;
  canvasW: number;
  canvasH: number;
  framesReceived: number;
  connected: boolean;
}

const EMPTY: LightingFrameState = { deviceColors: new Map(), canvasPixels: null, canvasW: 0, canvasH: 0, framesReceived: 0, connected: false };

export function useLightingFrames(enabled = true): LightingFrameState {
  const [state, setState] = useState<LightingFrameState>(EMPTY);
  const latest = useRef<{ deviceColors: Map<number, string[]>; canvasPixels: Uint8Array | null; canvasW: number; canvasH: number; frames: number }>(
    { deviceColors: new Map(), canvasPixels: null, canvasW: 0, canvasH: 0, frames: 0 }
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Gated off (e.g. when connected via relay — the binary output stream is
    // too much bandwidth to forward). Stay on the empty state so consumers fall
    // back to a static preview.
    if (!enabled) { setState(EMPTY); return undefined; }
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled) return;
      setState(prev => {
        const l = latest.current;
        if (l.frames === prev.framesReceived) return prev;
        return { deviceColors: l.deviceColors, canvasPixels: l.canvasPixels, canvasW: l.canvasW, canvasH: l.canvasH, framesReceived: l.frames, connected: true };
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    const connect = async () => {
      const url = await lightingOutputUrl();
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => { if (!cancelled) { setState(p => ({ ...p, connected: true })); rafRef.current = requestAnimationFrame(tick); } };
      socket.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const bytes = new Uint8Array(event.data);
        const parsed = parseFrame(bytes);
        // Mutate the ref in place instead of allocating a wrapper object every
        // frame -- at 30 fps this halves the onmessage allocation count.
        const l = latest.current;
        l.deviceColors = parsed.deviceColors;
        l.canvasPixels = parsed.canvasPixels;
        l.canvasW = parsed.canvasW;
        l.canvasH = parsed.canvasH;
        l.frames++;
      };
      socket.onclose = () => { if (!cancelled) { setState(p => ({ ...p, connected: false })); if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } reconnectTimer = setTimeout(connect, 2000); } };
      socket.onerror = () => { try { socket?.close(); } catch { /* socket already closed/torn down */ } };
    };

    connect();
    return () => { cancelled = true; try { socket?.close(); } catch { /* socket already closed/torn down */ } if (reconnectTimer !== null) clearTimeout(reconnectTimer); if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [enabled]);

  return state;
}

function parseFrame(bytes: Uint8Array): { deviceColors: Map<number, string[]>; canvasPixels: Uint8Array | null; canvasW: number; canvasH: number } {
  const map = new Map<number, string[]>();

  if (bytes.length >= 5 && bytes[0] === 0x03) {
    // v3: canvas pixels + per-device data
    let pos = 1;
    const canvasW = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const canvasH = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const canvasSize = canvasW * canvasH * 3;
    // subarray is a zero-copy view over the WS ArrayBuffer (which is already a
    // fresh allocation per message). slice() would copy ~43 KB per frame at
    // 30 fps on top of that; the consumer only reads the pixels, never mutates.
    const canvasPixels = bytes.subarray(pos, pos + canvasSize);
    pos += canvasSize;

    if (pos < bytes.length) {
      const deviceCount = bytes[pos++];
      for (let d = 0; d < deviceCount && pos + 3 <= bytes.length; d++) {
        const deviceIndex = bytes[pos++];
        const ledCount = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
        const colors: string[] = [];
        for (let i = 0; i < ledCount && pos + 2 < bytes.length; i++) {
          colors.push(`rgb(${bytes[pos]},${bytes[pos + 1]},${bytes[pos + 2]})`);
          pos += 3;
        }
        map.set(deviceIndex, colors);
      }
    }

    return { deviceColors: map, canvasPixels, canvasW, canvasH };
  }

  if (bytes.length >= 2 && bytes[0] === 0x02) {
    // v2 fallback
    let pos = 2;
    const deviceCount = bytes[1];
    for (let d = 0; d < deviceCount && pos + 3 <= bytes.length; d++) {
      const deviceIndex = bytes[pos++];
      const ledCount = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
      const colors: string[] = [];
      for (let i = 0; i < ledCount && pos + 2 < bytes.length; i++) {
        colors.push(`rgb(${bytes[pos]},${bytes[pos + 1]},${bytes[pos + 2]})`);
        pos += 3;
      }
      map.set(deviceIndex, colors);
    }
  }

  return { deviceColors: map, canvasPixels: null, canvasW: 0, canvasH: 0 };
}
