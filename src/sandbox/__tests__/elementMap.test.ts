// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ELEMENT_COMPONENTS } from '../elementMap';
import { UI_ELEMENT_NAMES } from '../contract/elements';

describe('SDK element map', () => {
  it('maps exactly the contract element set (no drift)', () => {
    const mapped = Object.keys(ELEMENT_COMPONENTS).sort();
    const contract = [...UI_ELEMENT_NAMES].sort();
    expect(mapped).toEqual(contract);
  });

  it('every mapped entry is a renderable component', () => {
    for (const name of UI_ELEMENT_NAMES) {
      expect(typeof ELEMENT_COMPONENTS[name]).toBe('function');
    }
  });
});
