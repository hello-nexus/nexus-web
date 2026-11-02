import { describe, expect, it } from 'vitest';
import { selectBuildWidgetView } from './buildWidgetState';

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
