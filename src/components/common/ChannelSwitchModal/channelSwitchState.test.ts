import { describe, expect, it } from 'vitest';
import type { ChannelTarget } from '../../../api/update';
import { manualDownloadUrl, previewState } from './channelSwitchState';

const target = (over: Partial<ChannelTarget> = {}): ChannelTarget => ({
  channel: 'beta',
  currentVersion: '3.1.0',
  version: '3.1.1-beta.1',
  direction: 'upgrade',
  canAutoInstall: true,
  downloadUrl: '',
  releaseNotes: '',
  error: '',
  ...over,
});

describe('previewState', () => {
  it('is loading while the lookup is in flight', () => {
    expect(previewState(null)).toBe('loading');
  });

  it('fails when the lookup got no answer or the service reported an error', () => {
    expect(previewState(undefined)).toBe('failed');
    expect(previewState(target({ error: 'rate limited' }))).toBe('failed');
  });

  it('reports a channel with no release', () => {
    expect(previewState(target({ direction: 'none', version: '' }))).toBe('noRelease');
    expect(previewState(target({ version: '' }))).toBe('noRelease');
  });

  it('asks for a manual install where the service cannot install', () => {
    expect(previewState(target({ canAutoInstall: false }))).toBe('manual');
  });

  it('is ready for an upgrade or a downgrade', () => {
    expect(previewState(target())).toBe('ready');
    expect(previewState(target({ channel: 'production', version: '3.1.0', direction: 'downgrade' }))).toBe('ready');
  });
});

describe('manualDownloadUrl', () => {
  it('uses the release asset when it is an http(s) link', () => {
    expect(manualDownloadUrl(target({ downloadUrl: 'https://example.com/Nexus.dmg' }))).toBe('https://example.com/Nexus.dmg');
  });

  it('falls back to the download page for an empty or non-http link', () => {
    expect(manualDownloadUrl(target())).toBe('https://hellonexus.com/download');
    expect(manualDownloadUrl(target({ downloadUrl: 'javascript:alert(1)' }))).toBe('https://hellonexus.com/download');
  });
});
