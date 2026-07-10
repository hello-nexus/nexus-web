import type { ReactNode } from 'react';
import { Gamepad2, LayoutGrid } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import styles from './DeckRail.module.scss';

export interface DeckRailProps {
  decks: StreamDeckSummary[];
  /** null selects the touch widget itself. */
  activeSerial: string | null;
  onSelectWidget: () => void;
  onSelectDeck: (serial: string) => void;
}

/**
 * Left rail of edit targets shown in the Deck editing surface once at least
 * one physical Stream Deck is detected: "This widget" plus one row per
 * physical deck (model icon, user name, connection dot). Absent entirely
 * when no physical deck is connected - see DeckSettings.
 */
export function DeckRail({ decks, activeSerial, onSelectWidget, onSelectDeck }: DeckRailProps) {
  const { t } = useTranslation();
  return (
    <nav className={styles.rail} aria-label={t('panel.settings.deck.rail.ariaLabel')}>
      <RailItem
        icon={<LayoutGrid size={16} aria-hidden="true" />}
        label={t('panel.settings.deck.rail.thisWidget')}
        selected={activeSerial === null}
        onClick={onSelectWidget}
      />
      {decks.map(d => (
        <RailItem
          key={d.serial}
          icon={<Gamepad2 size={16} aria-hidden="true" />}
          label={d.name}
          selected={activeSerial === d.serial}
          connected={d.connected}
          disconnectedHint={t('panel.settings.deck.rail.disconnectedHint')}
          onClick={() => onSelectDeck(d.serial)}
        />
      ))}
    </nav>
  );
}

interface RailItemProps {
  icon: ReactNode;
  label: string;
  selected: boolean;
  connected?: boolean;
  disconnectedHint?: string;
  onClick: () => void;
}

function RailItem({ icon, label, selected, connected, disconnectedHint, onClick }: RailItemProps) {
  return (
    <button
      type="button"
      className={`${styles.item} ${selected ? styles.itemSelected : ''}`}
      aria-pressed={selected}
      title={connected === false ? disconnectedHint : undefined}
      onClick={onClick}
    >
      <span className={styles.itemIcon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {connected !== undefined && (
        <span className={styles.dot} data-connected={connected} aria-hidden="true" />
      )}
    </button>
  );
}
