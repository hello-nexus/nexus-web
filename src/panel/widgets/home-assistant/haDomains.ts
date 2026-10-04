import {
  Activity, Battery, Blinds, CircleDot, DoorClosed, DoorOpen, Droplet, Droplets, Fan,
  Lightbulb, Lock, LockOpen, MousePointerClick, Palette, PersonStanding, ScrollText,
  Sun, Thermometer, ToggleRight, Workflow, Zap, type LucideIcon,
} from 'lucide-react';
import type { HaDomain, HaEntity } from '../../../api/homeAssistant';

// What tapping an entity's badge does.
export type HaControl = 'toggle' | 'run' | 'cover' | 'lock' | 'none';

const CONTROL: Record<HaDomain, HaControl> = {
  light: 'toggle',
  switch: 'toggle',
  input_boolean: 'toggle',
  fan: 'toggle',
  automation: 'toggle',
  scene: 'run',
  script: 'run',
  button: 'run',
  input_button: 'run',
  cover: 'cover',
  lock: 'lock',
  sensor: 'none',
  binary_sensor: 'none',
};

// The room view keeps the original light/switch scope; dashboards show every supported domain.
const ROOM_DOMAINS: ReadonlySet<HaDomain> = new Set<HaDomain>(['light', 'switch']);

export function controlOf(domain: HaDomain): HaControl {
  return CONTROL[domain] ?? 'none';
}

export function isSupportedEntityId(entityId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONTROL, entityId.slice(0, entityId.indexOf('.')));
}

export function isRoomEntity(e: HaEntity): boolean {
  return ROOM_DOMAINS.has(e.domain) && !e.hidden;
}

// Light, cover and lock tiles open a detail dialog; the rest act from the badge alone.
export function hasDetail(e: HaEntity): boolean {
  const control = controlOf(e.domain);
  return control === 'toggle' || control === 'cover' || control === 'lock';
}

const OPENING_CLASSES = new Set(['door', 'garage_door', 'opening', 'window']);
const PRESENCE_CLASSES = new Set(['motion', 'occupancy', 'presence']);

export function entityIcon(e: HaEntity): LucideIcon {
  switch (e.domain) {
    case 'light': return Lightbulb;
    case 'switch': return Zap;
    case 'input_boolean': return ToggleRight;
    case 'fan': return Fan;
    case 'automation': return Workflow;
    case 'scene': return Palette;
    case 'script': return ScrollText;
    case 'button':
    case 'input_button': return MousePointerClick;
    case 'cover': return Blinds;
    case 'lock': return e.state === 'locked' ? Lock : LockOpen;
    case 'binary_sensor':
      if (OPENING_CLASSES.has(e.deviceClass)) return e.on ? DoorOpen : DoorClosed;
      if (PRESENCE_CLASSES.has(e.deviceClass)) return PersonStanding;
      if (e.deviceClass === 'moisture') return Droplets;
      return CircleDot;
    case 'sensor':
      switch (e.deviceClass) {
        case 'temperature': return Thermometer;
        case 'humidity': return Droplet;
        case 'battery': return Battery;
        case 'illuminance': return Sun;
        case 'power':
        case 'energy': return Zap;
        default: return Activity;
      }
    default: return CircleDot;
  }
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

// HA state slugs with a translated label; anything else shows HA's raw state.
const STATE_KEYS: Record<string, string> = {
  open: 'homeAssistant.state.open',
  closed: 'homeAssistant.state.closed',
  opening: 'homeAssistant.state.opening',
  closing: 'homeAssistant.state.closing',
  locked: 'homeAssistant.state.locked',
  unlocked: 'homeAssistant.state.unlocked',
  locking: 'homeAssistant.state.locking',
  unlocking: 'homeAssistant.state.unlocking',
  jammed: 'homeAssistant.state.jammed',
};

function binaryLabel(e: HaEntity, t: Translate): string {
  if (OPENING_CLASSES.has(e.deviceClass)) return t(e.on ? 'homeAssistant.state.open' : 'homeAssistant.state.closed');
  if (PRESENCE_CLASSES.has(e.deviceClass)) return t(e.on ? 'homeAssistant.state.detected' : 'homeAssistant.state.clear');
  if (e.deviceClass === 'moisture') return t(e.on ? 'homeAssistant.state.wet' : 'homeAssistant.state.dry');
  return t(e.on ? 'homeAssistant.on' : 'homeAssistant.off');
}

function sensorLabel(e: HaEntity, locale: string): string {
  if (e.deviceClass === 'timestamp') {
    const d = new Date(e.state);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const n = Number(e.state);
  const value = e.state.trim() !== '' && Number.isFinite(n)
    ? n.toLocaleString(locale, { maximumFractionDigits: 2 })
    : e.state;
  return e.unit ? `${value} ${e.unit}` : value;
}

export function stateLabel(e: HaEntity, t: Translate, locale: string): string {
  if (!e.reachable) return t('homeAssistant.unreachable');
  switch (controlOf(e.domain)) {
    case 'toggle':
      if (e.domain === 'light' && e.on && e.supportsBrightness && e.brightnessPct > 0) return `${e.brightnessPct}%`;
      return t(e.on ? 'homeAssistant.on' : 'homeAssistant.off');
    case 'run':
      if (e.domain === 'script' && e.state === 'on') return t('homeAssistant.state.running');
      if (e.domain === 'scene') return t('homeAssistant.action.activate');
      if (e.domain === 'script') return t('homeAssistant.action.run');
      return t('homeAssistant.action.press');
    case 'cover': {
      const label = STATE_KEYS[e.state] ? t(STATE_KEYS[e.state]) : e.state;
      return e.state === 'open' && e.positionPct >= 0 && e.positionPct < 100 ? `${label} · ${e.positionPct}%` : label;
    }
    case 'lock':
      return STATE_KEYS[e.state] ? t(STATE_KEYS[e.state]) : e.state;
    default:
      return e.domain === 'binary_sensor' ? binaryLabel(e, t) : sensorLabel(e, locale);
  }
}

// Badge highlight: lit when the entity is on, open or unlocked.
export function isActive(e: HaEntity): boolean {
  switch (controlOf(e.domain)) {
    case 'toggle': return e.on;
    case 'cover': return e.state === 'open' || e.state === 'opening';
    case 'lock': return e.state === 'unlocked' || e.state === 'open';
    default: return e.domain === 'binary_sensor' ? e.on : false;
  }
}
