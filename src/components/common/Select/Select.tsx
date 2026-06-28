import { ChevronDown } from 'lucide-react';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import styles from './Select.module.scss';

/**
 * Themed select. Renders a button trigger and, when open, a listbox portaled to
 * `<body>` and clamped to the viewport, never the OS-native `<select>` popup,
 * which renders off-screen / fails to open on the Y70 kiosk WebView. One control
 * for every surface (desktop, phone, Y70) so the dropdown looks and behaves the
 * same everywhere.
 *
 * Accepts a flat `options` array or `<option>` children (value + text, with a
 * per-option `className`/`disabled` carried through). optgroups are unsupported,
 * unused in this codebase.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  // Extra class on the option row (e.g. a styled "create new" affordance),
  // carried through from `<option className>` when options arrive as children.
  className?: string;
  // Glyph rendered before the label in both the trigger and the menu row (e.g.
  // a language flag). Decorative; the label carries the accessible text.
  icon?: ReactNode;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: readonly SelectOption[];
  children?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** 'standard' (default) renders the boxed dropdown chrome. 'ghost' drops the
   *  border and background so the value reads as text with just the chevron -
   *  used in contexts where the dropdown sits inside an already-bordered card
   *  (cooling fan / curve rows). */
  variant?: 'standard' | 'ghost';
  /** Tint the displayed value (selected label) with the accent color. */
  accentValue?: boolean;
  /** Dim the displayed value (selected label) with muted text color. */
  dimValue?: boolean;
}

// Trigger-to-menu gap and viewport-edge inset, px.
const GAP = 4;
const MARGIN = 8;
const MIN_MENU_HEIGHT = 96;
// The menu may grow past the trigger to fit its widest option, but no wider
// than this (base px) so one long label can't make it span the screen; it is
// also clamped to the viewport in reposition. Past the cap, the widest option
// ellipsizes.
const MAX_MENU_WIDTH = 448;
// Breathing room past the widest label so options aren't flush to the edge, px.
const MENU_WIDTH_PAD = 12;
const TYPEAHEAD_RESET_MS = 700;

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement(node)) return flattenText((node.props as { children?: ReactNode }).children);
  return '';
}

// Flat `<option>` children → option list.
function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, child => {
    if (!isValidElement(child) || child.type !== 'option') return;
    const p = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean; className?: string };
    out.push({ value: String(p.value ?? ''), label: flattenText(p.children), disabled: p.disabled, className: p.className });
  });
  return out;
}

function firstEnabled(opts: readonly SelectOption[]): number {
  return opts.findIndex(o => !o.disabled);
}
function lastEnabled(opts: readonly SelectOption[]): number {
  for (let i = opts.length - 1; i >= 0; i--) if (!opts[i].disabled) return i;
  return -1;
}
// Next enabled index wrapping in `dir`; returns `from` if none other is enabled.
function nextEnabled(opts: readonly SelectOption[], from: number, dir: 1 | -1): number {
  if (opts.length === 0) return -1;
  let i = from;
  for (let step = 0; step < opts.length; step++) {
    i = (i + dir + opts.length) % opts.length;
    if (!opts[i].disabled) return i;
  }
  return from;
}

interface MenuCoords { top: number; left: number; width: number; maxHeight: number; scale: number; }

