import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { ChevronDown, Settings } from 'lucide-react';
import { FocusModesModal } from './FocusModesModal';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useFocus } from '../hooks/useFocus';
import { useTranslation } from '../lib/i18n';
import { focusIcon } from './focusIcons';
import styles from './FocusChip.module.scss';

// Breathing room between the label and whatever the bar puts next to it. The
// rest of the header stays draggable either way, so this is a visual gap, not
// a drag budget - reserving a slab of it kept the label hidden on windows with
// obvious room to spare.
const MIN_LABEL_GAP_PX = 32;

/**
 * Focus indicator and switch in the top bar's left cluster, next to the
 * fullscreen toggle. The icon is the active mode's own, falling back to the
 * generic focus mark while nothing is active; when a mode is active its
 * subject is named beside the icon, but only while the bar has room for it.
 */
export function FocusChip({ online }: { online: boolean }) {
  const { t } = useTranslation();
  const { status, activate, turnOff } = useFocus(online);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [labelFits, setLabelFits] = useState(false);
  useClickOutside(ref, () => setOpen(false), open);

  const active = status?.modes.find(m => m.id === status.activeModeId) ?? null;
  const runningGame = status && status.games.length > 0
    ? status.games[status.games.length - 1].name
    : null;
  // What the mode is actually holding the machine for, falling back to the
  // mode's own name for a trigger that names nothing (OBS, manual).
  const label = active ? runningGame ?? active.name : '';

  // Measured from the hidden twin, never from the rendered label, so showing it
  // cannot change the input that decided to show it.
  const remeasure = useCallback(() => {
    const wrap = ref.current;
    const twin = measureRef.current;
    const header = wrap?.closest('header');
    if (!wrap || !twin || !header) return;

    const needed = twin.getBoundingClientRect().width;
    if (needed === 0) return;

    const headerBox = header.getBoundingClientRect();
    const arrows = header.querySelector('[data-topbar-arrows]');
    // The search pill is absolutely centred at a fixed width, so the space the
    // left cluster may grow into ends at the arrows, or at the pill's edge when
    // this build renders none.
    const searchWidth = parseFloat(getComputedStyle(header).getPropertyValue('--search-w')) || 0;
    const boundary = arrows
      ? arrows.getBoundingClientRect().left
      : headerBox.left + headerBox.width / 2 - searchWidth / 2;

    const bare = wrap.getBoundingClientRect().right - (labelFits ? needed : 0);
    setLabelFits(boundary - bare - MIN_LABEL_GAP_PX >= needed);
  }, [labelFits]);

  useLayoutEffect(() => {
    if (!label) {
      setLabelFits(false);
      return;
    }
    remeasure();
  }, [label, remeasure]);

  useEffect(() => {
    if (!label) return;
    const header = ref.current?.closest('header');
    if (!header) return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(header);
    return () => observer.disconnect();
  }, [label, remeasure]);

  if (!status) return null;

  const held: string[] = [];
  if (active?.holdNotifications) held.push(t('focus.effect.notifications'));
  if (active?.holdBackgroundTraffic) held.push(t('focus.effect.traffic'));
  if (active?.turnPanelDisplaysOff) held.push(t('focus.effect.panelsOff'));

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
          <span className={styles.icon}>{focusIcon(active?.icon ?? 'focus', 19)}</span>
          {label && labelFits && <span className={styles.label}>{label}</span>}
          <ChevronDown size={12} className={styles.caret} />
        </button>
      </HoverTooltip>
      {/* Out of flow, so the width it reports is the label's cost whether or not
          the label is currently rendered. */}
      {label && <span ref={measureRef} className={styles.labelMeasure} aria-hidden>{label}</span>}
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
            onClick={() => { setOpen(false); setSettingsOpen(true); }}
          >
            <span className={styles.itemIcon}><Settings size={14} /></span>
            {t('nav.settings')}
          </button>
        </div>
      )}
      {/* Mounted only while open: it runs its own useFocus, so leaving it
          mounted doubles the status fetch and the topic subscription. */}
      {settingsOpen && (
        <FocusModesModal
          open
          onClose={() => setSettingsOpen(false)}
          serviceOnline={online}
        />
      )}
    </div>
  );
}
