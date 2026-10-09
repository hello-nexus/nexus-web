import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import { DeckGrid, type DeckGridProps } from './DeckGrid';
import { DeckDialKnob, DeckDialSegment } from './DeckDialControls';
import { deckKeyAspect, deckPreviewLayout, dialLiveTile } from './deckDials';
import type { DeckDial } from './types';
import styles from './DeckDevicePreview.module.scss';

type PreviewDeck = Pick<StreamDeckSummary, 'encoders' | 'dialPlacement' | 'screen' | 'touchKeys' | 'encoderRingLeds' | 'keyWidth' | 'keyHeight'>;

export interface DeckDevicePreviewProps {
  deck: PreviewDeck;
  /** The keys grid; this component adds the model-specific aspect, spacing and dial controls. */
  grid: DeckGridProps;
  /** Dials of the current page + folder view, one per encoder. */
  dials: DeckDial[];
  selectedDial: number | null;
  onSelectDial: (index: number) => void;
}

const SIDE_KNOB_RESERVE_PX = 130;
const DENSE_COLS = 12;

/** Keys plus the model's dials, touch strip or screen, and Neo touch keys, arranged like the hardware. */
export function DeckDevicePreview({ deck, grid, dials, selectedDial, onSelectDial }: DeckDevicePreviewProps) {
  const layout = deckPreviewLayout(deck);
  const encoders = deck.encoders ?? 0;
  const ringLeds = deck.encoderRingLeds ?? 0;
  const keyAspect = deckKeyAspect(deck);
  const dense = grid.cols >= DENSE_COLS;
  const { liveTiles, page = 0, folderPath = [] } = grid;

  const segment = (i: number, aspect: number) => (
    <DeckDialSegment
      key={i}
      dial={dials[i] ?? {}}
      index={i}
      selected={selectedDial === i}
      onSelect={onSelectDial}
      liveSrc={dialLiveTile(liveTiles, page, folderPath, i)}
      aspect={aspect}
    />
  );
  const knob = (i: number) => (
    <DeckDialKnob key={i} dial={dials[i] ?? {}} index={i} selected={selectedDial === i} onSelect={onSelectDial} ringLeds={ringLeds} />
  );
  const columns = (n: number): CSSProperties => ({ gridTemplateColumns: `repeat(${n}, 1fr)` });
  const segmentAspect = deck.screen && encoders > 0 ? deck.screen.width / encoders / deck.screen.height : 2;
  const indices = Array.from({ length: encoders }, (_, i) => i);

  const keys = <DeckGrid {...grid} keyAspect={keyAspect} dense={dense} reservedWidth={layout === 'dialsSides' ? SIDE_KNOB_RESERVE_PX : 0} />;

  if (layout === 'dialsBelow') {
    return (
      <div className={styles.root}>
        {keys}
        <div className={`${styles.inset} ${styles.strip}`} style={columns(encoders)}>{indices.map(i => segment(i, segmentAspect))}</div>
        <div className={`${styles.inset} ${styles.strip}`} style={{ ...columns(encoders), justifyItems: 'center' }}>{indices.map(knob)}</div>
      </div>
    );
  }

  if (layout === 'dialsAbove') {
    const split = Math.ceil(encoders / 2);
    return (
      <div className={styles.root}>
        <div className={`${styles.inset} ${styles.aboveRow}`}>
          <div className={styles.knobRow}>{indices.slice(0, split).map(knob)}</div>
          <div className={styles.screenSegments} style={columns(encoders)}>{indices.map(i => segment(i, segmentAspect))}</div>
          <div className={styles.knobRow}>{indices.slice(split).map(knob)}</div>
        </div>
        {keys}
      </div>
    );
  }

  if (layout === 'dialsSides') {
    const split = Math.ceil(encoders / 2);
    return (
      <div className={styles.sidesRow}>
        {indices.slice(0, split).map(knob)}
        {keys}
        {indices.slice(split).map(knob)}
      </div>
    );
  }

  if (layout === 'infoScreen') {
    const info = liveTiles?.get(`${page}:info`) ?? liveTiles?.get('info');
    const aspect = deck.screen ? deck.screen.width / deck.screen.height : 4;
    const touchKeys = (deck.touchKeys ?? 0) >= 2;
    return (
      <div className={styles.root}>
        {keys}
        <div className={`${styles.inset} ${touchKeys ? styles.infoRow : ''}`}>
          {touchKeys && <span className={styles.touchKey} aria-hidden><ChevronLeft size={20} /></span>}
          <span className={styles.infoScreen} style={{ '--info-aspect': aspect } as CSSProperties}>
            {info ? <img src={info} draggable={false} alt="" className={styles.infoImage} /> : <Clock size={20} aria-hidden />}
          </span>
          {touchKeys && <span className={styles.touchKey} aria-hidden><ChevronRight size={20} /></span>}
        </div>
      </div>
    );
  }

  return keys;
}
