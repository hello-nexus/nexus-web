import { useEffect, useRef, useState } from 'react';
import styles from './TextStyles.module.scss';

interface TextStyleSpec {
  name: string;
  mixin: string;
  className: string;
  family: 'sans' | 'mono';
  use: string;
}

// The mixin in `_text.scss` is the source of truth for values. Below is
// descriptive metadata (name + use case); numeric specs are read at runtime
// from the rendered sample via `getComputedStyle` so the table can't drift
// from the mixin.
const STYLES: TextStyleSpec[] = [
  { name: 'Display', mixin: 'text-display', className: styles.display, family: 'sans', use: 'Hero numbers, biggest values' },
  { name: 'Heading', mixin: 'text-heading', className: styles.heading, family: 'sans', use: 'Page / modal / card titles, section headers' },
  { name: 'Body',    mixin: 'text-body',    className: styles.body,    family: 'sans', use: 'All running text - paragraphs, descriptions, list items' },
  { name: 'Button',  mixin: 'text-button',  className: styles.button,  family: 'sans', use: 'Buttons, action chips, pills, tab labels' },
  { name: 'Label',   mixin: 'text-label',   className: styles.label,   family: 'sans', use: 'Eyebrows, table headers, badges' },
  { name: 'Caption', mixin: 'text-caption', className: styles.caption, family: 'sans', use: 'Timestamps, footnotes, sensor units' },
  { name: 'Numeric', mixin: 'text-numeric', className: styles.numeric, family: 'mono', use: 'Tabular monospace numbers (sensor values, RPM, network rates)' },
  { name: 'Code',    mixin: 'text-code',    className: styles.code,    family: 'mono', use: 'Pairing / confirmation codes (Code-tab digits, confirm SAS) - heavy, size set per use' },
];

interface ComputedSpec {
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  caps: boolean;
}

interface ColorContext {
  name: string;
  cssVar: string;
  background?: string;
}

const COLORS: ColorContext[] = [
  { name: 'Primary',    cssVar: 'var(--text)' },
  { name: 'Secondary',  cssVar: 'var(--text-dim)' },
  { name: 'Accent',     cssVar: 'var(--accent)' },
  { name: 'Accent glow',cssVar: 'var(--accent-glow)' },
  { name: 'Good',       cssVar: 'var(--good)' },
  { name: 'Warn',       cssVar: 'var(--warn)' },
  { name: 'Bad',        cssVar: 'var(--bad)' },
  { name: 'On accent',  cssVar: 'var(--accent-text)', background: 'var(--accent)' },
];

const ACCENT_TOKENS = [
  { name: 'accent',             cssVar: '--accent' },
  { name: 'accent-glow',        cssVar: '--accent-glow' },
  { name: 'accent-deep',        cssVar: '--accent-deep' },
  { name: 'accent-soft',        cssVar: '--accent-soft' },
  { name: 'accent-glow-shadow', cssVar: '--accent-glow-shadow' },
];

const SURFACE_TOKENS = [
  { name: 'bg',            cssVar: '--bg' },
  { name: 'bg-elevated',   cssVar: '--bg-elevated' },
  { name: 'surface',       cssVar: '--surface' },
  { name: 'bg-card-hover', cssVar: '--bg-card-hover' },
  { name: 'border',        cssVar: '--border' },
  { name: 'border-strong', cssVar: '--border-strong' },
];

const STATUS_TOKENS = [
  { name: 'good', cssVar: '--good' },
  { name: 'warn', cssVar: '--warn' },
  { name: 'bad',  cssVar: '--bad'  },
];

const SAMPLE_TEXT = 'The quick brown fox 0123';
const PROBE_TEXT = 'Probe';

