import { AlertTriangle, AppWindow, ChevronRight, Keyboard, Save } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { formatList } from '../../../../components/common/Nexus2WelcomeScreen/nexus2WelcomeUtils';
import type { CardAppStrip } from './controlledBy';
import styles from '../LightingPage.module.scss';

// Stands in for the app list while translating, so each locale keeps its own word order around it.
const APP_TOKEN = '\uE000';

/**
 * The footer of a lighting card naming the apps that compete for its hardware.
 * Gray when Nexus does not drive the device, amber when it does; both open the
 * conflict dialog, so the press never reaches the card's select or drag.
 * With `label` it is the amber not-responding strip instead, opening whatever `onOpen` opens.
 */
type ControlledByStripProps = { onOpen: () => void; /** A quiet second line under the saved state; one line, so the card height does not depend on its copy. */ note?: string; /** The card around it is the one control, so the strip leaves the tab order and the accessibility tree. */ passive?: boolean } & (
  | { strip: CardAppStrip; label?: never; saveToDevice?: never }
  | { label: string; strip?: never; saveToDevice?: never }
  /** The gray "save colors to the keyboard" entry: 'keep' offers it, 'saved' says it is on. Both lead to the device page. */
  | { saveToDevice: 'keep' | 'saved'; strip?: never; label?: never }
);

// Stands in for the bold key names while translating, so each locale keeps its own word order around them.
const KEYS_TOKEN = '\uE001';

export function ControlledByStrip({ strip, label, saveToDevice, note, onOpen, passive }: ControlledByStripProps) {
  const { t, language } = useTranslation();
  const warn = label !== undefined || !!strip?.controlled;
  const [before, after = ''] = t(warn ? 'devices.conflictRunning.badge' : 'lighting.devices.controlledBy', { app: APP_TOKEN }).split(APP_TOKEN);
  const [keysBefore, keysAfter = ''] = t('lighting.devices.saveStrip.keep', { keys: KEYS_TOKEN }).split(KEYS_TOKEN);
  const Icon = saveToDevice ? (saveToDevice === 'saved' ? Save : Keyboard) : warn ? AlertTriangle : AppWindow;
  let text;
  if (saveToDevice === 'saved') {
    text = <b>{t('lighting.devices.saveStrip.saved')}</b>;
  } else if (saveToDevice) {
    text = <>{keysBefore}<b>{t('lighting.devices.saveStrip.keys')}</b>{keysAfter}</>;
  } else if (label !== undefined) {
    text = <b>{label}</b>;
  } else {
    text = <>{before}<b>{formatList((strip?.apps ?? []).map(a => a.name), language)}</b>{after}</>;
  }
  return (
    <button
      type="button"
      className={`${styles.deviceControlledBy} ${warn ? styles.deviceControlledByWarn : ''}`}
      data-no-dnd
      tabIndex={passive ? -1 : undefined}
      aria-hidden={passive || undefined}
      onClick={e => { e.stopPropagation(); onOpen(); }}
      // Enter and Space activate the button; keep them from the card's key handlers (drag, toggle). Everything else bubbles.
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
    >
      <Icon aria-hidden />
      {note && saveToDevice === 'saved' ? (
        <span className={styles.deviceControlledByStack}>
          <span>{text}</span>
          <span className={styles.deviceControlledByNote}>{note}</span>
        </span>
      ) : <span>{text}</span>}
      {saveToDevice && <ChevronRight aria-hidden className={styles.deviceControlledByChevron} />}
    </button>
  );
}
