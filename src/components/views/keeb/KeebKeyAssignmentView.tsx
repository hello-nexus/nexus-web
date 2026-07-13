import { useMemo, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type { KeyboardState, SetLayerKeyBody } from '../../../api/keeb';
import { Button } from '../../common/Button/Button';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Tabs, type TabDef } from '../../common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import { KEEB_RENDER_WIDTH, KeebKeyboard, type KeebSelection } from './KeebKeyboard';
import { useFitZoom } from './useFitZoom';
import { CHIP_GLYPH_ICON_SIZE, getKeyGlyph, type KeebLayoutKind } from './keebGlyphs';
import { getKeebLayoutRows } from './keebLayout';
import {
  ASSIGNMENT_CATEGORIES,
  CATEGORY_LABEL_KEYS,
  SPECIAL_ASSIGNMENTS,
  getAssignmentCategories,
  type AssignmentFunction,
  type KeebAssignmentCategory,
} from './keebCategories';
import styles from './KeebKeyAssignmentView.module.scss';

export interface KeebKeyAssignmentViewProps {
  selected: { x: number; y: number } | null;
  /// Live keyboard state - used by the `Keyboard` category to render a
  /// secondary picker that mirrors the same layout (ANSI / ISO).
  state: KeyboardState;
  setKey: (body: SetLayerKeyBody) => Promise<void>;
  resetLayer: () => Promise<void>;
}

/// A function's chip label: the shared key glyph (when it is an icon) sits
/// inside the chip beside the localized name. String glyphs are dropped - they
/// only repeat the label.
function chipLabel(fn: AssignmentFunction, layout: KeebLayoutKind, text: string): ReactNode {
  const glyph = getKeyGlyph(fn.keyFunction, layout, CHIP_GLYPH_ICON_SIZE);
  if (typeof glyph === 'string') return text;
  return (
    <span className={styles.chipLabel}>
      <span className={styles.chipIcon} aria-hidden="true">{glyph}</span>
      {text}
    </span>
  );
}

