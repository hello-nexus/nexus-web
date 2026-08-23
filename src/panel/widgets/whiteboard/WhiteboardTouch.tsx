import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Circle,
  CircleDashed,
  Download,
  Eraser,
  Maximize2,
  Moon,
  Pen,
  Redo2,
  Sun,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../../components/common/Button/Button';
import { Popover } from '../../../components/common/Popover/Popover';
import { Slider } from '../../../components/common/Slider/Slider';
import { HsvPicker } from '../../../components/common/HsvPicker/HsvPicker';
import { ColorPickerWithPresets } from '../../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { uploadTransferItems } from '../../../api/transfer';
import { useImmersiveExit } from '../../overlays/immersiveExit';
import { useWhiteboardBoard } from './useWhiteboardBoard';
import { WhiteboardSurface, type WhiteboardSurfaceHandle } from './WhiteboardSurface';
import { BACKGROUND_CSS, rasterizeBoard } from './whiteboardRender';
import { fitView } from './whiteboardGeometry';
import type { WhiteboardBackground, WhiteboardTool } from './whiteboardTypes';
import type { WidgetProps } from '../types';
import styles from './WhiteboardTouch.module.scss';

const PEN_PRESETS = [
  '#ffffff', '#111111', '#ef4444', '#f97316',
  '#fbbf24', '#22c55e', '#38bdf8', '#a855f7',
] as const;

const MIN_PEN = 1;
const MAX_PEN = 60;
const MIN_ERASER = 8;
const MAX_ERASER = 160;

// Order the background control cycles through.
const BACKGROUNDS: WhiteboardBackground[] = ['dark', 'light', 'transparent'];
const BACKGROUND_ICON = { dark: Moon, light: Sun, transparent: CircleDashed } as const;

const SAVE_FEEDBACK_MS = 2600;

// Hoisted so the technical enum value is not read as display text by the
// no-literal-string lint rule.
const SLIDER_ORIENTATION = 'stacked' as const;

// The toolbar sits at the BOTTOM (the top edge is the overlay's
// swipe-to-dismiss zone), so its popovers have to open upward.
const POPOVER_PLACEMENT = 'top-start' as const;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Fullscreen whiteboard. Draw with one finger, pinch with two to zoom and pan
 * an unbounded canvas. Works in either orientation - ink lives in canvas space,
 * so a rotation only changes which part of the board is on screen.
 */
