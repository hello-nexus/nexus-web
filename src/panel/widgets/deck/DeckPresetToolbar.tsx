import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { History, Sparkles } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useToastSafe } from '../../../components/common/Toast/Toast';
import { PresetToolbar } from '../../../components/common/PresetToolbar/PresetToolbar';
import { PresetAppsModal } from '../lighting/page/PresetAppsModal';
import {
  createDeckPreset, exportDeckPreset, getDeckTemplates, importDeckPreset, setDeckPresetApps,
  type DeckInstanceMode, type DeckTemplate, type PresetApp,
} from '../../../api/deck';
import type { UseDeckInstanceResult } from './useDeckInstance';

export const DECK_PRESET_CAP = 50;

/** Mode to send with a preset activation: picking a preset leaves Recent Apps. */
export function modeOnPick(deck: Pick<UseDeckInstanceResult, 'instance'>): DeckInstanceMode | undefined {
  return deck.instance?.mode === 'recentApps' ? 'custom' : undefined;
}

const RECENT_APPS_ID = 'recentApps';
const IMPORT_RETRY_TOAST_MS = 15000;

export interface DeckPresetToolbarProps {
  deck: UseDeckInstanceResult;
  /** GET /deck/templates, PUT /deck/presets/{id}/apps, DELETE and the file routes are LocalhostOnly; false hides the controls that drive them. */
  desktopActions: boolean;
  /** Renders as the page-header rail (ViewHeader's tabActions slot). */
  rail?: boolean;
  /** Activates a preset through the host's own reset (StreamDeckDevicePage also clears its page/folder/selection/live tiles). `mode` is set in the same write. */
  activatePreset: (id: string, mode?: DeckInstanceMode) => void;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  /** Import into a host-wide preset (Elgato import); omitted hides the option. */
  onImport?: () => void;
}

/**
 * The deck preset dropdown: a built-in Recent Apps entry, the host-wide
 * presets, and the bundled app templates not yet turned into a preset. App
 * binding is per preset (the "Apps..." option); the service switches to a
 * bound preset whenever its app is in focus, in every mode but Recent Apps.
 */
