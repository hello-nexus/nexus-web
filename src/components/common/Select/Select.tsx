import { ChevronDown, Search } from 'lucide-react';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../../lib/i18n';
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
 *
 * A long dropdown grows an in-menu search field: on a device that has a fine
 * pointer and hover (mouse/keyboard desktop; not touch phones or the touch
 * kiosk) and once the list reaches SEARCH_MIN_OPTIONS, the open menu focuses a
 * search input that substring-filters the options. Arrow keys still walk the
 * (filtered) list and highlight the active row while focus stays in the input,
 * so typing narrows and Enter commits without leaving the keyboard.
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
  // Renders a thin rule instead of a selectable row, grouping the options above
  // and below it. Non-navigable and removed from the a11y tree; value/label are
  // ignored.
  divider?: boolean;
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
  /** Shown dimmed when no option matches `value`. */
  placeholder?: string;
  /** Pins the trigger to an exact height (px), overriding its default
   *  content-driven padding - for aligning the control against a sibling of
   *  a fixed height (e.g. the monitoring history range picker matching the
   *  seek-bar block). Content stays vertically centered (.trigger is
   *  already a flex row). Omit to keep the default intrinsic height. */
  height?: number;
  /** Trigger shows only the selected option's icon - no label text, no
   *  chevron - for compact icon controls (e.g. a header language flag). The
   *  label still renders when the selected option has no icon, and the open
   *  menu is unchanged (icon + label rows). The selected label moves to the
   *  trigger's title since the text is no longer visible. */
  triggerIconOnly?: boolean;
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

