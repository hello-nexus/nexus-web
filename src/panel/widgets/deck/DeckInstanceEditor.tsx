import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { Button } from '../../../components/common/Button/Button';
import { Notice } from '../../../components/common/Notice/Notice';
import { fitPageCount } from './deckLayout';
import { DeckEditor } from './DeckEditor';
import { DeckRecentAppsSection } from './DeckRecentAppsSection';
import { DeckPresetToolbar, modeOnPick } from './DeckPresetToolbar';
import { ElgatoImportModal } from '../../../components/views/DevicePage/ElgatoImportModal';
import type { UseDeckInstanceResult } from './useDeckInstance';
import type { DeckInstanceMode } from '../../../api/deck';
import type { PanelSurface } from '../../types';
import styles from './DeckInstanceEditor.module.scss';

export interface DeckInstanceEditorProps {
  deck: UseDeckInstanceResult;
  instanceGrid: { cols: number; rows: number };
  kind: 'physical' | 'widget';
  page: number;
  onPageChange: (page: number) => void;
  folderPath: readonly number[];
  onFolderPathChange: (folderPath: number[]) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  surface?: PanelSurface;
  desktopEditor?: boolean;
  /**
   * 'headerRail' omits the preset toolbar and the grid body: the host mounts
   * DeckPresetToolbar in its own page header (StreamDeckDevicePage) and
   * supplies its bespoke grid (which also shows live hardware-rendered tiles)
   * against the same `deck.target`. 'full' (default) renders the toolbar
   * inline plus the shared DeckEditor body, used by the widget settings sheet,
   * which has neither.
   */
  bodyMode?: 'full' | 'headerRail';
}

/**
 * Host-wide preset toolbar + (optionally) the shared grid/inspector body,
 * bound to one useDeckInstance() result. Hosted by both
 * StreamDeckDevicePage (Customize tab) and DeckSettings (the Deck widget's
 * edit sheet) so a preset edited from either surface repaints the other.
 */
export function DeckInstanceEditor({
  deck, instanceGrid, kind, page, onPageChange, folderPath, onFolderPathChange,
  selectedSlot, onSelectedSlotChange, surface, desktopEditor, bodyMode = 'full',
}: DeckInstanceEditorProps) {
  const { t } = useTranslation();
  const mode = deck.instance?.mode ?? 'custom';
  const [importOpen, setImportOpen] = useState(false);

  // Presence-only: the payload is ignored. Mounted for as long as this editor
  // is on screen (unmounts on a tab switch or the widget sheet closing), so
  // the service's app-based preset switcher can pause while any editor for this
  // instance is open and settle once the last one closes.
  useTopicCallback('deck-edit', true, () => {});

  // Several preset routes (DELETE /deck/presets/{id}, PUT .../apps, GET
  // /deck/templates, PUT/DELETE /deck/recent-apps/*) are LocalhostOnly - a
  // panel session's own request would just fail, so every control that would
  // only drive one of those is hidden on a non-desktop surface instead of
  // offered and silently rejected. `desktopEditor` covers the desktop
  // dashboard's own simulated-panel preview, which is a real desktop request
  // despite a non-desktop `surface`.
  const desktopActions = !surface || surface === 'desktop' || !!desktopEditor;

  // Without a host override, a switched-to preset can have fewer pages/slots
  // than the one it replaced, so page/selectedSlot reset here too - otherwise
  // the grid can render blank on a stale out-of-range page.
  const activatePreset = (id: string, nextMode?: DeckInstanceMode) => {
    void deck.activate(id, nextMode);
    onPageChange(0);
    onSelectedSlotChange?.(0);
  };

  const preset = deck.preset;
  // Key COUNT, not cols/rows shape: a 4x2 preset on a 2x4 instance fits as an
  // identity (same 8 keys, just a different visual arrangement) - nothing
  // overflows or shrinks, so no note is warranted despite the shape differing.
  let fitNote: string | null = null;
  if (preset) {
    const presetKeyCount = preset.cols * preset.rows;
    const instanceKeyCount = instanceGrid.cols * instanceGrid.rows;
    if (presetKeyCount > instanceKeyCount) {
      const pages = fitPageCount({ cols: preset.cols, rows: preset.rows, deck: preset.deck }, { ...instanceGrid, kind });
      fitNote = pages > 1
        ? t('panel.settings.deck.instance.fitNoteLargerPaged', { pages })
        : t('panel.settings.deck.instance.fitNoteLarger');
    } else if (presetKeyCount < instanceKeyCount) {
      fitNote = t('panel.settings.deck.instance.fitNoteSmaller');
    }
  }

  return (
    <div className={styles.root}>
      {bodyMode === 'full' && (
        <DeckPresetToolbar
          deck={deck}
          desktopActions={desktopActions}
          activatePreset={activatePreset}
          onDelete={id => {
            void deck.deletePreset(id);
            onPageChange(0);
            onSelectedSlotChange?.(0);
          }}
          onUndo={deck.undo}
          onRedo={deck.redo}
          onReset={deck.reset}
          onImport={desktopActions ? () => setImportOpen(true) : undefined}
        />
      )}
      {bodyMode === 'full' && desktopActions && (
        <ElgatoImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          deckCols={instanceGrid.cols}
          deckRows={instanceGrid.rows}
          existingPresetNames={deck.presets.map(p => p.name)}
          addedTemplateIds={deck.presets.flatMap(p => (p.templateId ? [p.templateId] : []))}
          onImported={id => activatePreset(id, modeOnPick(deck))}
        />
      )}

      {mode === 'recentApps' && <DeckRecentAppsSection showPreviewNote={bodyMode === 'full'} desktopActions={desktopActions} />}
      {mode !== 'recentApps' && fitNote && <p className={styles.fitNote}>{fitNote}</p>}

      {bodyMode === 'full' && mode !== 'recentApps' && (
        deck.target ? (
          <DeckEditor
            target={deck.target}
            page={page}
            onPageChange={onPageChange}
            folderPath={folderPath}
            onFolderPathChange={onFolderPathChange}
            selectedSlot={selectedSlot}
            onSelectedSlotChange={onSelectedSlotChange}
            surface={surface}
            desktopEditor={desktopEditor}
          />
        ) : deck.error ? (
          <Notice
            tone="critical"
            role="alert"
            actions={<Button type="button" size="sm" tone="neutral" onClick={deck.retry}>{t('panel.settings.deck.rail.retry')}</Button>}
          >
            {t('panel.settings.deck.rail.loadFailed')}
          </Notice>
        ) : (
          <div className={styles.loading}>{t('panel.settings.deck.rail.loadingConfig')}</div>
        )
      )}
    </div>
  );
}
