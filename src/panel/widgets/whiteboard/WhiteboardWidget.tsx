import { useEffect, useRef, useState, useCallback } from 'react';
import { Trash2, Undo2, Eraser, Pen } from 'lucide-react';
import type { WidgetProps } from '../types';
import styles from './WhiteboardWidget.module.scss';

interface Point { x: number; y: number }
interface Stroke { color: string; width: number; points: Point[] }

const COLORS = ['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#000000'];
const SIZES = [2, 5, 10];

type Tool = 'pen' | 'eraser';

export function WhiteboardWidget({ widget }: WidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);

  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState('#ffffff');
  const [penSize, setPenSize] = useState(5);

  const bgColor = ((widget.config?.backgroundColor as string | undefined) ?? '#1a1a2e');

  // Redraw entire canvas from stroke history
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
    if (activeStrokeRef.current) {
      drawStroke(ctx, activeStrokeRef.current);
    }
  }, [bgColor]);

  // Resize canvas to fill container, respecting device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      redrawAll();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [redrawAll]);

  const getCanvasPoint = useCallback((e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    drawingRef.current = true;
    const pt = getCanvasPoint(e);
    const color = tool === 'eraser' ? bgColor : penColor;
    const width = tool === 'eraser' ? penSize * 4 : penSize;
    activeStrokeRef.current = { color, width, points: [pt] };
  }, [tool, penColor, penSize, bgColor, getCanvasPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawingRef.current || !activeStrokeRef.current) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);
    activeStrokeRef.current.points.push(pt);

    // Draw only the latest segment for performance
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const points = activeStrokeRef.current.points;
    if (points.length < 2) return;

    ctx.strokeStyle = activeStrokeRef.current.color;
    ctx.lineWidth = activeStrokeRef.current.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  }, [getCanvasPoint]);

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (activeStrokeRef.current) {
      strokesRef.current.push(activeStrokeRef.current);
      activeStrokeRef.current = null;
    }
  }, []);

  const handleUndo = useCallback(() => {
    strokesRef.current.pop();
    redrawAll();
  }, [redrawAll]);

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    redrawAll();
  }, [redrawAll]);

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className={styles.toolbar}>
        <button
          type="button"
          className={`${styles.toolBtn} ${tool === 'pen' ? styles.active : ''}`}
          onClick={() => setTool('pen')}
          aria-label="Pen"
        >
          <Pen size={16} />
        </button>
        <button
          type="button"
          className={`${styles.toolBtn} ${tool === 'eraser' ? styles.active : ''}`}
          onClick={() => setTool('eraser')}
          aria-label="Eraser"
        >
          <Eraser size={16} />
        </button>

        <span className={styles.divider} />

        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            className={`${styles.colorBtn} ${penColor === c ? styles.activeColor : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => { setPenColor(c); setTool('pen'); }}
            aria-label={`Color ${c}`}
          />
        ))}

        <span className={styles.divider} />

        {SIZES.map((s, i) => (
          <button
            key={s}
            type="button"
            className={`${styles.sizeBtn} ${penSize === s ? styles.activeSize : ''}`}
            onClick={() => setPenSize(s)}
            aria-label={`Pen size ${['thin', 'medium', 'thick'][i]}`}
          >
            <span className={styles.sizeDot} style={{ width: s + 4, height: s + 4 }} />
          </button>
        ))}

        <span className={styles.divider} />

        <button type="button" className={styles.toolBtn} onClick={handleUndo} aria-label="Undo">
          <Undo2 size={16} />
        </button>
        <button type="button" className={styles.toolBtn} onClick={handleClear} aria-label="Clear">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  if (stroke.points.length === 1) {
    // Single point - draw a dot
    ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
  }
  ctx.stroke();
}

export default WhiteboardWidget;