export function Select({
  value, onChange, options, children, disabled,
  ariaLabel, className, variant = 'standard', accentValue, dimValue,
}: SelectProps) {
  const resolved = options ? options : optionsFromChildren(children);
  const selectedIndex = resolved.findIndex(o => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? resolved[selectedIndex].label : '';
  const selectedIcon = selectedIndex >= 0 ? resolved[selectedIndex].icon : undefined;

  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const typeahead = useRef({ buffer: '', time: 0 });
  const pendingOpenScroll = useRef(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // Anchor the menu under the trigger, flipping above when there's more room
  // there, and cap its height to the chosen side so a long list scrolls inside
  // the viewport instead of off-screen.
  //
  // The trigger may sit inside the panel's `scale(--panel-scale)` transform (the
  // Y70 kiosk scales its whole chrome up ~2.5x); the menu is portaled to <body>,
  // outside that transform, so left alone it renders at base size and its text
  // looks tiny next to the trigger. Measure the applied scale (transformed rect
  // width / untransformed offsetWidth) and re-apply it to the menu so its text
  // matches the trigger 1:1. offsetWidth is the layout box without transforms;
  // getBoundingClientRect includes them (see WidgetContextMenu). The menu is
  // sized in base px and scaled, so positions stay in real screen px.
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const baseWidth = trigger.offsetWidth || r.width;
    const scale = baseWidth > 0 ? r.width / baseWidth : 1;
    // Size the menu to its widest option, floored at the trigger width and
    // capped at MAX_MENU_WIDTH and the viewport (all base px, since the menu
    // carries the panel-zoom transform). Set the bounds, read the resolved
    // width back, then pin it as a fixed width so wrapping stays stable for the
    // scrollHeight measurement below. offsetWidth is the unscaled layout box.
    const maxWidth = Math.max(baseWidth, Math.min(MAX_MENU_WIDTH, (window.innerWidth - 2 * MARGIN) / scale));
    // Options clip (overflow:hidden) so labels past the cap ellipsize, but that
    // clip shrinks the menu's max-content below the label width. Neutralize it
    // while measuring so the menu sizes to the full widest label, then add a
    // small pad so options aren't cramped against the edge.
    const optionEls = Array.from(menu.children) as HTMLElement[];
    for (const o of optionEls) o.style.overflow = 'visible';
    menu.style.width = 'max-content';
    menu.style.minWidth = `${baseWidth}px`;
    menu.style.maxWidth = `${maxWidth}px`;
    const measured = menu.offsetWidth;
    for (const o of optionEls) o.style.overflow = '';
    const width = Math.min(maxWidth, measured + MENU_WIDTH_PAD);
    menu.style.width = `${width}px`;
    menu.style.minWidth = '';
    menu.style.maxWidth = '';
    const visualWidth = width * scale;
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    const placeBelow = spaceBelow >= spaceAbove;
    const avail = Math.max(MIN_MENU_HEIGHT, (placeBelow ? spaceBelow : spaceAbove) - GAP);
    // scrollHeight is content+padding; max-height is border-box (global
    // box-sizing), so add the vertical border or the menu scrolls by the border
    // width even when every option fits. offsetHeight-clientHeight is the
    // vertical border (x-overflow is hidden, so no horizontal scrollbar in it).
    // Unscaled; visual = * scale.
    const naturalHeight = menu.scrollHeight + (menu.offsetHeight - menu.clientHeight);
    const visualHeight = Math.min(naturalHeight * scale, avail);
    const top = placeBelow ? r.bottom + GAP : r.top - GAP - visualHeight;
    const maxLeft = window.innerWidth - visualWidth - MARGIN;
    const left = Math.max(Math.min(MARGIN, maxLeft), Math.min(r.left, maxLeft));
    const clampedTop = Math.max(MARGIN, Math.min(top, window.innerHeight - visualHeight - MARGIN));
    setCoords({ top: clampedTop, left, width, maxHeight: visualHeight / scale, scale });
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setCoords(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled(resolved));
    pendingOpenScroll.current = true;
    setOpen(true);
  };

  const commit = (next: string) => {
    onChange(next);
    close(true);
  };

  // Render the menu hidden first so its content size is measurable, then fit
  // width, cap height, and position.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition, resolved.length]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    // Capture scroll also fires for the menu's own overflow scrolling, which
    // doesn't move the trigger; only reposition on scrolls outside the menu.
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) reposition(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, close, reposition]);

  // On open, once reposition has sized the menu (coords set), center the
  // selected option. scrollIntoView/nearest can't do this at open time: the
  // menu is briefly full-height (nothing overflows) until maxHeight lands, and
  // the nav effect below doesn't depend on coords so it never re-fires. Layout
  // effect so scrollTop commits before paint.
  useLayoutEffect(() => {
    if (!open || !coords || !pendingOpenScroll.current) return;
    pendingOpenScroll.current = false;
    const menu = menuRef.current;
    const target = activeIndex >= 0 ? activeIndex : selectedIndex;
    const el = target >= 0 ? (menu?.children[target] as HTMLElement | undefined) : undefined;
    if (menu && el) menu.scrollTop = Math.max(0, el.offsetTop - (menu.clientHeight - el.offsetHeight) / 2);
  }, [open, coords, activeIndex, selectedIndex]);

  // Keep the active option visible during keyboard nav (minimal scroll).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    (menuRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openMenu();
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex(i => nextEnabled(resolved, i, 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIndex(i => nextEnabled(resolved, i, -1)); break;
      case 'Home': e.preventDefault(); setActiveIndex(firstEnabled(resolved)); break;
      case 'End': e.preventDefault(); setActiveIndex(lastEnabled(resolved)); break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const opt = resolved[activeIndex];
        if (opt && !opt.disabled) commit(opt.value);
        break;
      }
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.buffer = (now - ta.time > TYPEAHEAD_RESET_MS ? '' : ta.buffer) + e.key.toLowerCase();
          ta.time = now;
          const match = resolved.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(ta.buffer));
          if (match >= 0) setActiveIndex(match);
        }
    }
  };

  return (
    <span ref={wrapperRef} className={classNames(styles.wrapper, variant === 'ghost' && styles.ghost, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => { if (disabled) return; if (open) close(); else openMenu(); }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={classNames(styles.value, accentValue && styles.accentValue, dimValue && styles.dimValue)}>
          {selectedIcon && <span className={styles.optionIcon} aria-hidden="true">{selectedIcon}</span>}
          {selectedLabel}
        </span>
      </button>
      <ChevronDown
        className={styles.chevron}
        size={14}
        strokeWidth={2}
        // eslint-disable-next-line i18next/no-literal-string -- decorative-icon aria flag
        aria-hidden="true"
      />
      {open && createPortal(
        <ul
          ref={menuRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className={styles.menu}
          style={{
            position: 'fixed',
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            width: coords?.width,
            maxHeight: coords?.maxHeight,
            // Match the trigger's transform scale (it's inside the panel zoom;
            // the menu is portaled out of it). Origin top-left so the box grows
            // from the anchor point computed in screen px.
            transform: coords ? `scale(${coords.scale})` : undefined,
            transformOrigin: 'top left',
            visibility: coords ? 'visible' : 'hidden',
          }}
          onKeyDown={onMenuKeyDown}
        >
          {resolved.map((opt, i) => (
            <li
              key={`${opt.value}-${i}`}
              id={optionId(i)}
              role="option"
              // Surfaces the full label when an option ellipsizes.
              title={opt.label}
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled || undefined}
              className={classNames(
                styles.option,
                opt.className,
                i === activeIndex && styles.active,
                opt.value === value && styles.selected,
                opt.disabled && styles.optionDisabled,
              )}
              onPointerEnter={() => { if (!opt.disabled) setActiveIndex(i); }}
              onClick={() => { if (!opt.disabled) commit(opt.value); }}
            >
              {opt.icon && <span className={styles.optionIcon} aria-hidden="true">{opt.icon}</span>}
              {opt.label}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </span>
  );
}
