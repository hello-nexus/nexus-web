// Paints one Stream Deck key bitmap on an offscreen canvas using the same
// visual language as the on-screen DeckGrid cell (category/custom color
// background, Lucide/emoji/app icon, label), then applies the model's wire
// transform and encodes to its wire format. jsdom can't rasterize canvas, so
// this stays thin and untested at the unit level - the pure parts it calls
// (deckKeyTransform, encodeBmp) carry the coverage.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchServiceBlob } from '../../../api/service';
import { fetchDeckImage } from '../../../api/deckImages';
import { DECK_ICONS, autoIconName, deckCategory, categoryColor } from './deckIcons';
import { applyKeyTransform, applyOrientation, type DeckKeyTransform, type DeckOrientation } from './deckKeyTransform';
import { encodeBmp } from './encodeBmp';
import { resolveDeckTitleStyle, type ResolvedDeckTitleStyle } from './deckTitleStyle';
import { coverFitRect } from './coverFitRect';
import type { DeckSlot } from './types';
import type { StreamDeckFormat } from '../../../api/streamdeck';

export interface DeckKeyModel {
  keyPixels: number;
  format: StreamDeckFormat;
  transform: DeckKeyTransform;
  /** User mounting rotation; defaults to 0 (upright) when absent. */
  orientation?: DeckOrientation;
}

const JPEG_QUALITY = 0.9;
const ICON_FRACTION = 0.62;
const BACK_KEY_COLOR = '#23262e';

/** Go-up-a-level glyph for the Back key, shared by the hardware bitmap and DeckGrid's reserved back cell. */
export const DECK_BACK_KEY_ICON = 'Undo2';

/**
 * The single per-deck Back-key bitmap uploaded to the reserved slotPath
 * "back" (state 0): the service pushes it to physical key 0 whenever a
 * folder view is active. Rendered through the same pipeline as any other
 * key via a synthetic slot, so it stays visually identical to the widget's
 * folder-back affordance.
 */
export function renderDeckBackKeyBitmap(model: DeckKeyModel): Promise<Uint8Array> {
  const backSlot: DeckSlot = { icon: { kind: 'lucide', value: DECK_BACK_KEY_ICON }, color: BACK_KEY_COLOR };
  return renderDeckKeyBitmap(backSlot, model);
}

export async function renderDeckKeyBitmap(slot: DeckSlot, model: DeckKeyModel): Promise<Uint8Array> {
  const size = model.keyPixels;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  await paintKey(ctx, size, slot);

  const raw = ctx.getImageData(0, 0, size, size);
  const oriented = applyOrientation({ width: size, height: size, data: raw.data }, model.orientation ?? 0);
  const transformed = applyKeyTransform(oriented, model.transform);

  if (model.format === 'bmp') return encodeBmp(transformed);
  return encodeJpeg(transformed);
}

async function paintKey(ctx: CanvasRenderingContext2D, size: number, slot: DeckSlot): Promise<void> {
  const isFolder = !!slot.folder;
  // An unassigned key (no action, folder, icon, or color) renders off (black),
  // matching the deck's own firmware, instead of the category-default fill.
  const isBlankOff = !slot.action && !slot.folder && !slot.icon && !slot.color;
  const accent = isBlankOff ? '#000000' : (slot.color ?? categoryColor(isFolder ? 'folder' : deckCategory(slot.action)));
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, size, size);

  if (!shouldPaintIcon(slot)) return;

  // The icon always fills the whole key - the label overlays on top instead
  // of sharing the canvas with it, mirroring DeckGrid's on-screen cell.
  await paintIcon(ctx, slot, isFolder, size);

  const titleStyle = resolveDeckTitleStyle(slot.title);
  if (slot.label && titleStyle.show) paintLabel(ctx, slot.label, size, titleStyle);
}

/**
 * Whether a key gets any content at all (icon or label). Mirrors DeckGrid's
 * blank-empty-cell rule (StaticCell's `empty && !selectable` branch): a slot
 * with no action, no folder, and no explicit icon renders background-only
 * on hardware - including its label, since the grid's run-mode empty cell
 * never shows one either. The editor's clickable '+' placeholder is an
 * edit-mode affordance only and must not appear in the uploaded bitmap.
 */
export function shouldPaintIcon(slot: DeckSlot): boolean {
  return !!(slot.action || slot.folder || slot.icon);
}

