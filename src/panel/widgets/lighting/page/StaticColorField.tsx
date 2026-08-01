import { useEffect, useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { hexToHsv, hsvToHex } from '../../../../lib/settings';
import type { EffectState } from '../../../../types/lighting';
import styles from '../LightingPage.module.scss';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Hex entry for a frozen pattern's colour. The shader tints through
 * finalize()'s grayscale-and-tint path, which carries hue and saturation only -
 * the pattern's own luminance supplies light and dark - so value is dropped on
 * read and pinned on write.
 */
export function stateToHex(state: EffectState): string {
  return hsvToHex(state.hue * 360, Math.min(state.saturation, 1) * 100, 100);
}

export function hexToStatePatch(hex: string): Partial<EffectState> {
  const { h, s } = hexToHsv(hex);
  return { hue: h / 360, saturation: s / 100, colorize: 1 };
}

export function StaticColorField({ state, onChange }: {
  state: EffectState;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
}) {
  const { t } = useTranslation();
  const current = stateToHex(state);
  const [draft, setDraft] = useState(current.toUpperCase());

  useEffect(() => {
    setDraft(current.toUpperCase());
  }, [current]);

  const commit = (value: string) => {
    if (!HEX_PATTERN.test(value)) {
      setDraft(current.toUpperCase());
      return;
    }
    onChange(hexToStatePatch(value), true);
  };

  return (
    <div className={styles.staticColorRow}>
      <span className={styles.staticColorLabel}>{t('lighting.controls.color')}</span>
      <span className={styles.staticColorSwatch} style={{ background: current }} aria-hidden="true" />
      <input
        className={styles.staticColorInput}
        value={draft}
        spellCheck={false}
        aria-label={t('lighting.controls.color')}
        onChange={e => {
          const next = e.target.value;
          setDraft(next);
          if (HEX_PATTERN.test(next)) onChange(hexToStatePatch(next), false);
        }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
    </div>
  );
}
