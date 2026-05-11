import styles from './SurfaceStyles.module.scss';

interface TokenSpec {
  cssVar: string;
  description: string;
}

const RADII: TokenSpec[] = [
  { cssVar: '--radius-sm',    description: '6px - chips, small buttons, dense controls' },
  { cssVar: '--radius',       description: '10px - default cards, modals, large buttons' },
  { cssVar: '--radius-lg',    description: '16px - hero cards, primary surfaces' },
  { cssVar: '--radius-pill',  description: '999px - pill chips, status badges, knobs' },
];

const SPACING: TokenSpec[] = [
  { cssVar: '--space-xs', description: '4px - micro inset, icon gap' },
  { cssVar: '--space-sm', description: '8px - default gap inside dense rows' },
  { cssVar: '--space-md', description: '12px - default card padding step' },
  { cssVar: '--space-lg', description: '16px - section gap, card body padding' },
  { cssVar: '--space-xl', description: '24px - page-level section break' },
];

const ALPHAS: TokenSpec[] = [
  { cssVar: '--alpha-faint',  description: 'micro-tints, faint dividers, subtle borders (0.10)' },
  { cssVar: '--alpha-medium', description: 'panel shadows, focus rings, soft overlays (0.40)' },
  { cssVar: '--alpha-strong', description: 'overlays, scrim, dense backgrounds (0.65)' },
];

const SHADOWS: TokenSpec[] = [
  { cssVar: '--shadow-sm', description: '0 1px 3px - inset dividers, slider thumbs' },
  { cssVar: '--shadow-md', description: '0 8px 24px - cards, popovers, menus' },
  { cssVar: '--shadow-xl', description: '0 20px 60px - modals, dialogs' },
];

const BLURS: TokenSpec[] = [
  { cssVar: '--blur-sm', description: '8px - subtle veils, popover backdrops' },
  { cssVar: '--blur-lg', description: '20px - heavy modal backdrops, panel actions tray' },
];

const SIZES: TokenSpec[] = [
  { cssVar: '--size-sm', description: '28px - compact buttons, dense inputs, icon-only' },
  { cssVar: '--size-md', description: '36px - default buttons, default inputs, default avatars' },
  { cssVar: '--size-lg', description: '44px - primary CTA, kiosk surfaces' },
];

const TIMINGS: TokenSpec[] = [
  { cssVar: '--ease-fast', description: '120ms - hover tint, press scale' },
  { cssVar: '--ease', description: '180ms - default state changes' },
  { cssVar: '--ease-slow', description: '300ms - sheet open, tab swap' },
];

export function SurfaceStyles() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h2 className={styles.title}>Surfaces</h2>
        <p className={styles.subtitle}>
          Canonical spacing, radius, shadow, blur, and opacity tokens. Reach for these
          instead of raw px/rem or one-off rgba alphas. The values live in
          <code> src/styles/variables.scss</code>.
        </p>
      </header>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Border radius</h3>
        <div className={styles.radiusRow}>
          {RADII.map(t => (
            <div key={t.cssVar} className={styles.radiusItem}>
              <div className={styles.radiusBox} style={{ borderRadius: `var(${t.cssVar})` }} />
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Control size</h3>
        <p className={styles.note}>
          Heights for buttons, inputs, chips, status badges, icon-only buttons,
          and avatars. Pick the rung that fits the row context so dense rows
          align cleanly.
        </p>
        <div className={styles.spacingList}>
          {SIZES.map(t => (
            <div key={t.cssVar} className={styles.spacingRow}>
              <div
                className={styles.sizeBox}
                style={{ height: `var(${t.cssVar})`, width: `var(${t.cssVar})` }}
              />
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Animation timing</h3>
        <p className={styles.note}>
          Hover the cells to see each duration on a fade. Three rungs cover
          the 100-300ms range component styles used to scatter across nine.
        </p>
        <div className={styles.spacingList}>
          {TIMINGS.map(t => (
            <div key={t.cssVar} className={styles.spacingRow}>
              <div
                className={styles.timingSwatch}
                style={{ transitionDuration: `var(${t.cssVar})` }}
              />
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Spacing</h3>
        <div className={styles.spacingList}>
          {SPACING.map(t => (
            <div key={t.cssVar} className={styles.spacingRow}>
              <div className={styles.spacingBar} style={{ width: `var(${t.cssVar})` }} />
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Shadow</h3>
        <div className={styles.shadowGrid}>
          {SHADOWS.map(t => (
            <div key={t.cssVar} className={styles.shadowCell}>
              <div className={styles.shadowSwatch} style={{ boxShadow: `var(${t.cssVar})` }} />
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Blur</h3>
        <div className={styles.blurGrid}>
          {BLURS.map(t => (
            <div key={t.cssVar} className={styles.blurCell}>
              <div className={styles.blurSwatch}>
                <div
                  className={styles.blurOverlay}
                  style={{ backdropFilter: `blur(var(${t.cssVar}))`, WebkitBackdropFilter: `blur(var(${t.cssVar}))` }}
                />
              </div>
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Opacity tiers</h3>
        <p className={styles.note}>
          Apply via <code>color-mix(in srgb, X var(--alpha-Y), transparent)</code> or
          <code> rgb(R G B / var(--alpha-Y))</code>. Five tiers cover ~80% of the
          literal alphas that were drifting across the codebase.
        </p>
        <div className={styles.alphaList}>
          {ALPHAS.map(t => (
            <div key={t.cssVar} className={styles.alphaRow}>
              <div
                className={styles.alphaSwatch}
                style={{ background: `rgb(255 255 255 / var(${t.cssVar}))` }}
              />
              <code className={styles.tokenName}>{t.cssVar}</code>
              <span className={styles.tokenDesc}>{t.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
