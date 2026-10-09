import type { CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DECK_ICONS } from './deckIcons';
import { dialAutoIconName, dialIsEmpty, dialShowsBar, isDialStack, shownDialEntry } from './deckDials';
import type { DeckDial } from './types';
import styles from './DeckDialControls.module.scss';

/** Segment title: the entry's label, else its action's default title. */
function useDialTitle(entry: DeckDial): string {
  const { t } = useTranslation();
  if (entry.label) return entry.label;
  const action = entry.action;
  if (!action) return '';
  if (action.type === 'monitoring' && action.labelText) return action.labelText;
  if (action.type === 'appVolume' && action.appName) return action.appName;
  return t(`panel.settings.deck.dial.action.${action.type}`);
}

function dialAccent(entry: DeckDial): string {
  return entry.color ?? 'var(--accent)';
}

function DialGlyph({ entry }: { entry: DeckDial }) {
  if (entry.icon?.kind === 'emoji') return <span className={styles.emoji}>{entry.icon.value}</span>;
  const name = entry.icon?.kind === 'lucide' ? entry.icon.value : dialAutoIconName(entry.action);
  const Icon = DECK_ICONS[name] ?? Plus;
  return <Icon aria-hidden />;
}

export interface DeckDialSegmentProps {
  dial: DeckDial;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
  /** Data URI of the service's own render of this segment; absent shows the CSS stand-in. */
  liveSrc?: string;
  /** Segment width over height. */
  aspect: number;
}

/** One dial's slice of the touch strip or screen: selectable, draggable to reorder, a drop target for dial actions. */
export function DeckDialSegment({ dial, index, selected, onSelect, liveSrc, aspect }: DeckDialSegmentProps) {
  const { t } = useTranslation();
  const entry = shownDialEntry(dial);
  const title = useDialTitle(entry);
  const empty = dialIsEmpty(dial);
  const id = `dial:${index}`;
  const drag = useDraggable({ id, disabled: empty });
  const drop = useDroppable({ id });
  const setRef = (el: HTMLElement | null) => { drag.setNodeRef(el); drop.setNodeRef(el); };
  const style = {
    '--dial-accent': dialAccent(entry),
    '--dial-aspect': aspect,
    transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined,
    zIndex: drag.isDragging ? 5 : undefined,
    opacity: drag.isDragging ? 0.85 : undefined,
  } as CSSProperties;
  const stackSize = isDialStack(dial) ? dial.stack!.length : 0;
  return (
    <button
      ref={setRef}
      type="button"
      {...drag.attributes}
      {...drag.listeners}
      data-deck-dial-index={index}
      className={[
        styles.segment,
        empty ? styles.segmentEmpty : '',
        selected ? styles.selected : '',
        drop.isOver && !drag.isDragging ? styles.dropOver : '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-pressed={selected}
      aria-label={t('panel.settings.deck.dial.segmentAria', { n: index + 1 })}
      onClick={e => { e.stopPropagation(); onSelect(index); }}
    >
      {liveSrc && !empty ? (
        <img src={liveSrc} draggable={false} alt="" className={styles.segmentImage} />
      ) : empty ? (
        <span className={styles.segmentFace}><span className={styles.segmentContent}><span className={styles.segmentPlus}><Plus aria-hidden /></span></span></span>
      ) : (
        <span className={styles.segmentFace}>
          <span className={styles.segmentContent}>
            <span className={styles.segmentTitle}>{title}</span>
            <span className={styles.segmentIcon}><DialGlyph entry={entry} /></span>
            {dialShowsBar(entry.action) && (
              <span className={styles.segmentBar}><span className={styles.segmentBarFill} /></span>
            )}
          </span>
        </span>
      )}
      {stackSize > 0 && (
        <span className={styles.stackDots} aria-hidden>
          {Array.from({ length: stackSize }, (_, i) => <span key={i} className={i === 0 ? styles.stackDotActive : styles.stackDot} />)}
        </span>
      )}
    </button>
  );
}

export interface DeckDialKnobProps {
  dial: DeckDial;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
  /** LEDs in the ring around the knob; a ring is drawn only when above zero. */
  ringLeds: number;
}

/** The physical knob: selectable and a drop target for dial actions. */
export function DeckDialKnob({ dial, index, selected, onSelect, ringLeds }: DeckDialKnobProps) {
  const { t } = useTranslation();
  const drop = useDroppable({ id: `knob:${index}` });
  const entry = shownDialEntry(dial);
  const style = { '--dial-accent': dialAccent(entry) } as CSSProperties;
  return (
    <button
      ref={drop.setNodeRef}
      type="button"
      data-deck-knob-index={index}
      className={[
        styles.knob,
        ringLeds > 0 ? styles.knobRing : '',
        selected ? styles.selected : '',
        drop.isOver ? styles.dropOver : '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-pressed={selected}
      aria-label={t('panel.settings.deck.dial.knobAria', { n: index + 1 })}
      onClick={e => { e.stopPropagation(); onSelect(index); }}
    >
      <span className={styles.knobCap}>{index + 1}</span>
    </button>
  );
}