function formatPx(value: string): string {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)}px` : value;
}

function formatLetterSpacing(value: string): string {
  if (value === 'normal' || value === '0px') return '0';
  return value;
}

export function TextStyles() {
  const [onPanel, setOnPanel] = useState(false);
  const [computed, setComputed] = useState<Record<string, ComputedSpec>>({});
  const probeRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  useEffect(() => {
    const next: Record<string, ComputedSpec> = {};
    for (const spec of STYLES) {
      const el = probeRefs.current[spec.mixin];
      if (!el) continue;
      const cs = getComputedStyle(el);
      next[spec.mixin] = {
        size: formatPx(cs.fontSize),
        weight: cs.fontWeight,
        lineHeight: cs.lineHeight === 'normal' ? 'normal' : (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2),
        letterSpacing: formatLetterSpacing(cs.letterSpacing),
        caps: cs.textTransform === 'uppercase',
      };
    }
    // Read getComputedStyle off the DOM probes and lift the resolved spec
    // into state so the table renders the actual mixin output.
    setComputed(next);
  }, [onPanel]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Text styles</h2>
          <p className={styles.subtitle}>
            The 7 canonical text mixins live in <code>src/styles/_text.scss</code>. Component
            styles must use one of these via <code>@include text-...</code> and never combine
            font-size + weight + line-height + tracking by hand. Adding an 8th style is allowed
            but should be a deliberate decision, not a silent one-off.
          </p>
        </div>
        <div className={styles.controls}>
          <label className={styles.controlGroup}>
            <input type="checkbox" checked={onPanel} onChange={e => setOnPanel(e.target.checked)} />
            <span className={styles.controlLabel}>Render on panel surface</span>
          </label>
        </div>
      </header>

      {/* Hidden probes - read computed styles so the spec table reflects what
          the mixin actually paints, even if `_text.scss` changes later. */}
      <div className={styles.probes} aria-hidden="true">
        {STYLES.map(spec => (
          <span
            key={spec.mixin}
            ref={el => { probeRefs.current[spec.mixin] = el; }}
            className={spec.className}
          >
            {PROBE_TEXT}
          </span>
        ))}
      </div>

      <div
        className={`${styles.canvas} ${onPanel ? 'panel-root' : ''}`}
        data-on-panel={onPanel}
      >
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Style x color matrix</h3>
          <div className={styles.matrix}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th className={styles.specCol}>Style</th>
                  {COLORS.map(c => <th key={c.name}>{c.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {STYLES.map(spec => {
                  const c = computed[spec.mixin];
                  return (
                  <tr key={spec.name}>
                    <td className={styles.specCol}>
                      <div className={styles.specName}>{spec.name}</div>
                      <code className={styles.specMixin}>@include {spec.mixin};</code>
                      <div className={styles.specMeta}>
                        {c
                          ? <>{c.size} / {c.weight} / lh {c.lineHeight} / ls {c.letterSpacing}</>
                          : '...'}
                        {c?.caps && <span className={styles.specCaps}> CAPS</span>}
                        {spec.family === 'mono' && <span className={styles.specMono}> mono</span>}
                      </div>
                      <div className={styles.specUse}>{spec.use}</div>
                    </td>
                    {COLORS.map(color => (
                      <td
                        key={color.name}
                        className={styles.sample}
                        style={{
                          color: color.cssVar,
                          background: color.background,
                          padding: color.background ? '8px 10px' : undefined,
                          borderRadius: color.background ? '8px' : undefined,
                        }}
                      >
                        <span className={spec.className}>{spec.family === 'mono' ? '01234.56' : SAMPLE_TEXT}</span>
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Color tokens</h3>

          <h4 className={styles.subSectionTitle}>Surfaces</h4>
          <div className={styles.swatchGrid}>
            {SURFACE_TOKENS.map(t => (
              <Swatch key={t.cssVar} name={t.name} cssVar={t.cssVar} />
            ))}
          </div>

          <h4 className={styles.subSectionTitle}>Text</h4>
          <div className={styles.swatchGrid}>
            <Swatch name="text"        cssVar="--text" />
            <Swatch name="text-dim"    cssVar="--text-dim" />
          </div>

          <h4 className={styles.subSectionTitle}>Accent (runtime-derived from user pick)</h4>
          <div className={styles.swatchGrid}>
            {ACCENT_TOKENS.map(t => (
              <Swatch key={t.cssVar} name={t.name} cssVar={t.cssVar} />
            ))}
          </div>

          <h4 className={styles.subSectionTitle}>Status</h4>
          <div className={styles.swatchGrid}>
            {STATUS_TOKENS.map(t => (
              <Swatch key={t.cssVar} name={t.name} cssVar={t.cssVar} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className={styles.swatch}>
      <div className={styles.swatchChip} style={{ background: `var(${cssVar})` }} />
      <code className={styles.swatchName}>{cssVar}</code>
      <span className={styles.swatchAlias}>{name}</span>
    </div>
  );
}
