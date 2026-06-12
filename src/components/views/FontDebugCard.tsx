import { useEffect, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { Card } from '../common/Card/Card';
import {
  DEBUG_FONTS,
  DEFAULT_FONT_ID,
  applyDebugFont,
  ensureAllPreviewFonts,
  loadDebugFont,
  saveDebugFont,
  type DebugFontState,
} from '../../lib/debugFont';
import sharedStyles from './ToolsView.module.scss';
import styles from './FontDebugCard.module.scss';

export function FontDebugCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<DebugFontState | null>(() => loadDebugFont());

  useEffect(() => { ensureAllPreviewFonts(); }, []);

  const pickFont = (fontId: string) => {
    if (!DEBUG_FONTS.some(f => f.id === fontId)) return;
    const updated: DebugFontState = { fontId };
    setState(updated);
    saveDebugFont(updated);
    applyDebugFont(updated);
  };

  const activeId = state?.fontId ?? DEFAULT_FONT_ID;

  return (
    <Card title={t('tools.fontDebug.title')} className={sharedStyles.wide}>
      <span className={sharedStyles.dim}>
        {t('tools.fontDebug.description')}
      </span>
      <div className={styles.fontGrid}>
        {DEBUG_FONTS.map(f => {
          const active = activeId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`${styles.fontTile} ${active ? styles.fontTileActive : ''}`}
              style={{ fontFamily: `'${f.family}', system-ui, sans-serif` }}
              onClick={() => pickFont(f.id)}
            >
              <span className={styles.fontTileLabel}>
                {f.label}{f.isDefault ? ' (default)' : ''}
              </span>
              <span className={styles.fontTileSample}>Aa Bb 0123</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
