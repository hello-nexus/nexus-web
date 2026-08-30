import { useRef, useState } from 'react';
import classNames from 'classnames';
import { Gamepad2, Settings } from 'lucide-react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useGameMode } from '../hooks/useGameMode';
import { useTranslation } from '../lib/i18n';
import type { GameModeSetting, GameModeStatus } from '../api/gameMode';
import styles from './GameModeChip.module.scss';

const STATES: readonly GameModeSetting[] = ['auto', 'on', 'off'];

/** Elapsed minutes since activation, floored; 0 reads as "just now" upstream. */
function elapsedMinutes(activatedUtcMs: number): number {
  if (!activatedUtcMs) return 0;
  return Math.max(0, Math.floor((Date.now() - activatedUtcMs) / 60_000));
}

function heldSummary(status: GameModeStatus, t: (k: string) => string): string[] {
  const held: string[] = [];
  if (status.effects.holdNotifications) held.push(t('gameMode.effect.notifications'));
  if (status.effects.holdBackgroundNetwork) held.push(t('gameMode.effect.network'));
  if (status.effects.turnPanelDisplaysOff) held.push(t('gameMode.effect.displaysOff'));
  if (status.effects.stopPanelRendering) held.push(t('gameMode.effect.renderStop'));
  return held;
}

/**
 * Active-mode indicator in the top bar's left cluster, next to the fullscreen
 * toggle. Renders nothing unless Game Mode is active; the label is the running
 * game, falling back to the mode name when it was switched on by hand.
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

  if (!status?.active) return null;

  const label = status.games.length > 0
    ? status.games[status.games.length - 1].name
    : t('gameMode.title');
  const extra = status.games.length > 1 ? status.games.length - 1 : 0;
  const held = heldSummary(status, t);
  const minutes = elapsedMinutes(status.activatedUtcMs);

  const tooltip = [
    t('gameMode.tooltip.active'),
    held.length > 0 ? held.join(', ') : t('gameMode.tooltip.nothingHeld'),
    minutes > 0 ? t('gameMode.tooltip.forMinutes').replace('{minutes}', String(minutes)) : '',
  ].filter(Boolean).join(' - ');

  return (
    <div className={styles.wrap} ref={ref}>
      <HoverTooltip body={tooltip} side="bottom">
        <button
          type="button"
          className={classNames(styles.chip, { [styles.chipOpen]: open })}
          onClick={() => setOpen(o => !o)}
          aria-label={`${t('gameMode.title')}: ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Gamepad2 size={18} />
          <span className={styles.label}>{label}</span>
          {extra > 0 && <span className={styles.extra}>+{extra}</span>}
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
