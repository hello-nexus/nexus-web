import { describe, expect, it } from 'vitest';
import type { HaEntity } from '../../../api/homeAssistant';
import { controlOf, hasDetail, isActive, isRoomEntity, isSupportedEntityId, stateLabel } from './haDomains';

function entity(patch: Partial<HaEntity>): HaEntity {
  return {
    id: 'light.x', name: 'X', domain: 'light', state: 'off', on: false, reachable: true,
    brightnessPct: 0, supportsBrightness: false, supportsColor: false, supportsColorTemp: false,
    rgb: null, colorTempK: 0, area: '', unit: '', deviceClass: '', positionPct: -1,
    codeRequired: false, hidden: false,
    ...patch,
  };
}

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

describe('haDomains', () => {
  it('maps domains to their badge control', () => {
    expect(controlOf('fan')).toBe('toggle');
    expect(controlOf('scene')).toBe('run');
    expect(controlOf('input_button')).toBe('run');
    expect(controlOf('cover')).toBe('cover');
    expect(controlOf('lock')).toBe('lock');
    expect(controlOf('sensor')).toBe('none');
  });

  it('recognises supported entity ids only', () => {
    expect(isSupportedEntityId('binary_sensor.door')).toBe(true);
    expect(isSupportedEntityId('climate.hvac')).toBe(false);
    expect(isSupportedEntityId('nodot')).toBe(false);
  });

  it('keeps the room view to visible lights and switches', () => {
    expect(isRoomEntity(entity({ domain: 'switch' }))).toBe(true);
    expect(isRoomEntity(entity({ domain: 'switch', hidden: true }))).toBe(false);
    expect(isRoomEntity(entity({ domain: 'fan' }))).toBe(false);
  });

  it('opens a detail dialog only for controllable domains with settings', () => {
    expect(hasDetail(entity({ domain: 'lock' }))).toBe(true);
    expect(hasDetail(entity({ domain: 'scene' }))).toBe(false);
    expect(hasDetail(entity({ domain: 'sensor' }))).toBe(false);
  });

  it('labels states per domain', () => {
    expect(stateLabel(entity({ reachable: false }), t, 'en')).toBe('homeAssistant.unreachable');
    expect(stateLabel(entity({ on: true, supportsBrightness: true, brightnessPct: 40 }), t, 'en')).toBe('40%');
    expect(stateLabel(entity({ domain: 'script', state: 'on' }), t, 'en')).toBe('homeAssistant.state.running');
    expect(stateLabel(entity({ domain: 'scene', state: '2026-01-01T00:00:00Z' }), t, 'en')).toBe('homeAssistant.action.activate');
    expect(stateLabel(entity({ domain: 'cover', state: 'open', positionPct: 60 }), t, 'en')).toBe('homeAssistant.state.open · 60%');
    expect(stateLabel(entity({ domain: 'cover', state: 'closed', positionPct: 0 }), t, 'en')).toBe('homeAssistant.state.closed');
    expect(stateLabel(entity({ domain: 'lock', state: 'jammed' }), t, 'en')).toBe('homeAssistant.state.jammed');
    expect(stateLabel(entity({ domain: 'binary_sensor', deviceClass: 'door', on: true }), t, 'en')).toBe('homeAssistant.state.open');
    expect(stateLabel(entity({ domain: 'binary_sensor', deviceClass: 'motion', on: false }), t, 'en')).toBe('homeAssistant.state.clear');
    expect(stateLabel(entity({ domain: 'sensor', state: '21.4567', unit: '°C' }), t, 'en')).toBe('21.46 °C');
    expect(stateLabel(entity({ domain: 'sensor', state: 'heating' }), t, 'en')).toBe('heating');
  });

  it('lights the badge for on, open and unlocked', () => {
    expect(isActive(entity({ domain: 'cover', state: 'opening' }))).toBe(true);
    expect(isActive(entity({ domain: 'lock', state: 'locked' }))).toBe(false);
    expect(isActive(entity({ domain: 'lock', state: 'unlocked' }))).toBe(true);
    expect(isActive(entity({ domain: 'scene' }))).toBe(false);
  });
});
