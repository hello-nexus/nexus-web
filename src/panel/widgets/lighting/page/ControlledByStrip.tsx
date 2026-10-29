import { AlertTriangle, AppWindow } from 'lucide-react';
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
export function ControlledByStrip({ strip, label, onOpen }: { strip?: CardAppStrip; label?: string; onOpen: () => void }) {
  const { t, language } = useTranslation();
  const warn = label !== undefined || !!strip?.controlled;
  const [before, after = ''] = t(warn ? 'devices.conflictRunning.badge' : 'lighting.devices.controlledBy', { app: APP_TOKEN }).split(APP_TOKEN);
  const Icon = warn ? AlertTriangle : AppWindow;
  return (
    <button
      type="button"
      className={`${styles.deviceControlledBy} ${warn ? styles.deviceControlledByWarn : ''}`}
      data-no-dnd
      onClick={e => { e.stopPropagation(); onOpen(); }}
      // Enter and Space activate the button; keep them from the card's key handlers (drag, toggle). Everything else bubbles.
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
    >
      <Icon aria-hidden />
      <span>
        {label !== undefined ? <b>{label}</b> : (
          <>
            {before}
            <b>{formatList((strip?.apps ?? []).map(a => a.name), language)}</b>
            {after}
          </>
        )}
      </span>
    </button>
  );
}
