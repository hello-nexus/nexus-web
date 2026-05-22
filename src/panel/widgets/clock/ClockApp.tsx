import { useEffect, useMemo, useState } from 'react';
import {
  Binary, CircleDot, Clock3, FlipHorizontal, Hash, RotateCw, ScanLine,
  type LucideIcon,
} from 'lucide-react';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { useTranslation } from '../../../lib/i18n';
import { ClockWidget } from './ClockWidget';
import { CLOCK_DESIGNS } from './designs';
import type { PanelWidget } from '../../types';
import styles from './ClockApp.module.scss';

/**
 * Desktop "app view" for the Clock widget. Layout mirrors the immersive
 * pattern (`LightingImmersive`, `MediaImmersive`, …): cells in a panel-card
 * grid, the widget itself rendered prominently in the primary cell, and
 * customisation surfaced alongside / below.
 *
 * State lives in `localStorage` for now (under `qos_clock_app`). The
 * app deliberately isn't bound to any single dashboard widget instance —
 * it's a standalone "Clocks" experience, like the Clock app on iOS /
 * macOS — so a future PR can migrate persistence to a server-side pref
 * blob without changing this component's surface.
 */

interface ClockAppState {
  design: string;
  format: '24h' | '12h';
  showSeconds: boolean;
  showDate: boolean;
  useAccentColor: boolean;
  timezone: string;
}

const STORAGE_KEY = 'qos_clock_app';

const DEFAULT_STATE: ClockAppState = {
  design: 'digital',
  format: '24h',
  showSeconds: false,
  showDate: true,
  useAccentColor: false,
  timezone: '',
};

function loadState(): ClockAppState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: ClockAppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota / private mode — ignore */ }
}

// Maps each design key to its lucide icon. Mirrors the panel ClockSettings
// mapping so the visual vocabulary stays consistent across both surfaces.
const DESIGN_ICONS: Record<string, LucideIcon> = {
  digital: Hash,
  analog: Clock3,
  splitflap: FlipHorizontal,
  rolling: RotateCw,
  led: ScanLine,
  dots: CircleDot,
  matrix: Binary,
};

const DESIGN_KEYS = Object.keys(CLOCK_DESIGNS);

export function ClockApp() {
  const { t } = useTranslation();
  const [state, setState] = useState<ClockAppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const patch = (next: Partial<ClockAppState>) => setState(prev => ({ ...prev, ...next }));

  // Synthesise a PanelWidget shape so the existing ClockWidget renderer
  // can be reused verbatim for the preview. Same contract as the widget
  // tile in the panel grid — the design dispatcher reads off config.
  const previewWidget = useMemo<PanelWidget>(() => ({
    id: 'clock-app-preview',
    type: 'clock',
    size: '4x4',
    col: 0,
    row: 0,
    config: {
      design: state.design,
      format: state.format,
      showSeconds: state.showSeconds,
      showDate: state.showDate,
      useAccentColor: state.useAccentColor,
      // ClockWidget reads timezone via config[?]; empty string === "auto"
      // (local). PanelConfigValue forbids undefined but accepts null, so
      // collapse an empty input to null rather than dropping the key.
      timezone: state.timezone || null,
    },
  }), [state]);

  return (
    <div className={styles.app}>
      <ViewHeader title={t('nav.clock')} />
      <div className={styles.grid}>
        <div className={`${styles.cell} ${styles.cellPreview}`}>
          <div className={styles.cellPreviewInner}>
            <ClockWidget widget={previewWidget} surface="desktop" />
          </div>
        </div>

        <div className={`${styles.cell} ${styles.cellDesigns}`}>
          <div className={styles.cellLabel}>{t('clock.app.designs')}</div>
          <div className={styles.designsGrid}>
            {DESIGN_KEYS.map(key => {
              const Icon = DESIGN_ICONS[key];
              const entry = CLOCK_DESIGNS[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.designBtn}
                  data-active={key === state.design}
                  onClick={() => patch({ design: key })}
                >
                  {Icon && <Icon size={18} className={styles.designIcon} aria-hidden />}
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${styles.cell} ${styles.settingsCell}`}>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.format')}</span>
            <div className={styles.formatToggle} role="group" aria-label={t('clock.app.format')}>
              <button
                type="button"
                className={styles.formatBtn}
                data-active={state.format === '24h'}
                onClick={() => patch({ format: '24h' })}
              >
                {t('clock.app.format24')}
              </button>
              <button
                type="button"
                className={styles.formatBtn}
                data-active={state.format === '12h'}
                onClick={() => patch({ format: '12h' })}
              >
                {t('clock.app.format12')}
              </button>
            </div>
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.showSeconds')}</span>
            <Toggle checked={state.showSeconds} onChange={v => patch({ showSeconds: v })} />
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.showDate')}</span>
            <Toggle checked={state.showDate} onChange={v => patch({ showDate: v })} />
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.useAccentColor')}</span>
            <Toggle checked={state.useAccentColor} onChange={v => patch({ useAccentColor: v })} />
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.timezone')}</span>
            <input
              type="text"
              className={styles.tzInput}
              value={state.timezone}
              onChange={e => patch({ timezone: e.target.value })}
              placeholder={t('clock.app.timezoneAuto')}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClockApp;