export function WhiteboardTouch({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const board = useWhiteboardBoard(widget.id);
  const exitImmersive = useImmersiveExit();
  const surfaceRef = useRef<WhiteboardSurfaceHandle>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);

  const [tool, setTool] = useState<WhiteboardTool>('pen');
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const colorAnchorRef = useRef<HTMLDivElement>(null);
  const sizeAnchorRef = useRef<HTMLDivElement>(null);

  const { board: data, setView, setPenColor, setPenWidth, setEraserWidth, setBackground } = board;
  const activeWidth = tool === 'eraser' ? data.eraserWidth : data.penWidth;

  const formatZoom = useCallback((scale: number) => `${Math.round(scale * 100)}%`, []);

  // Pinch drives the readout imperatively: routing 60 frames a second through
  // React state would re-render the whole toolbar mid-gesture.
  const handleViewFrame = useCallback((view: { scale: number }) => {
    const node = zoomLabelRef.current;
    if (node) node.textContent = formatZoom(view.scale);
  }, [formatZoom]);

  const handleFit = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const next = fitView(data.strokes, rect.width, rect.height, 24);
    setView(next);
    handleViewFrame(next);
  }, [data.strokes, setView, handleViewFrame]);

  const handleWidthChange = useCallback((value: number) => {
    if (tool === 'eraser') setEraserWidth(value);
    else setPenWidth(value);
  }, [tool, setEraserWidth, setPenWidth]);

  const handleColorPick = useCallback((hex: string) => {
    setPenColor(hex);
    // Picking a colour is an implicit "I want to draw" - staying on the eraser
    // after choosing one would silently swallow the next stroke.
    setTool('pen');
  }, [setPenColor]);

  const handleBackgroundCycle = useCallback(() => {
    const index = BACKGROUNDS.indexOf(data.background);
    setBackground(BACKGROUNDS[(index + 1) % BACKGROUNDS.length]);
  }, [data.background, setBackground]);

  const handleSave = useCallback(async () => {
    const host = hostRef.current;
    if (!host || data.strokes.length === 0) return;
    setSaveState('saving');

    const rect = host.getBoundingClientRect();
    // Export the whole drawing, not the current viewport - what is on screen at
    // 8x zoom is rarely what the user means by "save this board".
    const view = fitView(data.strokes, rect.width, rect.height, 24);
    const dataUrl = rasterizeBoard(data.strokes, view, rect.width, rect.height, data.background);
    if (!dataUrl) {
      setSaveState('error');
      return;
    }

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = new File([blob], `whiteboard-${stamp}.png`, { type: 'image/png' });
      const resp = await uploadTransferItems([file]);
      setSaveState(resp && !resp.error && resp.saved.length > 0 ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, [data.strokes, data.background]);

  useEffect(() => {
    if (saveState !== 'saved' && saveState !== 'error') return;
    const timer = setTimeout(() => setSaveState('idle'), SAVE_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [saveState]);

  // Keep the readout truthful after a non-gesture view change (fit, restore).
  useEffect(() => {
    handleViewFrame(data.view);
  }, [data.view, handleViewFrame]);

  const BackgroundIcon = BACKGROUND_ICON[data.background];
  const saveIcon = saveState === 'saved' ? <Check /> : <Download />;

  return (
    <div className={styles.root}>
      <div
        ref={hostRef}
        className={styles.stage}
        data-bg={data.background}
        style={{ background: BACKGROUND_CSS[data.background] }}
      >
        <WhiteboardSurface
          ref={surfaceRef}
          strokes={data.strokes}
          view={data.view}
          interactive
          tool={tool}
          penColor={data.penColor}
          penWidth={data.penWidth}
          eraserWidth={data.eraserWidth}
          onCommitStroke={board.commitStroke}
          onViewChange={setView}
          onViewFrame={handleViewFrame}
          ariaLabel={t('panel.widget.whiteboard.boardLabel')}
        />
      </div>

      <div className={styles.toolbar} data-panel-no-sheet-swipe="true">
        <div className={styles.group}>
          <Button
            className={styles.tool}
            tone={tool === 'pen' ? 'accent' : 'neutral'}
            icon={<Pen />}
            aria-pressed={tool === 'pen'}
            aria-label={t('panel.widget.whiteboard.pen')}
            title={t('panel.widget.whiteboard.pen')}
            onClick={() => setTool('pen')}
          />
          <Button
            className={styles.tool}
            tone={tool === 'eraser' ? 'accent' : 'neutral'}
            icon={<Eraser />}
            aria-pressed={tool === 'eraser'}
            aria-label={t('panel.widget.whiteboard.eraser')}
            title={t('panel.widget.whiteboard.eraser')}
            onClick={() => setTool('eraser')}
          />
        </div>

        <div className={styles.group}>
          <div ref={colorAnchorRef} className={styles.anchor}>
            <Button
              className={styles.tool}
              tone="neutral"
              icon={<Circle fill={data.penColor} color={data.penColor} />}
              aria-label={t('panel.widget.whiteboard.color')}
              title={t('panel.widget.whiteboard.color')}
              onClick={() => { setColorOpen(o => !o); setSizeOpen(false); }}
            />
            <Popover
              open={colorOpen}
              onClose={() => setColorOpen(false)}
              anchorRef={colorAnchorRef}
              placement={POPOVER_PLACEMENT}
              className={styles.popover}
              ariaLabel={t('panel.widget.whiteboard.color')}
            >
              <ColorPickerWithPresets
                value={data.penColor}
                presets={PEN_PRESETS}
                onCommit={handleColorPick}
              />
              <HsvPicker
                value={data.penColor}
                onPreview={handleColorPick}
                onCommit={handleColorPick}
              />
            </Popover>
          </div>

          <div ref={sizeAnchorRef} className={styles.anchor}>
            <Button
              className={styles.tool}
              tone="neutral"
              icon={
                <span
                  className={styles.sizeDot}
                  style={{ width: Math.min(activeWidth, 18), height: Math.min(activeWidth, 18) }}
                />
              }
              aria-label={t('panel.widget.whiteboard.size')}
              title={t('panel.widget.whiteboard.size')}
              onClick={() => { setSizeOpen(o => !o); setColorOpen(false); }}
            />
            <Popover
              open={sizeOpen}
              onClose={() => setSizeOpen(false)}
              anchorRef={sizeAnchorRef}
              placement={POPOVER_PLACEMENT}
              className={styles.popover}
              ariaLabel={t('panel.widget.whiteboard.size')}
            >
              <Slider
                orientation={SLIDER_ORIENTATION}
                editable
                trackFill
                label={t(tool === 'eraser' ? 'panel.widget.whiteboard.eraser' : 'panel.widget.whiteboard.pen')}
                value={activeWidth}
                min={tool === 'eraser' ? MIN_ERASER : MIN_PEN}
                max={tool === 'eraser' ? MAX_ERASER : MAX_PEN}
                step={1}
                onChange={handleWidthChange}
                ariaLabel={t('panel.widget.whiteboard.size')}
              />
            </Popover>
          </div>
        </div>

        <div className={styles.group}>
          <Button
            className={styles.tool}
            tone="neutral"
            icon={<Undo2 />}
            disabled={!board.canUndo}
            aria-label={t('panel.widget.whiteboard.undo')}
            title={t('panel.widget.whiteboard.undo')}
            onClick={board.undo}
          />
          <Button
            className={styles.tool}
            tone="neutral"
            icon={<Redo2 />}
            disabled={!board.canRedo}
            aria-label={t('panel.widget.whiteboard.redo')}
            title={t('panel.widget.whiteboard.redo')}
            onClick={board.redo}
          />
          <Button
            className={styles.tool}
            tone="neutral"
            icon={<Trash2 />}
            disabled={data.strokes.length === 0}
            aria-label={t('panel.widget.whiteboard.clear')}
            title={t('panel.widget.whiteboard.clear')}
            onClick={board.clear}
          />
        </div>

        <div className={styles.group}>
          <Button
            className={styles.tool}
            tone="neutral"
            icon={<BackgroundIcon />}
            aria-label={t('panel.widget.whiteboard.background')}
            title={t(`panel.widget.whiteboard.background.${data.background}`)}
            onClick={handleBackgroundCycle}
          />
          <Button
            className={styles.tool}
            tone="neutral"
            icon={<Maximize2 />}
            aria-label={t('panel.widget.whiteboard.fit')}
            title={t('panel.widget.whiteboard.fit')}
            onClick={handleFit}
          />
          <span className={styles.zoom} ref={zoomLabelRef}>{formatZoom(data.view.scale)}</span>
        </div>

        <div className={styles.group}>
          <Button
            className={styles.tool}
            tone={saveState === 'saved' ? 'accent' : 'neutral'}
            icon={saveIcon}
            loading={saveState === 'saving'}
            disabled={data.strokes.length === 0}
            aria-label={t('panel.widget.whiteboard.save')}
            title={t('panel.widget.whiteboard.save')}
            onClick={handleSave}
          />
        </div>

        {/* The overlay's own close notch sits at the top and fades out; a
            drawing surface needs a close that is always visible and nowhere
            near the ink. Absent when rendered outside the immersive overlay. */}
        {exitImmersive && (
          <div className={styles.group}>
            <Button
              className={styles.tool}
              tone="neutral"
              icon={<X />}
              aria-label={t('panel.widget.whiteboard.close')}
              title={t('panel.widget.whiteboard.close')}
              onClick={exitImmersive}
            />
          </div>
        )}
      </div>

      {(saveState === 'saved' || saveState === 'error') && (
        <div className={styles.toast} role="status" data-tone={saveState}>
          {t(saveState === 'saved'
            ? 'panel.widget.whiteboard.saveOk'
            : 'panel.widget.whiteboard.saveFailed')}
        </div>
      )}
    </div>
  );
}
