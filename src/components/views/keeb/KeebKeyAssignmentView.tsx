import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { SetLayerKeyBody } from '../../../api/keeb';
import {
  ASSIGNMENT_CATEGORIES,
  getAssignmentCategories,
  type KeebAssignmentCategory,
} from './keebCategories';
import styles from './KeebKeyAssignmentView.module.scss';

export interface KeebKeyAssignmentViewProps {
  selected: { x: number; y: number } | null;
  setKey: (body: SetLayerKeyBody) => Promise<void>;
  resetLayer: () => Promise<void>;
}

/// Key Assignment tab body. Category tabs at the top + a 2-column grid of
/// titled sections below. Clicking a function tile writes through to the
/// currently selected physical key (set in the modal by clicking on the
/// keyboard render above).
///
/// `Keyboard` category is intentionally omitted — keyboard-to-keyboard
/// reassignment uses drag-from-keyboard in a future pass (spec §4.4).
export function KeebKeyAssignmentView({
  selected,
  setKey,
  resetLayer,
}: KeebKeyAssignmentViewProps) {
  const [category, setCategory] = useState<KeebAssignmentCategory>('Mouse');
  const [confirmReset, setConfirmReset] = useState(false);

  const categories = useMemo(() => getAssignmentCategories(), []);
  const groups = categories[category];

  const onTile = async (keyFunction: string, mode: SetLayerKeyBody['mode'], input?: number | null) => {
    if (!selected) return;
    await setKey({ x: selected.x, y: selected.y, func: keyFunction, mode, input: input ?? null });
  };

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
        <nav className={styles.categoryTabs} role="tablist">
          {ASSIGNMENT_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              className={`${styles.categoryTab} ${category === cat ? styles.categoryTabActive : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={`${styles.resetBtn} ${confirmReset ? styles.resetBtnConfirm : ''}`}
          onClick={onReset}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {confirmReset ? 'Are you sure?' : 'Reset Layer'}
        </button>
      </header>

      {disabled && (
        <p className={styles.hint}>
          Click a key on the keyboard above first, then pick a function to assign.
        </p>
      )}

      <div className={styles.grid}>
        {groups.map(group => (
          <section key={group.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            {group.sections.map(section => (
              <div key={section.title} className={styles.section}>
                <h4 className={styles.sectionTitle}>{section.title}</h4>
                <div className={styles.tiles}>
                  {section.functions.map(fn => (
                    <button
                      key={fn.keyFunction}
                      type="button"
                      className={styles.tile}
                      disabled={disabled}
                      title={fn.keyFunction}
                      onClick={() => void onTile(fn.keyFunction, fn.mode, fn.input)}
                    >
                      {fn.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
