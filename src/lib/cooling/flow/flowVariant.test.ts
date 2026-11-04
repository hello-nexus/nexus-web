import { describe, expect, it } from 'vitest';
import { CURRENT_VARIANT, FLOW_VARIANTS, getFlowVariant } from './flowVariant';

describe('flow variants', () => {
  it('opens with a defined variant', () => {
    expect(getFlowVariant()).toBeDefined();
  });

  it('carries every field in every named variant and as the active one', () => {
    for (const variant of [getFlowVariant(), ...Object.values(FLOW_VARIANTS)]) {
      for (const key of Object.keys(CURRENT_VARIANT)) expect(variant, `${variant.name} ${key}`).toHaveProperty(key);
    }
  });
});