// The in-menu search field appears only from this many entries up; below it a
// short list is faster to eyeball than to type.
const SEARCH_MIN_OPTIONS = 8;
// The search field is a keyboard affordance: only offer it where there is a
// real keyboard and pointer. `(hover: hover) and (pointer: fine)` is true on a
// mouse/trackpad desktop and false on touch phones and the touch kiosk, which
// have no keyboard to type into it.
function supportsPointerSearch(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

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

// Case-insensitive substring filter. An empty query keeps the list intact
// (dividers included); a non-empty query drops dividers, which only group the
// full list and read as noise once it is narrowed.
function filterOptions(opts: readonly SelectOption[], raw: string): readonly SelectOption[] {
  const needle = raw.trim().toLowerCase();
  if (!needle) return opts;
  return opts.filter(o => !o.divider && o.label.toLowerCase().includes(needle));
}

// Dividers and disabled options are never focusable or selectable.
function selectable(o: SelectOption): boolean {
  return !o.disabled && !o.divider;
}
function firstEnabled(opts: readonly SelectOption[]): number {
  return opts.findIndex(selectable);
}
function lastEnabled(opts: readonly SelectOption[]): number {
  for (let i = opts.length - 1; i >= 0; i--) if (selectable(opts[i])) return i;
  return -1;
}
// Next enabled index wrapping in `dir`; returns `from` if none other is enabled.
function nextEnabled(opts: readonly SelectOption[], from: number, dir: 1 | -1): number {
  if (opts.length === 0) return -1;
  let i = from;
  for (let step = 0; step < opts.length; step++) {
    i = (i + dir + opts.length) % opts.length;
    if (selectable(opts[i])) return i;
  }
  return from;
}

interface MenuCoords { top: number; left: number; width: number; maxHeight: number; scale: number; }

export function Select({
  value, onChange, options, children, disabled,
  ariaLabel, className, variant = 'standard', accentValue, placeholder, height,
  triggerIconOnly,
}: SelectProps) {
  const { t } = useTranslation();
  const resolved = options ? options : optionsFromChildren(children);
  const selectedIndex = resolved.findIndex(o => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? resolved[selectedIndex].label : '';
  const selectedIcon = selectedIndex >= 0 ? resolved[selectedIndex].icon : undefined;
  const showPlaceholder = selectedIndex < 0 && placeholder != null;

  // Offer the search field only on a keyboard/pointer device and once the list
  // is long enough to be worth typing through. The device class is read once
  // per mount; it does not change mid-session.
  const [pointerSearch] = useState(supportsPointerSearch);
  const searchEnabled =
    pointerSearch && resolved.filter(o => !o.divider).length >= SEARCH_MIN_OPTIONS;

  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // menuRef is the portaled box (search field + list); listRef is the scrolling
  // option list inside it. Positioning sizes the box; scrolling and per-option
  // measurement target the list.
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const typeahead = useRef({ buffer: '', time: 0 });
  const pendingOpenScroll = useRef(false);
  // Pinned menu width for the current open session so filtering does not resize
  // the box as the list narrows. Reset on every open/close.
  const openWidthRef = useRef<number | null>(null);
  // Focus lands once per open, after the menu is visible. Reset on open/close.
  const didFocusRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState('');

  // The options the menu currently renders: filtered while a query is present,
  // the full list otherwise. activeIndex indexes into this.
  const visible = searchEnabled ? filterOptions(resolved, query) : resolved;

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const activeDescendant = activeIndex >= 0 ? optionId(activeIndex) : undefined;

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
    const list = listRef.current;
    if (!trigger || !menu || !list) return;
    const r = trigger.getBoundingClientRect();
    const baseWidth = trigger.offsetWidth || r.width;
    const scale = baseWidth > 0 ? r.width / baseWidth : 1;
    const maxWidth = Math.max(baseWidth, Math.min(MAX_MENU_WIDTH, (window.innerWidth - 2 * MARGIN) / scale));
    // Size the menu to its widest option, floored at the trigger width and
    // capped at MAX_MENU_WIDTH and the viewport (all base px, since the menu
    // carries the panel-zoom transform), then pin that width for the session so
    // filtering does not reflow the box. Options clip (overflow:hidden) so
    // labels past the cap ellipsize, but that clip shrinks the menu's
    // max-content below the label width; neutralize it while measuring so the
    // menu sizes to the full widest label, then add a small pad. offsetWidth is
    // the unscaled layout box.
    let width = openWidthRef.current;
    if (width == null) {
      const optionEls = Array.from(list.children) as HTMLElement[];
      for (const o of optionEls) o.style.overflow = 'visible';
      menu.style.width = 'max-content';
      menu.style.minWidth = `${baseWidth}px`;
      menu.style.maxWidth = `${maxWidth}px`;
      const measured = menu.offsetWidth;
      for (const o of optionEls) o.style.overflow = '';
      width = Math.min(maxWidth, measured + MENU_WIDTH_PAD);
      menu.style.width = `${width}px`;
      menu.style.minWidth = '';
      menu.style.maxWidth = '';
      openWidthRef.current = width;
    } else {
      menu.style.width = `${width}px`;
    }
    const visualWidth = width * scale;
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    const placeBelow = spaceBelow >= spaceAbove;
    const avail = Math.max(MIN_MENU_HEIGHT, (placeBelow ? spaceBelow : spaceAbove) - GAP);
    // The list is the scroller (the search field stays pinned above it), so
    // measure its full content height (scrollHeight ignores the max-height clip)
    // plus the non-list chrome (padding, border, search field), which is stable
    // whether or not the list is currently constrained. Unscaled; visual =
    // * scale.
    const chrome = menu.offsetHeight - list.offsetHeight;
    const naturalHeight = chrome + list.scrollHeight;
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
    setQuery('');
    openWidthRef.current = null;
    didFocusRef.current = false;
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    setQuery('');
    openWidthRef.current = null;
    didFocusRef.current = false;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled(resolved));
    pendingOpenScroll.current = true;
    setOpen(true);
  };

  const commit = (next: string) => {
    onChange(next);
    close(true);
  };

  // Render the menu hidden first so its content size is measurable, then fit
  // width, cap height, and position. Re-fit when the visible count changes so
  // filtering re-clamps the height and flip side.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition, visible.length]);

  // Focus the search field (or the list when there is none) once the menu is
  // visible - coords set means reposition has run and cleared the initial
  // visibility:hidden, so .focus() actually takes. Guarded to fire once per
  // open so filtering (which re-runs reposition) doesn't yank the caret.
  useLayoutEffect(() => {
    if (!open || !coords || didFocusRef.current) return;
    didFocusRef.current = true;
    (searchEnabled ? inputRef.current : listRef.current)?.focus();
  }, [open, coords, searchEnabled]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    // Capture scroll also fires for the list's own overflow scrolling, which
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
  // list is briefly full-height (nothing overflows) until maxHeight lands, and
  // the nav effect below doesn't depend on coords so it never re-fires. Layout
  // effect so scrollTop commits before paint.
  useLayoutEffect(() => {
    if (!open || !coords || !pendingOpenScroll.current) return;
    pendingOpenScroll.current = false;
    const list = listRef.current;
    const target = activeIndex >= 0 ? activeIndex : selectedIndex;
    const el = target >= 0 ? (list?.children[target] as HTMLElement | undefined) : undefined;
    if (list && el) list.scrollTop = Math.max(0, el.offsetTop - (list.clientHeight - el.offsetHeight) / 2);
  }, [open, coords, activeIndex, selectedIndex]);

  // Keep the active option visible during keyboard nav (minimal scroll).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    (listRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
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

  // Arrow/Enter/Escape drive the list; typing and caret keys (Home/End) fall
  // through to the input so the query edits normally.
  const onInputKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex(i => nextEnabled(visible, i, 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIndex(i => nextEnabled(visible, i, -1)); break;
      case 'Enter': {
        e.preventDefault();
        const opt = visible[activeIndex];
        if (opt && selectable(opt)) commit(opt.value);
        break;
      }
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(); break;
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    const next = filterOptions(resolved, q);
    setActiveIndex(q.trim() ? firstEnabled(next) : (selectedIndex >= 0 ? selectedIndex : firstEnabled(next)));
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex(i => nextEnabled(visible, i, 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIndex(i => nextEnabled(visible, i, -1)); break;
      case 'Home': e.preventDefault(); setActiveIndex(firstEnabled(visible)); break;
      case 'End': e.preventDefault(); setActiveIndex(lastEnabled(visible)); break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const opt = visible[activeIndex];
        if (opt && selectable(opt)) commit(opt.value);
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
          const match = visible.findIndex(o => selectable(o) && o.label.toLowerCase().startsWith(ta.buffer));
          if (match >= 0) setActiveIndex(match);
        }
    }
  };

  return (
    <span ref={wrapperRef} className={classNames(styles.wrapper, variant === 'ghost' && styles.ghost, triggerIconOnly && styles.iconOnly, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        style={height != null ? { height } : undefined}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        title={triggerIconOnly && selectedIcon && selectedLabel ? selectedLabel : undefined}
        onClick={() => { if (disabled) return; if (open) close(); else openMenu(); }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={classNames(styles.value, accentValue && styles.accentValue, showPlaceholder && styles.placeholder)}>
          {!showPlaceholder && selectedIcon && <span className={styles.optionIcon} aria-hidden="true">{selectedIcon}</span>}
          {showPlaceholder ? placeholder : (triggerIconOnly && selectedIcon ? null : selectedLabel)}
        </span>
      </button>
      {!triggerIconOnly && (
        <ChevronDown
          className={styles.chevron}
          size={14}
          strokeWidth={2}
          // eslint-disable-next-line i18next/no-literal-string -- decorative-icon aria flag
          aria-hidden="true"
        />
      )}
      {open && createPortal(
        <div
          ref={menuRef}
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
        >
          {searchEnabled && (
            <div className={styles.searchRow}>
              <Search
                className={styles.searchIcon}
                size={14}
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                className={styles.searchInput}
                role="combobox"
                aria-expanded
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeDescendant}
                aria-label={t('select.searchAria')}
                placeholder={t('select.searchPlaceholder')}
                value={query}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
                spellCheck={false}
                // Minimal intrinsic width so the field doesn't inflate the menu's
                // max-content sizing; flex:1 grows it to fill the row.
                size={1}
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={activeDescendant}
            className={styles.list}
            onKeyDown={onMenuKeyDown}
          >
            {visible.length === 0 ? (
              // Not an option row - kept out of the listbox a11y semantics.
              <li className={styles.noResults} role="presentation">{t('select.noResults')}</li>
            ) : (
              visible.map((opt, i) => opt.divider ? (
                // Structural rule, removed from the a11y tree so it isn't
                // announced as an empty option.
                <li key={`${opt.value}-${i}`} className={styles.divider} aria-hidden="true" />
              ) : (
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
              ))
            )}
          </ul>
        </div>,
        document.body,
      )}
    </span>
  );
}
