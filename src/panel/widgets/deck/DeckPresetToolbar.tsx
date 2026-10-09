import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { History } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useToastSafe } from '../../../components/common/Toast/Toast';
import { PresetToolbar } from '../../../components/common/PresetToolbar/PresetToolbar';
import { PresetAppsModal } from '../lighting/page/PresetAppsModal';
import {
  exportDeckPreset, importDeckPreset, setDeckPresetApps,
  type DeckInstanceMode, type PresetApp,
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
  /** PUT /deck/presets/{id}/apps, DELETE and the file routes are LocalhostOnly; false hides the controls that drive them. */
  desktopActions: boolean;
  /** Renders as the page-header rail (ViewHeader's tabActions slot). */
  rail?: boolean;
  /** Activates a preset through the host's own reset (StreamDeckDevicePage also clears its page/folder/selection/live tiles). `mode` is set in the same write. */
  activatePreset: (id: string, mode?: DeckInstanceMode) => void;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  /** Opens the host's import modal (starter presets, Elgato profiles); omitted hides the option. */
  onImport?: () => void;
}

/**
 * The deck preset dropdown: a built-in Recent Apps entry and the host-wide
 * presets. App binding is per preset (the "Apps..." option); the service switches to a
 * bound preset whenever its app is in focus, in every mode but Recent Apps.
 */
export function DeckPresetToolbar({
  deck, desktopActions, rail, activatePreset, onDelete, onUndo, onRedo, onReset, onImport,
}: DeckPresetToolbarProps) {
  const { t } = useTranslation();
  const toast = useToastSafe();
  const recentApps = deck.instance?.mode === 'recentApps';
  // Snapshot taken on open: an app focus can switch the active preset while the modal is up.
  const [appsTarget, setAppsTarget] = useState<{ id: string; name: string; apps: PresetApp[] } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const activeId = deck.instance?.activePresetId ?? null;
  const activeSummary = deck.presets.find(p => p.id === activeId) ?? null;

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
