import { postService } from '../api/service';

export type ErrorKind = 'window-error' | 'unhandled-rejection' | 'render';

interface ClientError {
  kind: ErrorKind;
  fingerprint: string;
  type: string;
  message: string;
  stack: string;
  context: string;
  count: number;
}

const ENDPOINT = '/telemetry/client-errors';
const FLUSH_DELAY_MS = 5000;
const MAX_DISTINCT = 20;
const MAX_PER_POST = 10;
const GATE_WINDOW_MS = 1000;
const GATE_MAX = 10;
const CAPS = { fingerprint: 64, type: 128, message: 1000, stack: 2000, context: 500 };

const records = new Map<string, { entry: ClientError; unsent: number }>();
const dirty = new Set<string>();
let gateStart = 0;
let gateCount = 0;
let dropped = 0;
let installed = false;
let reporting = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// Drops query strings and hashes from URLs: panel URLs can carry tokens.
function stripUrlSecrets(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#)'"]*)[?#][^\s)'"]*/g, '$1');
}

function normalizeMessage(message: string): string {
  return message
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '?')
    .replace(/\b0x[0-9a-f]+\b/gi, '#')
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\d+/g, '#');
}

function hash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

export function fingerprintOf(type: string, message: string): string {
  return hash(`${type}|${normalizeMessage(message)}`);
}

function describe(error: unknown): { type: string; message: string; stack: string } {
  if (error instanceof Error) {
    return { type: error.name || 'Error', message: String(error.message), stack: String(error.stack ?? '') };
  }
  if (typeof error === 'string') return { type: 'string', message: error, stack: '' };
  let message = '';
  try {
    message = typeof error === 'object' && error !== null ? JSON.stringify(error) ?? '' : String(error);
  } catch {
    message = '';
  }
  return { type: typeof error, message, stack: '' };
}

function isNoise(message: string, stack: string): boolean {
  if (message.indexOf('ResizeObserver loop') !== -1) return true;
  return message === 'Script error.' && stack === '';
}

function currentContext(extra?: string): string {
  let path = '';
  try {
    path = window.location.pathname;
  } catch {
    path = '';
  }
  return extra ? `${path} ${extra}` : path;
}

async function flush(): Promise<void> {
  timer = null;
  const errors: ClientError[] = [];
  for (const fp of dirty) {
    if (errors.length >= MAX_PER_POST) break;
    const rec = records.get(fp);
    dirty.delete(fp);
    if (!rec || rec.unsent === 0) continue;
    errors.push({ ...rec.entry, count: rec.unsent });
    rec.unsent = 0;
  }
  if (dirty.size > 0) schedule();
  if (errors.length === 0) return;
  try {
    await postService(ENDPOINT, { errors });
  } catch {
    // a failed POST is dropped
  }
}

function schedule(): void {
  if (timer !== null) return;
  timer = setTimeout(() => { void flush(); }, FLUSH_DELAY_MS);
}

function gateOpen(): boolean {
  const now = Date.now();
  if (now - gateStart >= GATE_WINDOW_MS || now < gateStart) {
    gateStart = now;
    gateCount = 0;
  }
  if (gateCount >= GATE_MAX) {
    dropped += 1;
    return false;
  }
  gateCount += 1;
  return true;
}

export function reportError(error: unknown, kind: ErrorKind, context?: string): void {
  if (reporting || !gateOpen()) return;
  reporting = true;
  try {
    const d = describe(error);
    const stack = stripUrlSecrets(d.stack);
    if (isNoise(d.message, stack)) return;
    const message = stripUrlSecrets(d.message);
    const fingerprint = cap(fingerprintOf(d.type, d.message), CAPS.fingerprint);
    const existing = records.get(fingerprint);
    if (existing) {
      existing.unsent += 1;
      dirty.add(fingerprint);
      schedule();
      return;
    }
    if (records.size >= MAX_DISTINCT) return;
    dirty.add(fingerprint);
    records.set(fingerprint, { unsent: 1, entry: {
      kind,
      fingerprint,
      type: cap(d.type, CAPS.type),
      message: cap(message, CAPS.message),
      stack: cap(stack, CAPS.stack),
      context: cap(stripUrlSecrets(currentContext(context)), CAPS.context),
      count: 1,
    } });
    schedule();
  } catch {
    // reporting must never throw
  } finally {
    reporting = false;
  }
}

function onWindowError(event: ErrorEvent): void {
  reportError(event.error ?? event.message, 'window-error');
}

function onRejection(event: PromiseRejectionEvent): void {
  reportError(event.reason, 'unhandled-rejection');
}

export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
}

export function resetErrorReportingForTests(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  records.clear();
  dirty.clear();
  gateStart = 0;
  gateCount = 0;
  dropped = 0;
  reporting = false;
  if (installed && typeof window !== 'undefined') {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onRejection);
  }
  installed = false;
}

export function droppedErrorCount(): number {
  return dropped;
}
