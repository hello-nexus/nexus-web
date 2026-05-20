import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import type { LightingDevice, LedMapEntry } from '../../../api/lighting';
import { saveDeviceLayout } from '../../../api/lighting';
import type { AudioSnapshot } from '../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../hooks/useShaderRenderer';
import { useTranslation } from '../../../lib/i18n';
import type { EffectState } from '../../../types/lighting';
import styles from './DeviceCanvas.module.scss';

interface DeviceCanvasProps {
  devices: LightingDevice[];
  canvasPixels: Uint8Array | null;
  canvasW: number;
  canvasH: number;
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  shaderEffect?: string | null;
  shaderState?: EffectState | null;
  audioRef?: React.RefObject<AudioSnapshot | null>;
  /** Device ids whose rectangle outline should be hidden on the canvas. View-only flag -
   *  the device still samples its rect for lighting; only the visual overlay is skipped. */
  hiddenFrameIds?: Set<string>;
  /** Active (non-disabled) LEDs for the currently selected device, used to show position dots on the frame. */
  selectedDeviceLeds?: LedMapEntry[] | null;
  /** Called when the user clicks the settings button on a device frame. */
  onOpenSettings?: (id: string) => void;
  /** Notifies parent when a drag starts or ends, so it can pause state updates. */
  onDragActiveChange?: (active: boolean) => void;
}

const CW = 1000;
const CH = 600;
// Inset device rectangles from the canvas border so they don't sit flush
// against the edge when the window is maximized. Mirrors the small corner
// offset used by the fullscreen button on the canvas area.
const PAD = 12;

type DragMode = 'move' | 'resize-br';

const CanvasBackground = memo(function CanvasBackground({ canvasPixels, canvasW, canvasH }: {
  canvasPixels: Uint8Array | null; canvasW: number; canvasH: number;
}) {
  const bgRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    if (!canvasPixels || canvasW === 0 || canvasH === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, el.width, el.height);
      return;
    }
    if (el.width !== canvasW || el.height !== canvasH) { el.width = canvasW; el.height = canvasH; }
    const img = ctx.createImageData(canvasW, canvasH);
    const d = img.data;
    for (let i = 0; i < canvasW * canvasH; i++) {
      const s = i * 3, o = i * 4;
      d[o] = canvasPixels[s]; d[o+1] = canvasPixels[s+1]; d[o+2] = canvasPixels[s+2]; d[o+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [canvasPixels, canvasW, canvasH]);

  return <canvas ref={bgRef} className={styles.bgCanvas} />;
});