/// Key Assignment tab body. Category tabs at the top + content below.
///
/// `Keyboard` category renders a second keyboard graphic as a click-to-pick
/// source: tap a key there and its default function is assigned to the cell
/// selected on the main keyboard above.
///
/// Every other category renders its functions as chip groups inside titled
/// surface boxes; the chip matching the selected key's current function reads
/// as active.
export function KeebKeyAssignmentView({
  selected,
  state,
  setKey,
  resetLayer,
}: KeebKeyAssignmentViewProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<KeebAssignmentCategory>('Keyboard');
  const [confirmReset, setConfirmReset] = useState(false);
  // Fit the source-keyboard render to the window width.
  const sourceStage = useFitZoom(KEEB_RENDER_WIDTH, 0.48);

  const categoryTabs: TabDef[] = useMemo(
    () => ASSIGNMENT_CATEGORIES.map(cat => ({ key: cat, label: t(CATEGORY_LABEL_KEYS[cat]) })),
    [t],
  );

  const categories = getAssignmentCategories();
  const groups = category === 'Keyboard' ? [] : categories[category];
  const layoutKind: KeebLayoutKind = state.layout === 'ISO' ? 'ISO' : 'ANSI';

  const onTile = async (keyFunction: string, mode: SetLayerKeyBody['mode'], input?: number | null) => {
    if (!selected) return;
    await setKey({ x: selected.x, y: selected.y, func: keyFunction, mode, input: input ?? null });
  };

  // The selected key's current firmware function - the chip carrying it reads
  // as active across whichever group holds it.
  const currentFn = (selected ? state.keys?.[selected.x]?.[selected.y]?.function : '') ?? '';

  const buildOptions = (functions: AssignmentFunction[]): ChipOption[] =>
    functions.map(fn => ({
      key: fn.keyFunction,
      label: chipLabel(fn, layoutKind, t(fn.labelKey, fn.labelParams)),
      disabled: !selected,
      // A disabled chip is unfocusable, so skip the tooltip then.
      tooltip: selected ? fn.keyFunction : undefined,
    }));

  const onPick = (functions: readonly AssignmentFunction[], key: string) => {
    const fn = functions.find(f => f.keyFunction === key);
    if (fn) void onTile(fn.keyFunction, fn.mode, fn.input);
  };

  // Click on the source keyboard → look up that cell's default function
  // (StandardKey + Mode comes from the layout data) and write it onto the
  // selected target cell on the main keyboard.
  const sourceRows = useMemo(() => getKeebLayoutRows(layoutKind), [layoutKind]);
  const onSourceSelect = async (selection: KeebSelection) => {
    if (selection?.kind !== 'key' || !selected) return;
    const cell = sourceRows[selection.x]?.[selection.y];
    if (!cell) return;
    await setKey({ x: selected.x, y: selected.y, func: cell.function, mode: cell.mode });
  };

  // Highlight on the source keyboard reflects the target's current mapping.
  // Two-pass lookup:
  //   1. Target's current function from live state (firmware-assigned).
  //   2. Find that function's natural position on the source keyboard. If it
  //      isn't a default-layout key (e.g. Macro1, MouseLButton), no source
  //      cell matches and nothing highlights.
  // React Compiler auto-memoizes the IIFE below; an explicit useMemo tripped
  // react-hooks/preserve-manual-memoization because the inferred deps differed
  // from the source list.
  const sourceSelected: KeebSelection = (() => {
    if (!selected) return null;
    const assigned = state.keys?.[selected.x]?.[selected.y];
    const fn = assigned?.function
      ?? sourceRows[selected.x]?.[selected.y]?.function;
    if (!fn) return null;
    for (let x = 0; x < sourceRows.length; x++) {
      const row = sourceRows[x];
      for (let y = 0; y < row.length; y++) {
        if (row[y].function === fn) return { kind: 'key', x, y };
      }
    }
    return null;
  })();

  const disabled = !selected;

  // None restores the factory function; PassThrough falls through to the layer
  // below (nothing to fall through to on the base layer).
  const specialOptions: ChipOption[] = SPECIAL_ASSIGNMENTS.map(fn => {
    const unavailable = fn.keyFunction === 'PassThrough' && state.layer === 0;
    const off = disabled || unavailable;
    return {
      key: fn.keyFunction,
      label: t(fn.labelKey),
      disabled: off,
      tooltip: off
        ? undefined
        : t(`keeb.assignTip.${fn.keyFunction}`),
    };
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Tabs
          tabs={categoryTabs}
          activeKey={category}
          onChange={k => setCategory(k as KeebAssignmentCategory)}
          ariaLabel={t('keeb.assign.categoriesAria')}
        />
        <Button
          size="sm"
          tone="neutral"
          icon={<RotateCcw size={14} aria-hidden="true" />}
          onClick={() => setConfirmReset(true)}
        >
          {t('keeb.assign.reset')}
        </Button>
      </header>

      <ConfirmModal
        open={confirmReset}
        title={t('keeb.assign.resetTitle')}
        message={t('keeb.assign.resetMessage', { layer: state.layer + 1 })}
        confirmLabel={t('keeb.assign.reset')}
        onConfirm={() => {
          setConfirmReset(false);
          void resetLayer();
        }}
        onCancel={() => setConfirmReset(false)}
      />

      {disabled && (
        <p className={styles.hint} aria-live="polite">
          {t('keeb.assign.hint')}
        </p>
      )}

      {category === 'Keyboard' && (
        <>
          <div ref={sourceStage.ref} className={styles.sourceStageWrap}>
            <div className={styles.sourceStage} style={{ zoom: sourceStage.zoom }}>
              <KeebKeyboard
                state={state}
                disabled={disabled}
                // Highlight reflects what the target is currently mapped to; a
                // click on a different source key rebinds. Wheels are hidden
                // because picking a wheel-as-source isn't a valid rebind here.
                // useDefaults keeps the picker showing the printed-legend layout
                // even after the firmware has been remapped.
                selected={sourceSelected}
                hideWheels
                useDefaults
                onSelect={onSourceSelect}
              />
            </div>
          </div>
          <div className={styles.specialRow}>
            <ChipGroup
              className={styles.chips}
              options={specialOptions}
              activeKey={currentFn}
              onChange={key => onPick(SPECIAL_ASSIGNMENTS, key)}
            />
          </div>
          {state.layer === 0 && (
            // Pass Through is disabled on the base layer; say why, since a
            // disabled chip is unfocusable and can carry no tooltip.
            <p className={styles.specialHint} aria-live="polite">
              {t('keeb.assign.passThroughBaseLayer')}
            </p>
          )}
        </>
      )}

      {category !== 'Keyboard' && (
        <div className={styles.grid}>
          {groups.map(group => (
            <SettingsSection key={group.titleKey} title={t(group.titleKey)}>
              {group.sections.map(section => (
                <div key={section.titleKey} className={styles.chipSection}>
                  <span className={styles.chipSectionLabel}>{t(section.titleKey)}</span>
                  <ChipGroup
                    className={styles.chips}
                    options={buildOptions(section.functions)}
                    activeKey={currentFn}
                    onChange={key => onPick(section.functions, key)}
                    ariaLabel={t(section.titleKey)}
                  />
                </div>
              ))}
            </SettingsSection>
          ))}
        </div>
      )}
    </div>
  );
}
