import {
  AppWindow, Globe, FileText, Folder, FolderOpen, Volume2, VolumeX, Volume1,
  Play, Pause, SkipForward, SkipBack, Sun, SunDim, Keyboard, Type, Power, Lock,
  Moon, RotateCcw, LogOut, Headphones, Mic, MicOff, Lightbulb, Palette, Fan,
  Monitor, Gamepad2, ChevronRight, ChevronLeft, Layers, ListOrdered, ToggleLeft,
  Plus, Zap, Music, Wifi, Bluetooth, Camera, Image, Mail, MessageSquare,
  Calendar, Clock, Settings, Terminal, Search, Star, Heart, Home, Trash2,
  Download, Upload, Link, Bell, Sliders, Cpu, RefreshCw, Disc, Tv, Speaker,
  ArrowUp, ArrowDown, Command, MousePointer, Clipboard, Save, Copy, Eye,
  Sparkles, Flame, Snowflake, Wind, Battery, Plug, Rocket, Coffee, Briefcase,
  type LucideIcon,
} from 'lucide-react';
import type { DeckAction } from './types';

/** Curated stock icon set — the IconPicker source and the auto-icon source. */
export const DECK_ICONS: Record<string, LucideIcon> = {
  AppWindow, Globe, FileText, Folder, FolderOpen, Volume2, VolumeX, Volume1,
  Play, Pause, SkipForward, SkipBack, Sun, SunDim, Keyboard, Type, Power, Lock,
  Moon, RotateCcw, LogOut, Headphones, Mic, MicOff, Lightbulb, Palette, Fan,
  Monitor, Gamepad2, ChevronRight, ChevronLeft, Layers, ListOrdered, ToggleLeft,
  Plus, Zap, Music, Wifi, Bluetooth, Camera, Image, Mail, MessageSquare,
  Calendar, Clock, Settings, Terminal, Search, Star, Heart, Home, Trash2,
  Download, Upload, Link, Bell, Sliders, Cpu, RefreshCw, Disc, Tv, Speaker,
  ArrowUp, ArrowDown, Command, MousePointer, Clipboard, Save, Copy, Eye,
  Sparkles, Flame, Snowflake, Wind, Battery, Plug, Rocket, Coffee, Briefcase,
};

export const DECK_ICON_NAMES: string[] = Object.keys(DECK_ICONS);

export type DeckCategory =
  | 'launch' | 'open' | 'volume' | 'media' | 'brightness' | 'keyboard' | 'text'
  | 'power' | 'audio' | 'nexus' | 'sequence' | 'toggle' | 'folder' | 'empty';

/** Maps an action to a visual category (drives the auto icon + color). */
export function deckCategory(action: DeckAction | undefined): DeckCategory {
  if (!action) return 'empty';
  switch (action.type) {
    case 'launchApp': return 'launch';
    case 'openFile':
    case 'openFolder':
    case 'openUrl': return 'open';
    case 'system':
      if (action.action.op === 'openSettings') return 'open';
      if (action.action.op.startsWith('volume') || action.action.op === 'muteToggle') return 'volume';
      if (action.action.op.startsWith('media')) return 'media';
      return 'brightness';
    case 'hotkey': return 'keyboard';
    case 'text': return 'text';
    case 'power': return 'power';
    case 'audioOutput':
    case 'audioInput': return 'audio';
    case 'nexus': return 'nexus';
    case 'sequence': return 'sequence';
    case 'toggle': return 'toggle';
    default: return 'empty';
  }
}

// Pre-picked accent per category ("colors based on function"). Stock buttons
// render a subtle tint from this; the user can override per slot.
const CATEGORY_COLOR: Record<DeckCategory, string> = {
  launch: '#64748b',     // slate
  open: '#64748b',
  volume: '#06b6d4',     // cyan
  media: '#22c55e',      // green
  brightness: '#f59e0b', // amber
  keyboard: '#8b5cf6',   // violet
  text: '#a855f7',       // purple
  power: '#ef4444',      // red
  audio: '#3b82f6',      // blue
  nexus: '#f97316',      // orange
  sequence: '#eab308',   // yellow
  toggle: '#14b8a6',     // teal
  folder: '#94a3b8',     // neutral
  empty: '#475569',
};

export function categoryColor(category: DeckCategory): string {
  return CATEGORY_COLOR[category];
}

// Default lucide icon name (key into DECK_ICONS) per action when no explicit
// icon is set. Sub-op aware for system/nexus/power so a fresh slot is meaningful.
export function autoIconName(action: DeckAction | undefined, isFolder = false): string {
  if (isFolder) return 'Folder';
  if (!action) return 'Plus';
  switch (action.type) {
    case 'launchApp': return 'AppWindow';
    case 'openFile': return 'FileText';
    case 'openFolder': return 'FolderOpen';
    case 'openUrl': return 'Globe';
    case 'system':
      switch (action.action.op) {
        case 'volumeUp': return 'Volume2';
        case 'volumeDown': return 'Volume1';
        case 'volumeSet': return 'Volume2';
        case 'muteToggle': return 'VolumeX';
        case 'mediaPlayPause': return 'Play';
        case 'mediaNext': return 'SkipForward';
        case 'mediaPrev': return 'SkipBack';
        case 'brightnessUp': return 'Sun';
        case 'brightnessDown': return 'SunDim';
        case 'brightnessSet': return 'Sun';
        case 'openSettings': return 'Settings';
        default: return 'Sliders';
      }
    case 'hotkey': return 'Keyboard';
    case 'text': return 'Type';
    case 'power':
      switch (action.action) {
        case 'lock': return 'Lock';
        case 'sleep': return 'Moon';
        case 'shutdown': return 'Power';
        case 'restart': return 'RotateCcw';
        case 'logout': return 'LogOut';
        default: return 'Power';
      }
    case 'audioOutput': return 'Headphones';
    case 'audioInput': return 'Mic';
    case 'nexus':
      switch (action.action.op) {
        case 'rgbEffect':
        case 'rgbScene': return 'Palette';
        case 'lightingBrightness':
        case 'lightingPower': return 'Lightbulb';
        case 'fanProfile':
        case 'fanSpeed': return 'Fan';
        case 'y70Power':
        case 'y70Brightness':
        case 'y70Rotation': return 'Monitor';
        default: return 'Zap';
      }
    case 'sequence': return 'ListOrdered';
    case 'toggle': return 'ToggleLeft';
    default: return 'Plus';
  }
}
