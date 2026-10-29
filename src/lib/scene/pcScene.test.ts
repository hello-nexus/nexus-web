import { describe, expect, it } from 'vitest';
import { Color, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import fixture from '../cooling/__fixtures__/y70-case-layout.json';
import { parseCaseLayout, sceneLayout } from '../cooling/caseLayout';
import { buildCase, type SceneBox, type SceneLayout } from './pcScene';
import { sceneSignature } from './pcSceneSignature';

const palette = { part: new Color('#3b82f6'), frame: new Color('#888888'), bad: new Color('#ef4444'), limit: new Color('#f59e0b') };
const draw = (layout: SceneLayout, omitFans = false) => buildCase(layout, palette, [], [], [], true, false, true, omitFans);

const box = (over: Partial<SceneBox>): SceneBox => ({ slot: 'x', role: 'part', min: [0, 0, 0], size: [10, 10, 10], ...over });
const meshes = (root: Object3D) => { const out: Mesh[] = []; root.traverse(o => { if ((o as Mesh).isMesh) out.push(o as Mesh); }); return out; };
// Fat lines are Line2 meshes on a LineMaterial; the surfaces are the plain meshes.
const surfaces = (root: Object3D) => meshes(root).filter(m => m.material instanceof MeshBasicMaterial);
const depthWriters = (root: Object3D) => surfaces(root).filter(m => (m.material as MeshBasicMaterial).depthWrite);

// What a Build setup record carries beyond the plain fixture: hoses, a card with estimated fans, an on-shell plate, a CAD solid, a conflict.
const richRaw = {
  ...fixture,
  lines: [
    { slot: 'cooler', role: 'part', radius: 6, points: [[10, 10, 10], [10, 40, 10], [60, 60, 10]] },
    { slot: 'cable', role: 'detail', points: [[0, 0, 0], [30, 30, 30]] },
  ],
  boxes: [
    ...fixture.boxes,
    { slot: 'gpu', role: 'part', min: [20, 20, 20], size: [300, 40, 120], source: 'estimate', fans: { axis: 'y', diameter: 90, count: 2, side: 'max', source: 'estimate', sizes: [90, 80] } },
    { slot: 'case', role: 'structure', min: [0, 0, 0], size: [0, 200, 300], plate: { normal: 0, outline: [[0, 0], [200, 0], [200, 300], [0, 300]], holes: [[[20, 20], [60, 20], [60, 60], [20, 60]]], onShell: true } },
    { slot: 'psu', role: 'part', min: [300, 0, 10], size: [100, 80, 120], cadSolid: true, conflict: true },
  ],
};

describe('the case never writes depth over what is inside it', () => {
  it('leaves the shell and glass without a depth prepass, so interior content shows through', () => {
    const group = draw({ size: [400, 300, 200], lines: [], boxes: [box({ slot: 'case', role: 'structure', size: [400, 200, 300] }), box({ slot: 'case', role: 'glass', size: [400, 200, 0] })] });
    expect(depthWriters(group)).toEqual([]);
    expect(surfaces(group).length).toBeGreaterThan(0);
    expect(surfaces(group).every(m => (m.material as MeshBasicMaterial).transparent)).toBe(true);
  });

  it('writes depth only in colorless prepasses of part boxes, as Build does', () => {
    const group = draw(sceneLayoutOf(richRaw));
    const writers = depthWriters(group);
    expect(writers.length).toBeGreaterThan(0);
    for (const m of writers) expect((m.material as MeshBasicMaterial).colorWrite).toBe(false);
    // One prepass per part or detail box, none for the case's structure or glass.
    const solid = richRaw.boxes.filter(b => b.role === 'part' || b.role === 'detail').length;
    expect(writers).toHaveLength(solid);
  });
});

function sceneLayoutOf(raw: unknown): SceneLayout {
  return sceneLayout(parseCaseLayout(raw)!);
}

describe('a flat cable line', () => {
  const ribbonLayout = (): SceneLayout => ({
    size: [400, 300, 200],
    boxes: [],
    lines: [{ slot: 'gpu', role: 'part', points: [[10, 10, 10], [10, 60, 10], [10, 110, 10]], ribbon: { width: 40, thickness: 10, across: [[1, 0, 0], [1, 0, 0], [1, 0, 0]] } }],
  });

  it('draws one translucent band that writes no depth, plus its four rim lines', () => {
    const group = draw(ribbonLayout());
    const bands = surfaces(group);
    expect(bands).toHaveLength(1);
    const material = bands[0].material as MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(meshes(group).length - bands.length).toBe(4);
  });
});

describe('the setup record draws what Build draws', () => {
  it.each([['the Y70 fixture', fixture], ['a record with hoses, estimated fans, an on-shell plate and a CAD solid', richRaw]])('builds the same scene graph from %s through the record parser and from the raw layout', (_name, raw) => {
    const direct = draw({ lines: [], ...(raw as object) } as SceneLayout);
    const viaRecord = draw(sceneLayoutOf(raw));
    expect(meshes(direct).length).toBeGreaterThan(10);
    expect(sceneSignature(viaRecord)).toEqual(sceneSignature(direct));
  });
});
