import { useEffect, useRef, useState } from 'react';
import { fetchShaderSource } from '../api/lighting';
import type { EffectState } from '../types/lighting';
import type { AudioSnapshot } from './useAudioState';

const QUAD_VERT = `#version 300 es
layout (location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function adaptGlsl(source: string): string {
  return source.replace('#version 330 core', '#version 300 es\nprecision highp float;');
}

export function useShaderRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  effect: string | null,
  stateRef: React.RefObject<EffectState | null>,
  audioRef?: React.RefObject<AudioSnapshot | null>,
  options?: { maxDevicePixelRatio?: number },
  // When true, u_time is held at the value it had the instant this flipped
  // true, so the preview freezes on the same frame the server-side lighting
  // engine freezes at instead of blanking or drifting.
  paused = false,
): { ready: boolean; loading: boolean; error: string | null } {
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const rafRef = useRef(0);
  // Bumped on every effect re-run. The RAF callback captures the epoch at
  // schedule time; if the effect re-runs while a frame is in flight, the
  // outgoing callback sees epoch !== epochRef.current and bails before
  // re-queueing, so we never end up with two render loops running
  // concurrently against the same GL context.
  const epochRef = useRef(0);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const compiledRef = useRef<string | null>(null);
  // Beat Builder peak-holds and history ring (reused across frames).
  const levelPeakRef = useRef(0);
  const bassPeakRef = useRef(0);
  const midPeakRef = useRef(0);
  const highPeakRef = useRef(0);
  // 16-band × 16-frame history; index = frame*16 + band, frame 0 = newest.
  const histRingRef = useRef(new Float32Array(256));
  const lastSnapshotRef = useRef<AudioSnapshot | null>(null);
  // Latest-ref pattern (mirrors the caller's shaderStateRef): updated every
  // render rather than in an effect, so toggling pause never re-triggers
  // shader fetch/compile in the effect below.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Non-null while paused: the u_time value frozen at the moment pause
  // engaged. Cleared on resume so time picks back up from Date.now().
  const frozenTimeRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) { setError('WebGL2 not supported'); return; }
    glRef.current = gl;

    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    vaoRef.current = vao;

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (programRef.current) gl.deleteProgram(programRef.current);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(buf);
      glRef.current = null;
      programRef.current = null;
      compiledRef.current = null;
      setReady(false);
    };
  }, [canvasRef]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !effect) {
      cancelAnimationFrame(rafRef.current);
      // Reset flags when the effect (or GL ctx) is torn down.
      setReady(false);
      setLoading(false);
      setError(null);
      compiledRef.current = null;
      return;
    }
    if (compiledRef.current === effect) return;

    setReady(false);
    setLoading(true);
    setError(null);
    cancelAnimationFrame(rafRef.current);
    const myEpoch = ++epochRef.current;

    fetchShaderSource(effect).then(src => {
      // If the effect changed (or the parent unmounted GL) while the fetch was
      // in flight, abandon this resolution entirely. Otherwise the post-fetch
      // block would compile a stale shader, overwrite programRef with it, and
      // poison the next live RAF tick.
      if (epochRef.current !== myEpoch) return;
      if (!src) { setError('Failed to fetch shader'); setLoading(false); return; }
      if (programRef.current) { gl.deleteProgram(programRef.current); programRef.current = null; }

      const vs = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vs, QUAD_VERT);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        setError(`vertex: ${gl.getShaderInfoLog(vs)}`);
        gl.deleteShader(vs); setLoading(false); return;
      }
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fs, adaptGlsl(src.frag));
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        setError(`fragment: ${gl.getShaderInfoLog(fs)}`);
        gl.deleteShader(vs); gl.deleteShader(fs); setLoading(false); return;
      }
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        setError(`link: ${gl.getProgramInfoLog(prog)}`);
        gl.deleteProgram(prog); setLoading(false); return;
      }
      programRef.current = prog;
      compiledRef.current = effect;

      const names = [
        'u_resolution', 'u_time', 'u_speed', 'u_intensity',
        'u_hue', 'u_colorize', 'u_saturation', 'u_contrast',
        'u_audioLevel', 'u_audioBass', 'u_audioMid', 'u_audioHigh',
        'u_audioBeat', 'u_audioBoost', 'u_spectrum',
        'u_spectrum64', 'u_specHist',
        'u_levelPeak', 'u_bassPeak', 'u_midPeak', 'u_highPeak',
      ];
      const cache: Record<string, WebGLUniformLocation | null> = {};
      for (const n of names) cache[n] = gl.getUniformLocation(prog, n);
      const s = stateRef.current;
      if (s?.params) {
        for (const key of Object.keys(s.params)) cache[key] = gl.getUniformLocation(prog, key);
      }
      uniformsRef.current = cache;

      setLoading(false);

      let firstFrame = true;

      const render = () => {
        if (epochRef.current !== myEpoch) return;
        if (!glRef.current || !programRef.current) return;
        const g = glRef.current;
        const c = canvasRef.current!;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const maxDevicePixelRatio = options?.maxDevicePixelRatio ?? devicePixelRatio;
        const dpr = Math.min(devicePixelRatio, maxDevicePixelRatio);
        const w = c.clientWidth * dpr;
        const h = c.clientHeight * dpr;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }

        g.viewport(0, 0, w, h);
        g.disable(g.DEPTH_TEST);
        g.disable(g.CULL_FACE);
        g.disable(g.BLEND);

        g.useProgram(programRef.current);
        const u = uniformsRef.current;
        const st = stateRef.current;
        if (!st) { rafRef.current = requestAnimationFrame(render); return; }
        let t: number;
        if (pausedRef.current) {
          frozenTimeRef.current ??= (Date.now() % 86_400_000) / 1000;
          t = frozenTimeRef.current;
        } else {
          frozenTimeRef.current = null;
          t = (Date.now() % 86_400_000) / 1000;
        }

        if (u.u_resolution) g.uniform2f(u.u_resolution, w, h);
        if (u.u_time) g.uniform1f(u.u_time, t);
        if (u.u_speed) g.uniform1f(u.u_speed, st.speed / 50);
        if (u.u_intensity) g.uniform1f(u.u_intensity, st.intensity);
        if (u.u_hue) g.uniform1f(u.u_hue, st.hue);
        if (u.u_colorize) g.uniform1f(u.u_colorize, st.colorize);
        if (u.u_saturation) g.uniform1f(u.u_saturation, st.saturation);
        if (u.u_contrast) g.uniform1f(u.u_contrast, st.contrast);

        const audio = audioRef?.current;

        if (audio !== lastSnapshotRef.current) {
          lastSnapshotRef.current = audio ?? null;
          if (audio) {
            levelPeakRef.current = Math.max(levelPeakRef.current * 0.90, audio.level);
            bassPeakRef.current  = Math.max(bassPeakRef.current  * 0.90, audio.bass);
            midPeakRef.current   = Math.max(midPeakRef.current   * 0.90, audio.mid);
            highPeakRef.current  = Math.max(highPeakRef.current  * 0.90, audio.high);
            histRingRef.current.copyWithin(16, 0, 240);
            const sp = audio.spectrum;
            for (let i = 0; i < 16; i++) histRingRef.current[i] = sp[i] ?? 0;
          } else {
            levelPeakRef.current = 0;
            bassPeakRef.current  = 0;
            midPeakRef.current   = 0;
            highPeakRef.current  = 0;
            histRingRef.current.fill(0);
          }
        }

        if (u.u_audioLevel) g.uniform1f(u.u_audioLevel, audio?.level ?? 0);
        if (u.u_audioBass) g.uniform1f(u.u_audioBass, audio?.bass ?? 0);
        if (u.u_audioMid) g.uniform1f(u.u_audioMid, audio?.mid ?? 0);
        if (u.u_audioHigh) g.uniform1f(u.u_audioHigh, audio?.high ?? 0);
        if (u.u_audioBeat) g.uniform1f(u.u_audioBeat, audio?.beat ?? 0);
        if (u.u_audioBoost) g.uniform1f(u.u_audioBoost, audio ? (st.params?.u_audioBoost ?? 1) : 0);
        if (u.u_spectrum) g.uniform1fv(u.u_spectrum, audio?.spectrum ?? new Float32Array(16));
        if (u.u_spectrum64) g.uniform1fv(u.u_spectrum64, audio?.spectrum64 ?? new Float32Array(64));
        if (u.u_specHist) g.uniform4fv(u.u_specHist, histRingRef.current);
        if (u.u_levelPeak) g.uniform1f(u.u_levelPeak, levelPeakRef.current);
        if (u.u_bassPeak)  g.uniform1f(u.u_bassPeak,  bassPeakRef.current);
        if (u.u_midPeak)   g.uniform1f(u.u_midPeak,   midPeakRef.current);
        if (u.u_highPeak)  g.uniform1f(u.u_highPeak,  highPeakRef.current);

        if (st.params) {
          for (const [key, val] of Object.entries(st.params)) {
            let loc = u[key];
            if (loc === undefined) {
              loc = g.getUniformLocation(programRef.current, key);
              u[key] = loc;
            }
            if (loc) g.uniform1f(loc, val);
          }
        }

        g.bindVertexArray(vaoRef.current);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

        if (firstFrame) { firstFrame = false; setReady(true); }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
    });
  }, [effect, canvasRef, stateRef, options?.maxDevicePixelRatio, audioRef]);

  return { ready, loading, error };
}
