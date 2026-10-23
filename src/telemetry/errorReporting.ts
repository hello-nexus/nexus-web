import { authFetchWithStatus } from '../api/service';
import { isStaleChunkMessage, recoverFromStaleChunkNow } from '../lib/staleChunkRecovery';

export type ErrorKind = 'window-error' | 'unhandled-rejection' | 'render' | 'app';

/** Identity of the SDK app behind a kind 'app' report; tag is the service log prefix and rides along in the context. */
export interface AppErrorSource {
  id: string;
  tag: string;
}

interface ClientError {
  kind: ErrorKind;
  fingerprint: string;
  type: string;
  message: string;
  stack: string;
  context: string;
  app?: string;
  count: number;
}

const ENDPOINT = '/telemetry/client-errors';
const FLUSH_DELAY_MS = 5000;
const MAX_DISTINCT = 20;
const MAX_PER_POST = 10;
const GATE_WINDOW_MS = 1000;
const GATE_MAX = 10;
const MAX_CAUSE_DEPTH = 3;
const CAUSE_STACK_CAP = 300;
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

// Drops query strings and fragments from scheme URLs and relative paths: panel URLs can carry tokens.
function stripUrlSecrets(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#)'"]*|\/[^\s?#)'"]*)[?#][^\s)'"]*/gi, '$1');
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

function errorName(error: Error): string {
  const name: unknown = error.name;
  return typeof name === 'string' && name !== '' ? name : 'Error';
}

// React wraps the real recovered error in cause; only Error causes are followed.
function describeCauses(error: Error): { message: string; stack: string } {
  let message = '';
  let stack = '';
  const seen = new Set<unknown>([error]);
  let current: unknown = error.cause;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error) || seen.has(current)) break;
    seen.add(current);
    message += ` cause: ${errorName(current)}: ${String(current.message)}`;
    const causeStack = cap(String(current.stack ?? ''), CAUSE_STACK_CAP);
    if (causeStack !== '') stack += `\ncause: ${causeStack}`;
    current = current.cause;
  }
  return { message, stack };
}

function describe(error: unknown): { type: string; message: string; own: string; stack: string } {
  if (error instanceof Error) {
    const causes = describeCauses(error);
    const own = String(error.message);
    return {
      type: errorName(error),
      message: cap(own, Math.max(0, CAPS.message - causes.message.length)) + causes.message,
      own,
      stack: cap(String(error.stack ?? ''), Math.max(0, CAPS.stack - causes.stack.length)) + causes.stack,
    };
  }
  if (typeof error === 'string') return { type: 'string', message: error, own: error, stack: '' };
  if (typeof error === 'function') {
    const message = `function ${String(error.name)}`;
    return { type: 'function', message, own: message, stack: '' };
  }
  if (typeof error === 'object' && error !== null) {
    const ctor: unknown = Object.getPrototypeOf(error)?.constructor?.name;
    const type = typeof ctor === 'string' && ctor !== '' ? ctor : 'object';
    const message = `${type}{${Object.keys(error).slice(0, 10).join(',')}}`;
    return { type, message, own: message, stack: '' };
  }
  const message = String(error);
  return { type: error === null ? 'null' : typeof error, message, own: message, stack: '' };
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
    await authFetchWithStatus(ENDPOINT, { method: 'POST', body: { errors } });
  } catch {
    return;
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

export function reportError(error: unknown, kind: ErrorKind, context?: string, recoveryTried = false, app?: AppErrorSource): void {
  if (!recoveryTried && installed && staleChunkMessageOf(error)) {
    // A reload onto a new build makes the error moot; otherwise report it as usual.
    void recoverFromStaleChunkNow().then((reloaded) => {
      if (!reloaded) reportError(error, kind, context, true);
    });
    return;
  }
  if (!installed || reporting || !gateOpen()) return;
  reporting = true;
  try {
    const d = describe(error);
    // Apps share error names and messages, so the app id keeps their fingerprints apart.
    if (app) d.type = `${app.id}:${d.type}`;
    const stack = stripUrlSecrets(d.stack);
    if (isNoise(d.message, stack)) return;
    const message = cap(stripUrlSecrets(d.message), CAPS.message);
    const fingerprint = cap(fingerprintOf(d.type, message), CAPS.fingerprint);
    const existing = records.get(fingerprint);
    if (existing) {
      existing.unsent += 1;
      dirty.add(fingerprint);
      schedule();
      return;
    }
    if (records.size >= MAX_DISTINCT) {
      let evict: string | null = null;
      for (const [fp, rec] of records) {
        if (rec.unsent === 0) {
          evict = fp;
          break;
        }
      }
      if (evict === null) {
        dropped += 1;
        return;
      }
      records.delete(evict);
    }
    dirty.add(fingerprint);
    records.set(fingerprint, { unsent: 1, entry: {
      kind,
      fingerprint,
      type: cap(d.type, CAPS.type),
      message,
      stack: cap(stack, CAPS.stack),
      context: cap(stripUrlSecrets(currentContext(context)), CAPS.context),
      ...(app ? { app: cap(app.tag, CAPS.context) } : {}),
      count: 1,
    } });
    schedule();
  } catch {
    return;
  } finally {
    reporting = false;
  }
}

function staleChunkMessageOf(error: unknown): boolean {
  if (reporting) return false;
  // describe() reads error getters, which may raise error events themselves.
  reporting = true;
  try {
    return isStaleChunkMessage(describe(error).own);
  } catch {
    return false;
  } finally {
    reporting = false;
  }
}

function stripUrlSuffix(url: string): string {
  return url.replace(/[?#].*$/, '');
}

// Wallet extensions and in-app browsers inject scripts into the page. Their
// frames never come from our hashed /assets/ bundle (the dev server serves
// modules from other paths, so onWindowError skips the filter there). The one
// exception is our own inline index.html polyfills,
// which report the page URL as filename but always sit past line 1, whereas
// an injected snippet evaluated against the page starts at line 1.
export function isForeignScriptError(filename: string, lineno: number, pageHref: string): boolean {
  if (!filename) return false;
  if (filename.indexOf('/assets/') !== -1) return false;
  if (stripUrlSuffix(filename) === stripUrlSuffix(pageHref)) return lineno <= 1;
  return true;
}

function onWindowError(event: ErrorEvent): void {
  let foreign = false;
  try {
    foreign = !import.meta.env.DEV && isForeignScriptError(event.filename, event.lineno, window.location.href);
  } catch {
    foreign = false;
  }
  if (foreign) return;
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
