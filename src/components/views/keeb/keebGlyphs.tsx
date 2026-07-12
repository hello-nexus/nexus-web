// Visible label for each KeyFunction the keeb firmware understands. ANSI/ISO
// swap a few legend strings ("` ~" vs "` ¬", Enter shape, etc).
//
// Icon glyphs are rendered as lucide-react components.

import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Heart,
  House,
  Infinity as InfinityIcon,
  Mail,
  Monitor,
  Moon,
  MousePointer2,
  Music,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  ToggleRight,
  User,
  Volume,
  Volume2,
  VolumeX,
} from 'lucide-react';

export type KeebLayoutKind = 'ANSI' | 'ISO';

const ICON_SIZE = 14;

export function getKeyGlyph(func: string, layout: KeebLayoutKind = 'ANSI'): ReactNode {
  switch (func) {
    case '':
    case 'None': return '';
    case 'Escape': return 'Esc';
    case 'PrintScreen': return 'PrtSc';
    case 'ScrollLock': return 'ScrLk';
    case 'Backtick': return layout === 'ISO' ? '` ¬' : '` ~';
    case 'Number1': return '1 !';
    case 'Number2': return layout === 'ISO' ? '2 "' : '2 @';
    case 'Number3': return layout === 'ISO' ? '3 £' : '3 #';
    case 'Number4': return '4 $';
    case 'Number5': return '5 %';
    case 'Number6': return '6 ^';
    case 'Number7': return '7 &';
    case 'Number8': return '8 *';
    case 'Number9': return '9 (';
    case 'Number0': return '0 )';
    case 'Minus': return '- _';
    case 'Equals': return '= +';
    case 'Insert': return 'Ins';
    case 'PageUp': return 'PgUp';
    case 'LeftBracket': return '[ {';
    case 'RightBracket': return '] }';
    case 'Backslash': return '\\ |';
    case 'Delete': return 'Del';
    case 'PageDown': return 'PgDn';
    case 'CombinationKey': return 'Combo';
    case 'CapsLock': return 'Caps Lock';
    case 'Semicolon': return '; :';
    case 'Quote': return layout === 'ISO' ? `' @` : '\' "';
    case 'Return': return layout === 'ISO' ? '↵ Enter' : 'Enter';
    case 'LeftShift':
    case 'RightShift': return layout === 'ANSI' ? 'Shift' : '⇧';
    case 'Comma': return ', <';
    case 'Period': return '. >';
    case 'Slash': return '/ ?';
    case 'LeftControl':
    case 'RightControl': return 'Ctrl';
    case 'LeftAlt':
    case 'RightAlt': return 'Alt';
    case 'LeftGUI':
    case 'RightGUI': return '⊞';
    case 'PassThrough': return <ChevronDown size={ICON_SIZE} />;
    case 'UpArrow': return <ChevronUp size={ICON_SIZE} />;
    case 'DownArrow': return <ChevronDown size={ICON_SIZE} />;
    case 'LeftArrow': return <ChevronLeft size={ICON_SIZE} />;
    case 'RightArrow': return <ChevronRight size={ICON_SIZE} />;
    case 'Stop': return <Square size={ICON_SIZE} />;
    case 'PlayAndPause': return <Play size={ICON_SIZE} />;
    case 'Mute': return <VolumeX size={ICON_SIZE} />;
    case 'VolumeUp': return <Volume2 size={ICON_SIZE} />;
    case 'VolumeDown': return <Volume size={ICON_SIZE} />;
    case 'ScanPreviousTrack': return '⏮';
    case 'ScanNextTrack': return '⏭';
    case 'Rewind': return '⏪';
    case 'FastForward': return '⏩';
    case 'KeyboardPower': return <Power size={ICON_SIZE} />;
    case 'MOSwitch': return 'MO';
    case 'TGSwitch': return 'TG';
    case 'TOSwitch': return <ToggleRight size={ICON_SIZE} />;
    case 'DFSwitch': return 'DF';
    case 'MouseLButton': return 'LMB';
    case 'MouseRButton': return 'RMB';
    case 'MouseMButton': return <MousePointer2 size={ICON_SIZE} />;
    case 'MouseB4Button': return '4';
    case 'MouseB5Button': return '5';
    case 'MouseWheelUp': return <ArrowUp size={ICON_SIZE} />;
    case 'MouseWheelDown': return <ArrowDown size={ICON_SIZE} />;
    case 'MouseACPanLeft':
    case 'MouseXPanLeft': return <ArrowLeft size={ICON_SIZE} />;
    case 'MouseACPanRight':
    case 'MouseXPanRight': return <ArrowRight size={ICON_SIZE} />;
    case 'MouseXPanUp': return <ArrowUp size={ICON_SIZE} />;
    case 'MouseXPanDown': return <ArrowDown size={ICON_SIZE} />;
    case 'MediaSelect': return <Music size={ICON_SIZE} />;
    case 'Mail': return <Mail size={ICON_SIZE} />;
    case 'Calculator': return <Calculator size={ICON_SIZE} />;
    case 'MyComputer': return <Monitor size={ICON_SIZE} />;
    case 'WebSearch': return <Search size={ICON_SIZE} />;
    case 'WebHome': return <House size={ICON_SIZE} />;
    case 'WebFavorite': return <Heart size={ICON_SIZE} />;
    case 'WebForward': return <ArrowRight size={ICON_SIZE} />;
    case 'WebBack': return <ArrowLeft size={ICON_SIZE} />;
    case 'WebRefresh': return <RefreshCw size={ICON_SIZE} />;
    case 'WebStop': return <Square size={ICON_SIZE} />;
    case 'Power': return <Power size={ICON_SIZE} />;
    case 'Sleep': return <Moon size={ICON_SIZE} />;
    case 'Wake': return <Monitor size={ICON_SIZE} />;
    case 'RGBOnOff': return <ToggleRight size={ICON_SIZE} />;
    case 'RGBEffectLoop': return <RotateCcw size={ICON_SIZE} />;
    case 'RGBEffectValue': return 'FX';
    case 'BrightnessIncrease':
    case 'SpeedIncrease':
    case 'ColorIncrease': return <ArrowUp size={ICON_SIZE} />;
    case 'BrightnessDecrease':
    case 'SpeedDecrease':
    case 'ColorDecrease': return <ArrowDown size={ICON_SIZE} />;
    case 'SpeedLoop':
    case 'ColorLoop':
    case 'ProfilePlusLoop': return <InfinityIcon size={ICON_SIZE} />;
    case 'DirectionLoop': return '↻';
    case 'DirectionValue': return 'Dir';
    case 'ProfilePlus': return <ArrowRight size={ICON_SIZE} />;
    case 'ProfileMinus': return <ArrowLeft size={ICON_SIZE} />;
    case 'ProfileValue': return <User size={ICON_SIZE} />;
    case 'NumLock': return 'Num Lock';
    case 'Macro1': case 'Macro2': case 'Macro3': case 'Macro4':
    case 'Macro5': case 'Macro6': case 'Macro7': case 'Macro8':
    case 'Macro9': case 'Macro10': case 'Macro11': case 'Macro12':
    case 'Macro13': case 'Macro14': case 'Macro15': case 'Macro16':
      return func.replace('Macro', '');
    case 'Tab': return layout === 'ISO' ? 'Tab ↹' : 'Tab';
    case 'Pause': return 'Pause';
    case 'Backspace': return layout === 'ISO' ? '⌫' : 'Backspace';
    case 'End': return 'End';
    case 'Home': return 'Home';
    case 'Space': return 'Space';
    case 'NonUsPound': return '# ~';
    case 'NonUsBackslash': return '\\ |';
    case 'SoftwareControl': return 'SW';
    default:
      // F1-F24, A-Z, International{1..5}, Lang1 - display as-is.
      return func;
  }
}