const DeviceOverlays = memo(function DeviceOverlays({ devices, selectedDeviceId, onSelectDevice, containerRef, selectedDeviceLeds, onOpenSettings, onDragActiveChange }: {
  devices: LightingDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedDeviceLeds?: LedMapEntry[] | null;
  onOpenSettings?: (id: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState<{
    id: string; mode: DragMode;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);
  const [, forceRender] = useState(0);
  const visualAngleRef = useRef<Map<string, number>>(new Map());
  const containerSizeRef = useRef({ w: 675, h: 380 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      containerSizeRef.current = { w: e.contentRect.width, h: e.contentRect.height };
      forceRender(n => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  selectedDeviceIdRef.current = selectedDeviceId;
  // Captures selection state at pointer-down so pointer-up can cycle through the stack
  // relative to what was selected before the tap, not after startDrag overwrites it.
  const tapRef = useRef<{ prevSelected: string | null; moved: boolean } | null>(null);

  const toCanvas = useCallback((cx: number, cy: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * CW, y: ((cy - r.top) / r.height) * CH };
  }, [containerRef]);

  const startDrag = useCallback((e: React.PointerEvent, dev: LightingDevice, mode: DragMode) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    tapRef.current = { prevSelected: selectedDeviceIdRef.current, moved: false };
    onSelectDevice(dev.id);
    onDragActiveChange?.(true);
    const p = toCanvas(e.clientX, e.clientY);
    setDrag({ id: dev.id, mode, startX: p.x, startY: p.y, origX: dev.canvasX, origY: dev.canvasY, origW: dev.canvasW, origH: dev.canvasH });
  }, [toCanvas, onSelectDevice, onDragActiveChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    const p = toCanvas(e.clientX, e.clientY);
    const dx = p.x - drag.startX, dy = p.y - drag.startY;
    if (tapRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      tapRef.current.moved = true;
    }
    const dev = devices.find(d => d.id === drag.id);
    if (!dev) return;
    if (drag.mode === 'move') {
      dev.canvasX = Math.max(PAD, Math.min(CW - PAD - dev.canvasW, drag.origX + dx));
      dev.canvasY = Math.max(PAD, Math.min(CH - PAD - dev.canvasH, drag.origY + dy));
    } else {
      dev.canvasW = Math.max(60, Math.min(CW - PAD - dev.canvasX, drag.origW + dx));
      dev.canvasH = Math.max(60, Math.min(CH - PAD - dev.canvasY, drag.origH + dy));
    }
    forceRender(n => n + 1);
  }, [drag, devices, toCanvas]);

  const handlePointerUp = useCallback(() => {
    if (!drag) return;
    const tap = tapRef.current;
    tapRef.current = null;
    const dev = devices.find(d => d.id === drag.id);
    if (dev) saveDeviceLayout(dev.id, dev.canvasX, dev.canvasY, dev.canvasW, dev.canvasH, dev.canvasRotation ?? 0);
    onDragActiveChange?.(false);
    setDrag(null);
    if (!tap || tap.moved) return;
    // Tap (no drag): cycle through the stack at the click position.
    // devices is ordered bottom-to-top (last = topmost DOM element), so reversing gives topmost-first.
    const stack = [...devices].reverse().filter(d =>
      drag.startX >= d.canvasX && drag.startX <= d.canvasX + d.canvasW &&
      drag.startY >= d.canvasY && drag.startY <= d.canvasY + d.canvasH
    );
    const idx = stack.findIndex(d => d.id === tap.prevSelected);
    if (idx === -1) return; // fresh selection: topmost already selected via startDrag
    if (idx === stack.length - 1) { onSelectDevice(null); return; } // bottom of stack: deselect
    onSelectDevice(stack[idx + 1].id); // step one level deeper
  }, [drag, devices, onSelectDevice, onDragActiveChange]);

  const handleRotate = useCallback((dev: LightingDevice) => {
    const prevVisual = visualAngleRef.current.get(dev.id) ?? (dev.canvasRotation ?? 0);
    const nextVisual = prevVisual + 90;
    visualAngleRef.current.set(dev.id, nextVisual);
    dev.canvasRotation = ((nextVisual % 360) + 360) % 360;
    saveDeviceLayout(dev.id, dev.canvasX, dev.canvasY, dev.canvasW, dev.canvasH, dev.canvasRotation);
    forceRender(n => n + 1);
  }, []);

  const handleMaximize = useCallback((dev: LightingDevice) => {
    const isMax = dev.canvasX <= PAD + 0.5 && dev.canvasY <= PAD + 0.5
      && dev.canvasX + dev.canvasW >= CW - PAD - 0.5
      && dev.canvasY + dev.canvasH >= CH - PAD - 0.5;
    if (isMax) {
      dev.canvasX = CW / 2 - 60;
      dev.canvasY = CH / 2 - 15;
      dev.canvasW = 120;
      dev.canvasH = 30;
    } else {
      dev.canvasX = PAD;
      dev.canvasY = PAD;
      dev.canvasW = CW - 2 * PAD;
      dev.canvasH = CH - 2 * PAD;
    }
    saveDeviceLayout(dev.id, dev.canvasX, dev.canvasY, dev.canvasW, dev.canvasH, dev.canvasRotation ?? 0);
    forceRender(n => n + 1);
  }, []);

  const handleOverlayPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === e.currentTarget) onSelectDevice(null);
  }, [onSelectDevice]);

  return (
    <div className={styles.overlayLayer}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      onPointerDown={handleOverlayPointerDown}>
      {devices.map(dev => {
        const selected = dev.id === selectedDeviceId;
        const visualAngle = visualAngleRef.current.get(dev.id) ?? (dev.canvasRotation ?? 0);
        const rot = ((dev.canvasRotation ?? 0) % 360 + 360) % 360;
        const { w, h } = containerSizeRef.current;
        const bgX = -(dev.canvasX / CW) * w;
        const bgY = -(dev.canvasY / CH) * h;
        return (
          <div key={dev.id}
            className={`${styles.device} ${drag?.id === dev.id ? styles.dragging : ''} ${selected ? styles.selected : ''}`}
            style={{
              left: `${(dev.canvasX / CW) * 100}%`, top: `${(dev.canvasY / CH) * 100}%`,
              width: `${(dev.canvasW / CW) * 100}%`, height: `${(dev.canvasH / CH) * 100}%`,
              backgroundPosition: `${bgX}px ${bgY}px`,
            }}
            onPointerDown={e => startDrag(e, dev, 'move')}>
            <span className={styles.deviceLabel} style={{ transform: `rotate(${visualAngle}deg)` }}>{dev.name}</span>
            {onOpenSettings && dev.ledCount > 0 && (
              <button type="button" className={styles.settingsBtn} title={t('lighting.ledMap.settings')} aria-label={t('lighting.ledMap.settings')}
                onClick={e => { e.stopPropagation(); onOpenSettings(dev.id); }}>
                <Settings size={11} />
              </button>
            )}
            <button type="button" className={styles.maximizeBtn} title={t('lighting.devices.maximize')} aria-label={t('lighting.devices.maximize')}
              onClick={e => { e.stopPropagation(); handleMaximize(dev); }}>□</button>
            <button type="button" className={styles.rotateBtn} title={t('lighting.devices.rotate')} aria-label={t('lighting.devices.rotate')}
              onClick={e => { e.stopPropagation(); handleRotate(dev); }}>⟳</button>
            <div className={styles.resizeHandle} onPointerDown={e => startDrag(e, dev, 'resize-br')} />
            {selected && selectedDeviceLeds && selectedDeviceLeds
              .filter(l => !l.disabled)
              .map(led => {
                let ur = led.u, vr = led.v;
                if (rot === 90)       { ur = 1 - led.v; vr = led.u; }
                else if (rot === 180) { ur = 1 - led.u; vr = 1 - led.v; }
                else if (rot === 270) { ur = led.v; vr = 1 - led.u; }
                return (
                  <div key={led.index} className={styles.ledDot} style={{ left: `${ur * 100}%`, top: `${vr * 100}%` }} />
                );
              })
            }
          </div>
        );
      })}
    </div>
  );
});

export function DeviceCanvas({ devices, canvasPixels, canvasW, canvasH, selectedDeviceId, onSelectDevice, shaderEffect, shaderState, audioRef, hiddenFrameIds, selectedDeviceLeds, onOpenSettings, onDragActiveChange }: DeviceCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const shaderStateRef = useRef(shaderState ?? null);
  shaderStateRef.current = shaderState ?? null;
  const { ready } = useShaderRenderer(glCanvasRef, shaderEffect ?? null, shaderStateRef, audioRef);
  const visibleDevices = hiddenFrameIds && hiddenFrameIds.size > 0
    ? devices.filter(d => !hiddenFrameIds.has(d.id))
    : devices;
  return (
    <div ref={containerRef} className={styles.canvas}>
      <CanvasBackground canvasPixels={canvasPixels} canvasW={canvasW} canvasH={canvasH} />
      <canvas ref={glCanvasRef} className={`${styles.glCanvas} ${ready ? styles.glCanvasReady : ''}`} />
      <DeviceOverlays devices={visibleDevices} selectedDeviceId={selectedDeviceId} onSelectDevice={onSelectDevice} containerRef={containerRef} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={onOpenSettings} onDragActiveChange={onDragActiveChange} />
    </div>
  );
}
