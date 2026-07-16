import { describe, expect, it } from 'vitest';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';
import {
  iconKindForCapability,
  matchSessionApp,
  privacyIndicatorsForProcess,
  RECENT_WINDOW_MS,
} from './privacyHelpers';

const NOW = 10_000_000;

function session(over: Partial<PrivacySession> = {}): PrivacySession {
  return { app: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null, ...over };
}

describe('iconKindForCapability', () => {
  it('maps webcam/microphone/location 1:1', () => {
    expect(iconKindForCapability('webcam')).toBe('webcam');
    expect(iconKindForCapability('microphone')).toBe('microphone');
    expect(iconKindForCapability('location')).toBe('location');
  });

  it('collapses both graphicsCapture* variants onto screen', () => {
    expect(iconKindForCapability('graphicsCaptureProgrammatic')).toBe('screen');
    expect(iconKindForCapability('graphicsCaptureWithoutBorder')).toBe('screen');
  });
});

describe('matchSessionApp', () => {
  it('matches a win32 path basename against the process name, case-insensitive, extension stripped', () => {
    expect(matchSessionApp('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'chrome')).toBe(true);
    expect(matchSessionApp('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'Chrome')).toBe(true);
    expect(matchSessionApp('C:\\Program Files\\Google\\Chrome\\Application\\CHROME.EXE', 'chrome')).toBe(true);
  });

  it('matches a process name that itself still carries an extension', () => {
    expect(matchSessionApp('C:\\Windows\\System32\\SnippingTool.exe', 'SnippingTool.exe')).toBe(true);
  });

  it('supports a forward-slash path', () => {
    expect(matchSessionApp('/usr/bin/chrome', 'chrome')).toBe(true);
  });

  it('does not match a different process', () => {
    expect(matchSessionApp('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'firefox')).toBe(false);
  });

  it('a package family name (no path separator) never matches - PFN entries match nothing', () => {
    expect(matchSessionApp('Microsoft.WindowsCamera_8wekyb3d8bbwe', 'WindowsCamera')).toBe(false);
    expect(matchSessionApp('Microsoft.WindowsCamera_8wekyb3d8bbwe', 'Microsoft.WindowsCamera_8wekyb3d8bbwe')).toBe(false);
  });
});

describe('privacyIndicatorsForProcess', () => {
  it('ignores sessions for a different process', () => {
    const sessions = [session({ app: 'C:\\firefox.exe' })];
    expect(privacyIndicatorsForProcess(sessions, 'chrome', NOW)).toEqual([]);
  });

  it('an in-use session (end: null) surfaces as active', () => {
    const sessions = [session({ end: null })];
    const [indicator] = privacyIndicatorsForProcess(sessions, 'chrome', NOW);
    expect(indicator.kind).toBe('webcam');
    expect(indicator.state).toBe('active');
    expect(indicator.sessions).toEqual(sessions);
  });

  it('a session ended within the last hour surfaces as recent', () => {
    const sessions = [session({ end: NOW - 10 * 60_000 })];
    const [indicator] = privacyIndicatorsForProcess(sessions, 'chrome', NOW);
    expect(indicator.state).toBe('recent');
  });

  it('a session ended over an hour ago does not surface at all', () => {
    const sessions = [session({ end: NOW - RECENT_WINDOW_MS - 1 })];
    expect(privacyIndicatorsForProcess(sessions, 'chrome', NOW)).toEqual([]);
  });

  it('a session ended exactly at the recent-window boundary still surfaces', () => {
    const sessions = [session({ end: NOW - RECENT_WINDOW_MS })];
    expect(privacyIndicatorsForProcess(sessions, 'chrome', NOW)).toHaveLength(1);
  });

  it('merges both graphicsCapture* variants into one screen indicator', () => {
    const sessions = [
      session({ capability: 'graphicsCaptureProgrammatic', end: NOW - 5 * 60_000 }),
      session({ capability: 'graphicsCaptureWithoutBorder', end: null }),
    ];
    const indicators = privacyIndicatorsForProcess(sessions, 'chrome', NOW);
    expect(indicators).toHaveLength(1);
    expect(indicators[0].kind).toBe('screen');
    expect(indicators[0].state).toBe('active');
    expect(indicators[0].sessions).toHaveLength(2);
  });

  it('an active session makes the whole kind group active even alongside an ended one', () => {
    const sessions = [
      session({ capability: 'microphone', end: NOW - 5 * 60_000 }),
      session({ capability: 'microphone', end: null }),
    ];
    const indicators = privacyIndicatorsForProcess(sessions, 'chrome', NOW);
    expect(indicators[0].state).toBe('active');
  });

  it('sorts sessions within a group newest-first, an active session sorting as newest', () => {
    const older = session({ end: NOW - 40 * 60_000 });
    const active = session({ end: null });
    const newer = session({ end: NOW - 5 * 60_000 });
    const indicators = privacyIndicatorsForProcess([older, active, newer], 'chrome', NOW);
    expect(indicators[0].sessions).toEqual([active, newer, older]);
  });

  it('returns indicators in a stable kind order regardless of input order', () => {
    const sessions = [
      session({ capability: 'location', end: NOW - 100 }),
      session({ capability: 'microphone', end: null }),
      session({ capability: 'webcam', end: null }),
      session({ capability: 'graphicsCaptureProgrammatic', end: NOW - 100 }),
    ];
    const indicators = privacyIndicatorsForProcess(sessions, 'chrome', NOW);
    expect(indicators.map(i => i.kind)).toEqual(['webcam', 'microphone', 'location', 'screen']);
  });
});