export function DeckPresetToolbar({
  deck, desktopActions, rail, activatePreset, onDelete, onUndo, onRedo, onReset, onImport,
}: DeckPresetToolbarProps) {
  const { t } = useTranslation();
  const toast = useToastSafe();
  const recentApps = deck.instance?.mode === 'recentApps';
  const [templates, setTemplates] = useState<DeckTemplate[]>([]);
  // Snapshot taken on open: an app focus can switch the active preset while the modal is up.
  const [appsTarget, setAppsTarget] = useState<{ id: string; name: string; apps: PresetApp[] } | null>(null);
  const busyRef = useRef(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!desktopActions) return;
    let cancelled = false;
    void getDeckTemplates().then(list => { if (!cancelled) setTemplates(list); });
    return () => { cancelled = true; };
  }, [desktopActions]);

  const activeId = deck.instance?.activePresetId ?? null;
  const activeSummary = deck.presets.find(p => p.id === activeId) ?? null;
  const atCap = deck.presets.length >= DECK_PRESET_CAP;

  const takenApps = useMemo(() => {
    const out: Record<string, string> = {};
    for (const preset of deck.presets) {
      if (preset.id === appsTarget?.id) continue;
      for (const app of preset.apps ?? []) {
        out[app.id] = preset.name;
        if (app.processName) out[app.processName] = preset.name;
      }
    }
    return out;
  }, [deck.presets, appsTarget?.id]);

  const pick = (id: string) => {
    activatePreset(id, modeOnPick(deck));
  };

  const suggestions = desktopActions
    ? templates
      .filter(tpl => !deck.presets.some(p => p.templateId === tpl.id))
      .map(tpl => ({ id: tpl.id, label: tpl.name, icon: <Sparkles size={14} aria-hidden />, disabled: atCap }))
    : [];

  // The service creates from a template with its own name de-dupe and
  // pre-binds the installed app (with its own conflict check).
  const createFromTemplate = async (tplId: string) => {
    const tpl = templates.find(x => x.id === tplId);
    if (!tpl || busyRef.current) return;
    busyRef.current = true;
    try {
      const created = await createDeckPreset({ name: tpl.name, cols: tpl.cols, rows: tpl.rows, templateId: tpl.id });
      if (!created) {
        toast.push({ title: t('panel.settings.deck.presets.createFailed') });
        return;
      }
      pick(created.id);
    } finally {
      busyRef.current = false;
    }
  };

  const runImport = async (file: File, allowPrivileged: boolean) => {
    const result = await importDeckPreset(file, allowPrivileged);
    if (result.kind === 'ok') {
      pick(result.preset.id);
      return;
    }
    if (result.kind === 'conflict') {
      toast.push({ title: result.msg || t('panel.settings.deck.presets.duplicateName') });
      return;
    }
    if (result.kind === 'privileged') {
      toast.push({
        title: result.msg || t('panel.settings.deck.presets.importPrivileged'),
        action: { label: t('panel.settings.deck.presets.importAnyway'), onClick: () => void runImport(file, true) },
        durationMs: IMPORT_RETRY_TOAST_MS,
      });
      return;
    }
    toast.push({ title: t('panel.settings.deck.presets.importFailed') });
  };

  const onImportFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void runImport(file, false);
  };

  const saveApps = async (apps: PresetApp[]) => {
    if (!appsTarget) return null;
    const result = await setDeckPresetApps(appsTarget.id, apps);
    if (result.kind === 'conflict') {
      return { message: t('lighting.layoutPresets.appsTaken', { app: result.conflict.appName, preset: result.conflict.presetName }), failed: false };
    }
    if (result.kind === 'failed') return { message: t('panel.settings.deck.presets.appsSaveFailed'), failed: true };
    // The service broadcasts a `preset` deck-topic frame for this write, which
    // useDeckInstance already applies to `presets`.
    setAppsTarget(null);
    return null;
  };

  return (
    <>
      <PresetToolbar
        rail={rail}
        cap={DECK_PRESET_CAP}
        allowDelete={desktopActions}
        presets={deck.presets.map(p => ({ id: p.id, name: p.name, hasApps: !!p.apps?.length }))}
        activeId={activeId}
        presetCount={deck.presets.length}
        builtins={[{ id: RECENT_APPS_ID, label: t('panel.settings.deck.mode.recentApps'), icon: <History size={14} aria-hidden /> }]}
        activeBuiltinId={recentApps ? RECENT_APPS_ID : null}
        onSelectBuiltin={() => deck.setMode('recentApps')}
        suggestions={suggestions}
        onSelectSuggestion={id => void createFromTemplate(id)}
        onLoad={pick}
        onCreate={name => deck.createPreset(name, pick)}
        onRename={deck.renamePreset}
        onDelete={onDelete}
        onManageApps={desktopActions ? () => { if (activeSummary) setAppsTarget({ id: activeSummary.id, name: activeSummary.name, apps: activeSummary.apps ?? [] }); } : undefined}
        onImport={onImport}
        onExport={desktopActions ? id => void exportDeckPreset(id) : undefined}
        onImportFile={desktopActions ? () => importFileInputRef.current?.click() : undefined}
        canUndo={deck.canUndo}
        canRedo={deck.canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onReset={onReset}
        translationPrefix="panel.settings.deck.presets"
      />
      {desktopActions && (
        <input
          ref={importFileInputRef}
          type="file"
          accept=".nexus-deck"
          style={{ display: 'none' }}
          onChange={onImportFileSelected}
        />
      )}
      {appsTarget && (
        <PresetAppsModal
          presetName={appsTarget.name}
          apps={appsTarget.apps}
          taken={takenApps}
          onSave={saveApps}
          onClose={() => setAppsTarget(null)}
        />
      )}
    </>
  );
}
