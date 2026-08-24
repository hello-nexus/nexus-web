import type { ReactNode } from 'react';
import { Toggle } from '../Toggle/Toggle';
import { Select, type SelectOption } from '../Select/Select';
import { Slider } from '../Slider/Slider';
import styles from './SettingRow.module.scss';

/**
 * Canonical settings row: a label (+ optional description) on the left and a
 * control on the right (no per-row divider - the rule belongs under section
 * headers, via SectionHeader). The one settings row for the whole app (main
 * Settings pages, lighting/keeb pages, panel editor sheet, panel Theme page,
 * device Settings tab), so they read identically. The panel `SettingsRow` name
 * re-exports this primitive.
 *
 * Uses `--text`, `--text-dim`, and `--border` so the row themes correctly
 * inside `.panel-root` (kiosk) and on the desktop dashboard.
 */
export function SettingRow({
  label,
  description,
  icon,
  iconLeading,
  children,
  disabled,
  anchorId,
  align,
  wrapControl,
  stackOnNarrow,
  descriptionBelow,
}: {
  label?: string;
  description?: ReactNode;
  // Optional accent glyph rendered inline before the label text.
  icon?: ReactNode;
  // Renders `icon` as a large leading column beside label+description
  // (vertically centered against the whole row) instead of the small inline
  // glyph before the label text. Caller sizes the icon element itself larger
  // to match.
  iconLeading?: boolean;
  // Omit for a pure status row (label/description only, no control).
  children?: ReactNode;
  disabled?: boolean;
  // Search deep-link target: stamps the row so the command palette can scroll
  // to + shine it. Optional; nothing else reads it.
  anchorId?: string;
  // Vertical alignment of label vs control. Default center; 'start' top-aligns
  // for a tall control (e.g. a color picker).
  align?: 'center' | 'start';
  // Opt-in: let the control shrink into the space left beside the label and
  // wrap there, for a control wider than that space whose own content wraps (a
  // swatch grid). `.control` otherwise never shrinks, so it holds its
  // max-content width and squeezes the label into a wrapped column instead.
  // The control's own children still need `flex-wrap: wrap` to use it.
  wrapControl?: boolean;
  // Opt-in: below the narrow-viewport breakpoint, stack the control under the
  // description instead of squeezing both onto one line. Off by default so
  // the many fixed-width call sites (lighting pages, panel sheets, device
  // tabs) keep their side-by-side layout unchanged; set this on rows whose
  // description is long enough to wrap hard against a wide control (e.g. the
  // account username/password/privacy rows).
  stackOnNarrow?: boolean;
  // Opt-in: render the description on its own full-width line under the
  // label+control line instead of beside the control. For rows whose
  // description changes with the control's value - inline, its height drives
  // the row's, so the control jogs up and down as the text rewraps. 'tight'
  // seats the description against the label instead (SettingSlider).
  descriptionBelow?: boolean | 'tight';
}) {
  const cls = [
    styles.row,
    disabled && styles.disabled,
    align === 'start' && styles.alignStart,
    wrapControl && styles.wrapControl,
    stackOnNarrow && styles.stackNarrow,
    descriptionBelow && styles.descBelow,
    descriptionBelow === 'tight' && styles.descBelowTight,
  ].filter(Boolean).join(' ');
  return (
    <div id={anchorId} data-search-anchor={anchorId} className={cls}>
      {icon && iconLeading && <span className={styles.leadingIcon} aria-hidden="true">{icon}</span>}
      {(label || (description && !descriptionBelow)) && (
        <div className={styles.info}>
          {label && (
            <span className={styles.label}>
              {icon && !iconLeading && <span className={styles.labelIcon} aria-hidden="true">{icon}</span>}
              {label}
            </span>
          )}
          {description && !descriptionBelow && <span className={styles.desc}>{description}</span>}
        </div>
      )}
      <div className={styles.control}>{children}</div>
      {description && descriptionBelow && <span className={styles.desc}>{description}</span>}
    </div>
  );
}

export function SettingToggle({
  label,
  description,
  icon,
  iconLeading,
  checked,
  onChange,
  disabled,
  anchorId,
  ariaLabel,
  stackOnNarrow,
}: {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  iconLeading?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  anchorId?: string;
  ariaLabel?: string;
  stackOnNarrow?: boolean;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      icon={icon}
      iconLeading={iconLeading}
      disabled={disabled}
      anchorId={anchorId}
      stackOnNarrow={stackOnNarrow}
    >
      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel ?? label} />
    </SettingRow>
  );
}

export function SettingSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  description,
  descriptionBelow,
  anchorId,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: ReactNode;
  descriptionBelow?: boolean | 'tight';
  anchorId?: string;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      descriptionBelow={descriptionBelow}
      anchorId={anchorId}
      disabled={disabled}
    >
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} disabled={disabled} />
    </SettingRow>
  );
}

// Right-aligned inline slider bar in the control slot. `editable` makes the
// value click-to-edit; `trackFill` paints the level accent (brightness/volume).
export function SettingSlider({
  label,
  description,
  descriptionBelow,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  onCommit,
  editable,
  trackFill,
  disabled,
  anchorId,
  ariaLabel,
  controlWidth,
}: {
  label?: string;
  description?: ReactNode;
  // Renders the description on its own full-width line: the slider takes a
  // fixed slice of the row, so an inline description wraps to a few words per
  // line in a settings pane.
  descriptionBelow?: boolean;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (v: number) => string;
  onChange: (value: number, commit?: boolean) => void;
  onCommit?: (value: number) => void;
  editable?: boolean;
  trackFill?: boolean | number;
  disabled?: boolean;
  anchorId?: string;
  ariaLabel?: string;
  // Overrides the default control width (min(12rem, 45vw)); pass a CSS length.
  controlWidth?: string;
}) {
  // Built outside the JSX: the variant id is not UI text, and the i18n literal
  // rule scans JSX only.
  const below = descriptionBelow ? 'tight' as const : undefined;
  return (
    <SettingRow
      label={label}
      description={description}
      descriptionBelow={below}
      disabled={disabled}
      anchorId={anchorId}
    >
      <div className={styles.sliderControl} style={controlWidth ? { width: controlWidth } : undefined}>
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          formatValue={formatValue}
          onChange={onChange}
          onCommit={onCommit}
          editable={editable}
          trackFill={trackFill}
          disabled={disabled}
          ariaLabel={ariaLabel ?? label}
        />
      </div>
    </SettingRow>
  );
}
