import { describe, expect, it } from 'vitest';
import { buildNoticeKey, selectBuildWidgetView } from './buildWidgetState';

const base = { isMac: false, loaded: true, caseId: null, previewUrl: null };

describe('selectBuildWidgetView', () => {
  it('shows the Apple logo on macOS whatever else is known', () => {
    expect(selectBuildWidgetView({ ...base, isMac: true, caseId: 'c', previewUrl: 'blob:x' })).toBe('mac');
    expect(selectBuildWidgetView({ ...base, isMac: true, loaded: false })).toBe('mac');
  });

  it('waits for the platform and the first fetch', () => {
    expect(selectBuildWidgetView({ ...base, isMac: null })).toBe('loading');
    expect(selectBuildWidgetView({ ...base, loaded: false })).toBe('loading');
  });

  it('picks the preview, then the case states', () => {
    expect(selectBuildWidgetView({ ...base, caseId: 'c', previewUrl: 'blob:x' })).toBe('preview');
    expect(selectBuildWidgetView({ ...base, caseId: 'c' })).toBe('no-preview');
    expect(selectBuildWidgetView(base)).toBe('no-case');
  });
});

describe('buildNoticeKey', () => {
  it('only the 4x4 tile carries a notice, and only in the silhouette states', () => {
    expect(buildNoticeKey('no-case', '4x4')).toBe('panel.widget.build.setCase');
    expect(buildNoticeKey('no-preview', '4x4')).toBe('panel.widget.build.openBuild');
    expect(buildNoticeKey('no-case', '2x2')).toBeNull();
    expect(buildNoticeKey('no-preview', '2x2')).toBeNull();
    expect(buildNoticeKey('preview', '4x4')).toBeNull();
    expect(buildNoticeKey('mac', '4x4')).toBeNull();
    expect(buildNoticeKey('loading', '4x4')).toBeNull();
  });
});
