import { describe, expect, it } from 'vitest';
import { isY70CaseId } from './y70Cases';

describe('isY70CaseId', () => {
  it('knows the case a Y70 display fills in and the other Y70 variants', () => {
    expect(isY70CaseId('517f12f3-4679-4d13-8832-0fcd2c2a40ea')).toBe(true);
    expect(isY70CaseId('075432e5-2925-4078-a139-ee6335cc6360')).toBe(true);
  });

  it('rejects other cases and no case', () => {
    expect(isY70CaseId('hyte-y70')).toBe(false);
    expect(isY70CaseId('')).toBe(false);
    expect(isY70CaseId(null)).toBe(false);
  });
});
