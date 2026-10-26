import { describe, expect, it } from 'vitest';
import { Box3, Color, type Mesh } from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildDeskBoxes, curvedPanel } from './deskNodes';
import { DESK_ID, layoutDesk, monitorCurve, type DeskItem } from './deskScene';
import type { Dimmable, Palette } from './pcScene';

const palette: Palette = { part: new Color('#3b82f6'), frame: new Color('#888888'), bad: new Color('#ef4444'), limit: new Color('#f59e0b') };

describe('curvedPanel', () => {
  const radius = 1800;
  const { chord, sag } = monitorCurve(620, radius);
  const size: [number, number, number] = [chord, 360, 30 + sag];
  const { geometry, edges } = curvedPanel(size, radius);

  it('fills its bounding box: as tall as asked, deep by the bow and the panel, about a chord wide', () => {
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
    expect(box.max.y - box.min.y).toBeCloseTo(360);
    expect(box.max.z - box.min.z).toBeCloseTo(30 + sag, 1);
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(chord - 1e-6);
    expect(box.max.x - box.min.x).toBeLessThan(chord + 30);
  });

  it('is centered on its box', () => {
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
    expect((box.max.z + box.min.z) / 2).toBeCloseTo(0, 5);
    expect((box.max.x + box.min.x) / 2).toBeCloseTo(0, 5);
  });

  it('bows its edges toward +Z, the viewer', () => {
    const positions = geometry.getAttribute('position');
    let atCenter = -Infinity;
    let atEdge = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      if (Math.abs(x) < 1) atCenter = Math.max(atCenter, positions.getZ(i));
      if (Math.abs(x) > chord / 2 - 1) atEdge = Math.max(atEdge, positions.getZ(i));
    }
    expect(atEdge).toBeGreaterThan(atCenter);
  });

  it('draws its outline as whole segments', () => {
    expect(edges.length % 6).toBe(0);
    expect(edges.length).toBeGreaterThan(0);
  });
});


describe('buildDeskBoxes', () => {
  const items: DeskItem[] = [
    { id: 'desk:monitor:0', kind: 'monitor', specs: { screenSize: 27 }, custom: null },
    { id: 'desk:keyboard:0', kind: 'keyboard', specs: {}, custom: null },
  ];
  const layout = layoutDesk(items, null);
  const draw = () => {
    const materials: LineMaterial[] = [];
    const pickables: Mesh[] = [];
    const dimmables: Dimmable[] = [];
    const group = buildDeskBoxes(layout.boxes, palette, materials, pickables, dimmables);
    return { group, materials, pickables, dimmables };
  };

  it('draws one node per box, and every item or desk box is pickable by its id', () => {
    const { group, pickables } = draw();
    expect(group.children).toHaveLength(layout.boxes.length);
    expect(new Set(pickables.map((m) => m.userData.select))).toEqual(new Set(['desk:monitor:0', 'desk:keyboard:0', DESK_ID]));
  });

  it('a turned item rotates as one group about its own center', () => {
    const turned = layoutDesk([{ ...items[1], place: { yaw: 30 } }], null);
    const group = buildDeskBoxes(turned.boxes, palette, [], [], []);
    const node = group.children.find((n) => n.userData.moveIds?.[0] === 'desk:keyboard:0')!;
    expect(node.rotation.y).toBeCloseTo((30 * Math.PI) / 180);
  });

  it('gives each id its own dimmable', () => {
    const { dimmables } = draw();
    expect(new Set(dimmables.map((d) => d.id)).size).toBeGreaterThanOrEqual(3);
  });
});
