import { describe, expect, it } from 'vitest';
import { clampToSpec, parseShaderParams, resolveParamUniforms, type ShaderParamSpec } from './shaderParams';

describe('parseShaderParams', () => {
  it('parses a full uniform declaration', () => {
    const specs = parseShaderParams('uniform float u_zoom; // hint_range(0.5, 3.0, 0.05) = 1.0 spatial frequency\n');
    expect(specs).toEqual([{ name: 'u_zoom', min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.0, declared: true }]);
  });

  it('defaults step to 0.01 and default to min when both are omitted', () => {
    const specs = parseShaderParams('uniform float u_x; // hint_range(2.0, 8.0)\n');
    expect(specs).toEqual([{ name: 'u_x', min: 2.0, max: 8.0, step: 0.01, defaultValue: 2.0, declared: true }]);
  });

  it('lets a later line win over an earlier one for the same name', () => {
    const frag = [
      'uniform float u_saturation; // hint_range(0.0, 4.0, 0.01) = 1.0',
      '// u_saturation hint_range(0.4, 1.0, 0.01) = 1.0',
    ].join('\n');
    expect(parseShaderParams(frag)).toEqual([
      { name: 'u_saturation', min: 0.4, max: 1.0, step: 0.01, defaultValue: 1.0, declared: true },
    ]);
  });

  it('keeps declared true once a uniform line has been seen, even for a later comment-only override', () => {
    const frag = 'uniform float u_a; // hint_range(0.0, 1.0, 0.01) = 0.0\n// u_a hint_range(0.2, 0.8, 0.01) = 0.5\n';
    expect(parseShaderParams(frag)[0].declared).toBe(true);
  });

  it('marks a comment-only line with no prior declaration as undeclared', () => {
    const specs = parseShaderParams('// u_orphan hint_range(0.0, 1.0, 0.01) = 0.0\n');
    expect(specs[0].declared).toBe(false);
  });

  it('ignores a uniform line with no hint_range annotation', () => {
    expect(parseShaderParams('uniform float u_plain;\n')).toEqual([]);
  });

  it('parses every annotated line in a composed prelude + body source', () => {
    const frag = [
      'uniform float u_speed;      // hint_range(-2.0, 2.0, 0.02) = 1.0',
      'uniform float u_saturation; // hint_range(0.0, 4.0, 0.01) = 1.0',
      '// ---- effect body ----',
      'uniform float u_warp; // hint_range(0.0, 2.0, 0.05) = 1.0  domain-warp intensity',
    ].join('\n');
    const names = parseShaderParams(frag).map(s => s.name).sort();
    expect(names).toEqual(['u_saturation', 'u_speed', 'u_warp']);
  });
});

describe('clampToSpec', () => {
  const spec: ShaderParamSpec = { name: 'u_x', min: 0, max: 10, step: 1, defaultValue: 5, declared: true };

  it('passes a value through unchanged with no spec', () => {
    expect(clampToSpec(42, undefined)).toBe(42);
  });

  it('clamps a value below min', () => {
    expect(clampToSpec(-5, spec)).toBe(0);
  });

  it('clamps a value above max', () => {
    expect(clampToSpec(99, spec)).toBe(10);
  });

  it('leaves an in-range value alone', () => {
    expect(clampToSpec(7, spec)).toBe(7);
  });

  it('substitutes the default for a non-finite value', () => {
    expect(clampToSpec(NaN, spec)).toBe(5);
    expect(clampToSpec(Infinity, spec)).toBe(5);
    expect(clampToSpec(-Infinity, spec)).toBe(5);
  });

  it('clamps a default that itself sits outside min/max', () => {
    const oddSpec: ShaderParamSpec = { name: 'u_y', min: 0, max: 1, step: 0.1, defaultValue: 5, declared: true };
    expect(clampToSpec(NaN, oddSpec)).toBe(1);
  });
});

describe('resolveParamUniforms', () => {
  const specByName = new Map<string, ShaderParamSpec>([
    ['u_speed', { name: 'u_speed', min: -2, max: 2, step: 0.02, defaultValue: 1, declared: true }],
    ['u_zoom', { name: 'u_zoom', min: 0.5, max: 3, step: 0.05, defaultValue: 1, declared: true }],
  ]);

  it('excludes base uniforms even when present in specByName', () => {
    expect(resolveParamUniforms({ u_speed: 99, u_zoom: 2 }, specByName)).toEqual({ u_zoom: 2 });
  });

  it('fills the default for a declared param missing from params', () => {
    expect(resolveParamUniforms({}, specByName)).toEqual({ u_zoom: 1 });
  });

  it('treats an absent params dict as empty', () => {
    expect(resolveParamUniforms(undefined, specByName)).toEqual({ u_zoom: 1 });
  });

  it('clamps a declared param outside its range', () => {
    expect(resolveParamUniforms({ u_zoom: 50 }, specByName)).toEqual({ u_zoom: 3 });
  });

  it('passes an unannotated param through unchanged', () => {
    expect(resolveParamUniforms({ u_custom: 7 }, specByName)).toEqual({ u_zoom: 1, u_custom: 7 });
  });
});

it('names the LAST u_ identifier before hint_range on a line', () => {
  const [spec] = parseShaderParams('// u_foo relates to u_bar hint_range(0, 2, 0.5) = 1');
  expect(spec.name).toBe('u_bar');
});
