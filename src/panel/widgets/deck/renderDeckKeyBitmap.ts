// Paints one Stream Deck key bitmap on an offscreen canvas using the same
// visual language as the on-screen DeckGrid cell (category/custom color
// background, Lucide/emoji/app icon, label), then applies the model's wire
// transform and encodes to its wire format. jsdom can't rasterize canvas, so
// this stays thin and untested at the unit level - the pure parts it calls
// (deckKeyTransform, encodeBmp) carry the coverage.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchServiceBlob } from '../../../api/service';
import { DECK_ICONS, autoIconName, deckCategory, categoryColor } from './deckIcons';
import { applyKeyTransform, type DeckKeyTransform } from './deckKeyTransform';
import { encodeBmp } from './encodeBmp';
import type { DeckSlot } from './types';
import type { StreamDeckFormat } from '../../../api/streamdeck';

export interface DeckKeyModel {
  keyPixels: number;
  format: StreamDeckFormat;
  transform: DeckKeyTransform;
}

const JPEG_QUALITY = 0.9;
const ICON_FRACTION = 0.62;
const LABEL_FRACTION = 0.22;
const BACK_KEY_COLOR = '#23262e';

/**
 * The single per-deck Back-chevron bitmap uploaded to the reserved slotPath
 * "back" (state 0): the service pushes it to physical key 0 whenever a
 * folder view is active. Rendered through the same pipeline as any other
 * key via a synthetic slot, so it stays visually identical to the widget's
 * folder-back affordance.
 */
export function renderDeckBackKeyBitmap(model: DeckKeyModel): Promise<Uint8Array> {
  const backSlot: DeckSlot = { icon: { kind: 'lucide', value: 'ChevronLeft' }, color: BACK_KEY_COLOR };
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
  const transformed = applyKeyTransform({ width: size, height: size, data: raw.data }, model.transform);

  if (model.format === 'bmp') return encodeBmp(transformed);
  return encodeJpeg(transformed);
}

async function paintKey(ctx: CanvasRenderingContext2D, size: number, slot: DeckSlot): Promise<void> {
  const isFolder = !!slot.folder;
  const accent = slot.color ?? categoryColor(isFolder ? 'folder' : deckCategory(slot.action));
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, size, size);

  if (!shouldPaintIcon(slot)) return;

  const labelHeight = slot.label ? Math.round(size * LABEL_FRACTION) : 0;
  const iconAreaHeight = size - labelHeight;

  await paintIcon(ctx, slot, isFolder, size, iconAreaHeight);

  if (slot.label) paintLabel(ctx, slot.label, size, iconAreaHeight, labelHeight);
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
  ctx: CanvasRenderingContext2D, slot: DeckSlot, isFolder: boolean, canvasSize: number, iconAreaHeight: number,
): Promise<void> {
  const icon = slot.icon;
  const action = slot.action;
  const appId = action?.type === 'launchApp' ? action.appId : icon?.kind === 'app' ? icon.value : undefined;
  const cx = canvasSize / 2;
  const cy = iconAreaHeight / 2;
  const target = Math.round(Math.min(canvasSize, iconAreaHeight) * ICON_FRACTION);
  if (target <= 0) return;

  if (icon?.kind === 'emoji') {
    ctx.font = `${Math.round(target * 0.85)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.value, cx, cy);
    return;
  }

  if (appId) {
    const img = await loadAppIcon(appId);
    if (img) { drawCentered(ctx, img, cx, cy, target); return; }
  }

  const name = icon?.kind === 'lucide' ? icon.value : autoIconName(action, isFolder);
  const img = await loadLucideIcon(name, target);
  if (img) drawCentered(ctx, img, cx, cy, target);
}

function paintLabel(ctx: CanvasRenderingContext2D, label: string, canvasSize: number, top: number, height: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(10, Math.round(height * 0.55))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = canvasSize * 0.92;
  let text = label;
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) {
    text = text.slice(0, -1);
  }
  if (text !== label && text.length > 1) text = `${text.slice(0, -1)}…`;
  ctx.fillText(text, canvasSize / 2, top + height / 2);
}

function drawCentered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, targetSize: number): void {
  const scale = targetSize / Math.max(img.width, img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
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
