// The service's open-app route allows only [A-Za-z0-9/-_.~?=], so the editor's device key
// (`panel-display:<id>`) travels as /system/panel/<id> and useRoute maps it back.
export interface PanelEditorTarget {
  recordId: string;
  widgetId: string;
  /** Deck key the tap landed on, in the deck's page and folder at that moment. */
  deckKey?: { page: number; folderPath: number[]; slot: number };
}

const PATH = /^\/system\/panel\/([A-Za-z0-9_-]+)\/?$/;
const ID = /^[A-Za-z0-9_-]+$/;
let pending: PanelEditorTarget | null = null;

// One parameter, `widget=<id>[~<page>~<folder path, dot-joined>~<slot>]`: the route rule has no `&`.
export function panelEditorRoute(target: PanelEditorTarget): string {
  const key = target.deckKey;
  const suffix = key ? `~${key.page}~${key.folderPath.join('.')}~${key.slot}` : '';
  return `/system/panel/${target.recordId}?widget=${target.widgetId}${suffix}`;
}

function index(raw: string | null): number | null {
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  return Number(raw);
}

export function parsePanelEditorTarget(pathname: string, search: string): PanelEditorTarget | null {
  const recordId = PATH.exec(pathname)?.[1];
  if (!recordId) return null;
  const [widgetId, rawPage, folder = '', rawSlot] = (new URLSearchParams(search).get('widget') ?? '').split('~');
  if (!widgetId || !ID.test(widgetId)) return null;
  const page = index(rawPage ?? null);
  const slot = index(rawSlot ?? null);
  const folderPath = folder === '' ? [] : folder.split('.').map(index);
  if (page === null || slot === null || folderPath.some(i => i === null)) return { recordId, widgetId };
  return { recordId, widgetId, deckKey: { page, folderPath: folderPath as number[], slot } };
}

/** Called once at app boot with the landing URL. */
export function stashPanelEditorTarget(pathname: string, search: string): void {
  pending = parsePanelEditorTarget(pathname, search);
}

/** The editor page for `recordId` claims the stashed target once. */
export function takePanelEditorTarget(recordId: string): PanelEditorTarget | null {
  if (!pending || pending.recordId !== recordId) return null;
  const target = pending;
  pending = null;
  return target;
}
