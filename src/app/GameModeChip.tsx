import { useRef, useState } from 'react';
import classNames from 'classnames';
import { ChevronDown, Gamepad2, Settings } from 'lucide-react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useGameMode } from '../hooks/useGameMode';
import { useTranslation } from '../lib/i18n';
import type { GameModeSetting, GameModeStatus } from '../api/gameMode';
import styles from './GameModeChip.module.scss';

const STATES: readonly GameModeSetting[] = ['auto', 'on', 'off'];

function heldSummary(status: GameModeStatus, t: (k: string) => string): string[] {
  const held: string[] = [];
  if (status.effects.holdNotifications) held.push(t('gameMode.effect.notifications'));
  if (status.effects.holdBackgroundNetwork) held.push(t('gameMode.effect.network'));
  if (status.effects.turnPanelDisplaysOff) held.push(t('gameMode.effect.displaysOff'));
  return held;
}

/**
 * Game Mode indicator and switch, in the top bar's left cluster next to the
 * fullscreen toggle. Always present so it doubles as the manual on/off: while
 * inactive it is a muted "Game Mode" chip, while active it goes accent and
 * shows the running game.
 */
export function GameModeChip({ online, onNavigateSettings }: {
  online: boolean;
  onNavigateSettings: () => void;
}) {
  const { t } = useTranslation();
  const { status, setState } = useGameMode(online);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  if (!status) return null;

  const active = status.active;
  const label = active && status.games.length > 0
    ? status.games[status.games.length - 1].name
    : t('gameMode.title');
  const extra = status.games.length > 1 ? status.games.length - 1 : 0;

  const held = heldSummary(status, t);
  const tooltip = active
    ? [
        t('gameMode.tooltip.active'),
        held.length > 0 ? held.join(', ') : t('gameMode.tooltip.nothingHeld'),
      ].join(' - ')
    : t(`gameMode.state.${status.state}`);

  return (
    <div className={styles.wrap} ref={ref}>
      <HoverTooltip body={tooltip} side="bottom">
        <button
          type="button"
          className={classNames(styles.chip, {
            [styles.chipActive]: active,
            [styles.chipOpen]: open,
          })}
          onClick={() => setOpen(o => !o)}
          aria-label={`${t('gameMode.title')}: ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Gamepad2 size={15} className={styles.icon} />
          <span className={styles.label}>{label}</span>
          {extra > 0 && <span className={styles.extra}>+{extra}</span>}
          <ChevronDown size={13} className={styles.caret} />
        </button>
      </HoverTooltip>
      {open && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.heading}>{t('gameMode.title')}</div>
          {STATES.map(value => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={status.state === value}
              className={classNames(styles.item, { [styles.itemActive]: status.state === value })}
              onClick={() => { setOpen(false); void setState(value); }}
            >
              {t(`gameMode.state.${value}`)}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onNavigateSettings(); }}
          >
            <Settings size={14} /> {t('nav.settings')}
          </button>
        </div>
      )}
    </div>
  );
}
