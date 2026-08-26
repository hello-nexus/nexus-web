import { useMemo, type ComponentType, type ReactNode } from 'react';
import { Joystick, Pointer } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ModeMenuTriggerLabel, type ModeMenuEntry } from './ModeMenu';

export type PageDashboardMode = 'simple' | 'advanced';

/** Glyph size inside a tab, matching every other mode tab's icon. */
const TRIGGER_ICON_SIZE = 14;
/** Glyph size inside a menu row. */
const ENTRY_ICON_SIZE = 20;

export interface PageModeMenuOptions {
  mode: PageDashboardMode;
  /** The page's own off state (lighting sync 'none' / cooling preset 'off'). */
  off: boolean;
  /** Off glyph - the page's own, so lighting and cooling keep their tab icons. */
  offIcon: ComponentType<{ size?: number | string }>;
  offLabel: string;
  offDescription: string;
  simpleDescription: string;
  advancedDescription: string;
  onOff: (origin: HTMLButtonElement) => void;
  onModeChange: (mode: PageDashboardMode) => void;
}

export interface PageModeMenuState {
  entries: ModeMenuEntry[];
  /** Glyph for the tab that opens the menu: whatever is currently in force. */
  triggerIcon: ReactNode;
  /** That tab's label - the caret alone; the glyph carries the meaning. */
  triggerLabel: ReactNode;
  /** Accessible name for the tab, which renders no text of its own. */
  triggerAriaLabel: string;
}

/**
 * The Off / Simple / Advanced choice shared by the lighting and cooling pages.
 * Off is always offered; the mode row offers only the mode you are NOT in, so
 * the menu never lists the state it was opened from as a destination.
 *
 * Off wins the trigger whenever it is in force - it is the state the user most
 * needs to see - and the dashboard mode's glyph shows the rest of the time.
 */
export function usePageModeMenu({
  mode, off, offIcon: OffIcon, offLabel, offDescription,
  simpleDescription, advancedDescription, onOff, onModeChange,
}: PageModeMenuOptions): PageModeMenuState {
  const { t } = useTranslation();
  const simple = mode === 'simple';
  const entries = useMemo<ModeMenuEntry[]>(() => [
    {
      key: 'off',
      icon: <OffIcon size={ENTRY_ICON_SIZE} />,
      title: offLabel,
      description: offDescription,
      active: off,
      onSelect: onOff,
    },
    simple
      ? {
        key: 'advanced',
        icon: <Joystick size={ENTRY_ICON_SIZE} />,
        title: t('uiMode.advancedMode'),
        description: advancedDescription,
        onSelect: () => onModeChange('advanced'),
      }
      : {
        key: 'simple',
        icon: <Pointer size={ENTRY_ICON_SIZE} />,
        title: t('uiMode.simpleMode'),
        description: simpleDescription,
        onSelect: () => onModeChange('simple'),
      },
  ], [OffIcon, offLabel, offDescription, off, onOff, simple, t, advancedDescription, simpleDescription, onModeChange]);

  const ModeIcon = simple ? Pointer : Joystick;
  const triggerIcon = off ? <OffIcon size={TRIGGER_ICON_SIZE} /> : <ModeIcon size={TRIGGER_ICON_SIZE} />;
  const triggerAriaLabel = off ? offLabel : t(simple ? 'uiMode.simpleMode' : 'uiMode.advancedMode');

  return { entries, triggerIcon, triggerLabel: <ModeMenuTriggerLabel />, triggerAriaLabel };
}
