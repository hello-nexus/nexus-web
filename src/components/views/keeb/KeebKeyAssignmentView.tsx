import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { KeyboardState, SetLayerKeyBody } from '../../../api/keeb';
import { Button } from '../../common/Button/Button';
import { Card } from '../../common/Card/Card';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { Tabs, type TabDef } from '../../common/Tabs/Tabs';
import { KeebKeyboard, type KeebSelection } from './KeebKeyboard';
import { getKeebLayoutRows } from './keebLayout';
import {
  ASSIGNMENT_CATEGORIES,
  getAssignmentCategories,
  type KeebAssignmentCategory,
} from './keebCategories';
import styles from './KeebKeyAssignmentView.module.scss';

const CATEGORY_TABS: readonly TabDef[] = ASSIGNMENT_CATEGORIES.map(cat => ({ key: cat, label: cat }));

export interface KeebKeyAssignmentViewProps {
  selected: { x: number; y: number } | null;
  /// Live keyboard state — used by the `Keyboard` category to render a
  /// secondary picker that mirrors the same layout (ANSI / ISO).
  state: KeyboardState;
  setKey: (body: SetLayerKeyBody) => Promise<void>;
  resetLayer: () => Promise<void>;
}

/// Key Assignment tab body. Category tabs at the top + content below.
///
/// `Keyboard` category renders a second keyboard graphic that acts as a
/// click-to-pick source: tap a key there and its default function gets
/// assigned to the cell the user selected on the main keyboard above. This
/// replaces the legacy drag-and-drop "source keyboard" — same outcome, one
/// click instead of two-step drag.
///
/// All other categories render their function tiles in titled cards.
export function KeebKeyAssignmentView({
  selected,
  state,
  setKey,
  resetLayer,
}: KeebKeyAssignmentViewProps) {
  const [category, setCategory] = useState<KeebAssignmentCategory>('Keyboard');
  const [confirmReset, setConfirmReset] = useState(false);

  const categories = useMemo(() => getAssignmentCategories(), []);
  const groups = category === 'Keyboard' ? [] : categories[category];

  const onTile = async (keyFunction: string, mode: SetLayerKeyBody['mode'], input?: number | null) => {
    if (!selected) return;
    await setKey({ x: selected.x, y: selected.y, func: keyFunction, mode, input: input ?? null });
  };

  // Click on the source keyboard → look up that cell's default function
  // (StandardKey + Mode comes from the layout data) and write it onto the
  // selected target cell on the main keyboard.
  const layoutKind = state.layout === 'ISO' ? 'ISO' : 'ANSI';
  const sourceRows = useMemo(() => getKeebLayoutRows(layoutKind), [layoutKind]);
  const onSourceSelect = async (selection: KeebSelection) => {
    if (selection?.kind !== 'key' || !selected) return;
    const cell = sourceRows[selection.x]?.[selection.y];
    if (!cell) return;
    await setKey({ x: selected.x, y: selected.y, func: cell.function, mode: cell.mode });
  };

  // Highlight on the source keyboard reflects what the target is currently
  // mapped to. Two-pass lookup:
  //   1. Target's *current* function from live state (firmware-assigned).
  //   2. Find that function's natural position on the source keyboard.
  //      If the function isn't a default-layout key (e.g. Macro1, MouseLButton),
  //      no source cell matches and nothing highlights.
  // This is the "which physical key does this remap to right now" indicator.
  // React Compiler auto-memoizes the IIFE below based on the values it reads;
  // an explicit useMemo here triggered react-hooks/preserve-manual-memoization
  // because the compiler's inferred deps differed from the source list. Same
  // referential-stability guarantee, fewer ceremony lines.
  const sourceSelected: KeebSelection = (() => {
    if (!selected) return null;
    const assigned = state.keys[selected.x]?.[selected.y];
    const currentFn = assigned?.function
      ?? sourceRows[selected.x]?.[selected.y]?.function;
    if (!currentFn) return null;
    for (let x = 0; x < sourceRows.length; x++) {
      const row = sourceRows[x];
      for (let y = 0; y < row.length; y++) {
        if (row[y].function === currentFn) return { kind: 'key', x, y };
      }
    }
    return null;
  })();

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setConfirmReset(false);
    await resetLayer();
  };

  const disabled = !selected;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Tabs
          tabs={CATEGORY_TABS}
          activeKey={category}
          onChange={k => setCategory(k as KeebAssignmentCategory)}
          variant="pill"
          ariaLabel="Assignment categories"
        />
        <Button
          size="sm"
          tone={confirmReset ? 'danger' : 'neutral'}
          icon={<RotateCcw size={14} aria-hidden="true" />}
          onClick={onReset}
        >
          {confirmReset ? 'Are you sure?' : 'Reset Layer'}
        </Button>
      </header>

      {disabled && (
        <p className={styles.hint}>
          Click a key on the keyboard above first, then pick a function to assign.
        </p>
      )}

      {category === 'Keyboard' && (
        <div className={styles.sourceStage}>
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
      )}

      {category !== 'Keyboard' && (
        <div className={styles.grid}>
          {groups.map(group => (
            <Card key={group.title} title={group.title} className={styles.groupCard}>
              {group.sections.map(section => (
                <div key={section.title} className={styles.section}>
                  <h4 className={styles.sectionTitle}>{section.title}</h4>
                  <div className={styles.tiles}>
                    {section.functions.map(fn => (
                      <IconLabelButton
                        key={fn.keyFunction}
                        label={fn.name}
                        disabled={disabled}
                        title={fn.keyFunction}
                        ariaLabel={fn.name}
                        onPress={() => void onTile(fn.keyFunction, fn.mode, fn.input)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
