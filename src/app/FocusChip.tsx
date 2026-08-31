import { useRef, useState } from 'react';
import classNames from 'classnames';
import { ChevronDown, Settings } from 'lucide-react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useFocus } from '../hooks/useFocus';
import { useTranslation } from '../lib/i18n';
import { focusIcon } from './focusIcons';
import styles from './FocusChip.module.scss';

/**
 * Focus indicator and switch in the top bar's left cluster, next to the
 * fullscreen toggle. Icon plus a chevron, no label: the icon is the active
 * mode's own, falling back to the generic focus mark while nothing is active.
 */
export function FocusChip({ online, onNavigateSettings }: {
  online: boolean;
  onNavigateSettings: () => void;
}) {
  const { t } = useTranslation();
  const { status, activate, turnOff } = useFocus(online);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  if (!status) return null;

  const active = status.modes.find(m => m.id === status.activeModeId) ?? null;
  const held: string[] = [];
  if (active?.holdNotifications) held.push(t('focus.effect.notifications'));
  if (active?.holdBackgroundTraffic) held.push(t('focus.effect.traffic'));
  if (active?.turnPanelDisplaysOff) held.push(t('focus.effect.panelsOff'));

  const runningGame = status.games.length > 0
    ? status.games[status.games.length - 1].name
    : null;
  const tooltip = active
    ? [
        runningGame ? `${active.name} - ${runningGame}` : active.name,
        held.length > 0 ? held.join(', ') : t('focus.tooltip.nothingHeld'),
      ].join(' - ')
    : t('focus.tooltip.idle');

  return (
    <div className={styles.wrap} ref={ref}>
      <HoverTooltip body={tooltip} side="bottom">
        <button
          type="button"
          className={classNames(styles.chip, {
            [styles.chipActive]: !!active,
            [styles.chipOpen]: open,
          })}
          onClick={() => setOpen(o => !o)}
          aria-label={active ? `${t('focus.title')}: ${active.name}` : t('focus.title')}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className={styles.icon}>{focusIcon(active?.icon ?? 'focus', 16)}</span>
          <ChevronDown size={12} className={styles.caret} />
        </button>
      </HoverTooltip>
      {open && (
        <div className={styles.dropdown} role="menu">
          {status.modes.map(mode => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === status.activeModeId}
              className={classNames(styles.item, {
                [styles.itemActive]: mode.id === status.activeModeId,
              })}
              onClick={() => { setOpen(false); void activate(mode.id); }}
            >
              <span className={styles.itemIcon}>{focusIcon(mode.icon, 14)}</span>
              {mode.name}
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={status.activeModeId === null}
            className={classNames(styles.item, {
              [styles.itemActive]: status.activeModeId === null,
            })}
            onClick={() => { setOpen(false); void turnOff(); }}
          >
            <span className={styles.itemIcon} />
            {t('focus.off')}
          </button>
          <div className={styles.separator} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onNavigateSettings(); }}
          >
            <span className={styles.itemIcon}><Settings size={14} /></span>
            {t('nav.settings')}
          </button>
        </div>
      )}
    </div>
  );
}