async function paintIcon(
  ctx: CanvasRenderingContext2D, slot: DeckSlot, isFolder: boolean, canvasSize: number,
): Promise<void> {
  const icon = slot.icon;
  const action = slot.action;
  const appId = action?.type === 'launchApp' ? action.appId : icon?.kind === 'app' ? icon.value : undefined;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const target = Math.round(canvasSize * ICON_FRACTION);
  if (target <= 0) return;

  if (icon?.kind === 'emoji') {
    ctx.font = `${Math.round(target * 0.85)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.value, cx, cy);
    return;
  }

  if (icon?.kind === 'image') {
    const img = await loadDeckImage(icon.value);
    if (img) { drawCover(ctx, img, canvasSize); return; }
  }

  if (appId) {
    const img = await loadAppIcon(appId);
    if (img) { drawCentered(ctx, img, cx, cy, target); return; }
  }

  const name = icon?.kind === 'lucide' ? icon.value : autoIconName(action, isFolder);
  const img = await loadLucideIcon(name, target);
  if (img) drawCentered(ctx, img, cx, cy, target);
}

/**
 * Overlays the label on top of the icon (never shrinking it), honoring the
 * slot's title style: alignment, font, size (a percentage of the key's edge
 * length, matching titleFontSizeCss's cqmin basis on-screen), weight, style,
 * underline, and color. The dark stroke pass under the fill mirrors the
 * on-screen label's text-shadow/text-stroke treatment so both stay legible
 * over any icon or accent color.
 */
function paintLabel(ctx: CanvasRenderingContext2D, label: string, canvasSize: number, style: ResolvedDeckTitleStyle): void {
  const fontPx = Math.max(8, Math.round((canvasSize * style.size) / 100));
  const family = style.fontFamily || 'sans-serif';
  const weight = style.bold ? 'bold ' : '';
  const slant = style.italic ? 'italic ' : '';
  ctx.font = `${slant}${weight}${fontPx}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const pad = Math.round(canvasSize * 0.06);
  const y = style.align === 'top' ? pad + fontPx / 2
    : style.align === 'bottom' ? canvasSize - pad - fontPx / 2
      : canvasSize / 2;

  const maxWidth = canvasSize * 0.92;
  let text = label;
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) {
    text = text.slice(0, -1);
  }
  if (text !== label && text.length > 1) text = `${text.slice(0, -1)}…`;

  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.18));
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(text, canvasSize / 2, y);
  ctx.fillStyle = style.color;
  ctx.fillText(text, canvasSize / 2, y);

  if (style.underline) {
    const halfWidth = ctx.measureText(text).width / 2;
    const underlineY = y + fontPx * 0.42;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1, Math.round(fontPx * 0.06));
    ctx.beginPath();
    ctx.moveTo(canvasSize / 2 - halfWidth, underlineY);
    ctx.lineTo(canvasSize / 2 + halfWidth, underlineY);
    ctx.stroke();
  }
}

function drawCentered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, targetSize: number): void {
  const scale = targetSize / Math.max(img.width, img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Cover-fit fill of the whole key face, unlike drawCentered's glyph-sized fit. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number): void {
  const { x, y, w, h } = coverFitRect(img.width, img.height, size);
  ctx.drawImage(img, x, y, w, h);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAppIcon(appId: string): Promise<HTMLImageElement | null> {
  const blob = await fetchServiceBlob(`/shortcuts/icon?targetId=${encodeURIComponent(appId)}`);
  if (!blob || blob.size === 0) return null;
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadDeckImage(id: string): Promise<HTMLImageElement | null> {
  const blob = await fetchDeckImage(id);
  if (!blob || blob.size === 0) return null;
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadLucideIcon(name: string, sizePx: number): Promise<HTMLImageElement | null> {
  const Comp = DECK_ICONS[name] ?? DECK_ICONS.Plus;
  const markup = renderToStaticMarkup(createElement(Comp, { color: '#ffffff', strokeWidth: 2, width: sizePx, height: sizePx }));
  return loadImage(`data:image/svg+xml;base64,${btoa(markup)}`);
}

async function encodeJpeg(img: { width: number; height: number; data: Uint8ClampedArray }): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return new Uint8Array();
  return new Uint8Array(await blob.arrayBuffer());
}
