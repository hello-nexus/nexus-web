import { describe, expect, it } from 'vitest';
import { deskSpec } from './deskCatalog';
import { DESK_HEIGHT, DESK_ID, DESK_SPOT, DEFAULT_CURVE_RADIUS, catalogCurve, clampCenter, collidesAt, curveRadius, floorSpot, freeSpot, halfExtents, isOnDesk, itemSize, keepExtents, lDeskRect, layoutDesk, monitorCurve, overlaps, placedItemBoxes, settledAt, deskLegBoxes, deskSlabBoxes, type DeskCustom, type DeskItem, type DeskKind, type DeskPlacement } from './deskScene';

type CustomItem = DeskCustom & { id: string; name: string; kind: string };
const deskCustomId = (id: string) => `desk:c:${id}`;
const item = (kind: DeskKind, specs: Record<string, unknown> | null = {}, custom: CustomItem | null = null, id = `desk:${kind}:0`): DeskItem => ({ id, kind, specs, custom });
const CASE: [number, number, number] = [450, 230, 470];
const byId = (layout: ReturnType<typeof layoutDesk>, id: string) => layout.boxes.filter((b) => b.id === id);

describe('itemSize', () => {
  it('takes catalog dimensions axis by axis and falls back to the app default for a missing one', () => {
    const spec = deskSpec('mouse').size;
    expect(itemSize(item('mouse', { widthMm: 70, depthMm: 110 }))).toEqual([70, spec[1], 110]);
    expect(itemSize(item('keyboard', { widthMm: 449.6, heightMm: 22.9, depthMm: 154.9 }))).toEqual([449.6, 22.9, 154.9]);
  });

  it('uses the app defaults when the part has no dimensions or a bad one', () => {
    expect(itemSize(item('keyboard', {}))).toEqual(deskSpec('keyboard').size);
    expect(itemSize(item('speaker', { widthMm: -3, depthMm: 'x' }))).toEqual(deskSpec('speaker').size);
    expect(itemSize(item('headphones', null))).toEqual(deskSpec('headset').size);
  });

  it('draws a monitor from its screen size at 16:9 with a bezel, and the default panel without one', () => {
    const [w, h, d] = itemSize(item('monitor', { screenSize: 27 }));
    expect(w - 24).toBeCloseTo(597.6, 0);
    expect(h - 24).toBeCloseTo(336.2, 0);
    expect((w - 24) / (h - 24)).toBeCloseTo(16 / 9, 2);
    expect(d).toBeGreaterThan(0);
    expect(itemSize(item('monitor', {}))).toEqual(deskSpec('monitor').size);
  });

  it('sizes a custom desk from its stated size and a webcam from its own default', () => {
    const desk = itemSize(item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: 1800 }));
    expect(desk[0]).toBe(1800);
    expect(desk[2]).toBe(800);
    expect(itemSize(item('webcam', null))[0]).toBeLessThan(150);
  });
});

describe('itemSize', () => {
  it('takes catalog dimensions axis by axis and falls back to the app default for a missing one', () => {
    const spec = deskSpec('mouse').size;
    expect(itemSize(item('mouse', { widthMm: 70, depthMm: 110 }))).toEqual([70, spec[1], 110]);
    expect(itemSize(item('keyboard', { widthMm: 449.6, heightMm: 22.9, depthMm: 154.9 }))).toEqual([449.6, 22.9, 154.9]);
  });

  it('uses the app defaults when the part has no dimensions or a bad one', () => {
    expect(itemSize(item('keyboard', {}))).toEqual(deskSpec('keyboard').size);
    expect(itemSize(item('speaker', { widthMm: -3, depthMm: 'x' }))).toEqual(deskSpec('speaker').size);
    expect(itemSize(item('headphones', null))).toEqual(deskSpec('headset').size);
  });

  it('draws a monitor from its screen size at 16:9 with a bezel, and the default panel without one', () => {
    const [w, h, d] = itemSize(item('monitor', { screenSize: 27 }));
    expect(w - 24).toBeCloseTo(597.6, 0);
    expect(h - 24).toBeCloseTo(336.2, 0);
    expect((w - 24) / (h - 24)).toBeCloseTo(16 / 9, 2);
    expect(d).toBeGreaterThan(0);
    expect(itemSize(item('monitor', {}))).toEqual(deskSpec('monitor').size);
  });

  it('sizes a custom desk from its stated size and a webcam from its own default', () => {
    const desk = itemSize(item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: 1800 }));
    expect(desk[0]).toBe(1800);
    expect(desk[2]).toBe(800);
    expect(itemSize(item('webcam', null))[0]).toBeLessThan(150);
  });
});

describe('layoutDesk', () => {
  it('puts the monitor at the back, the keyboard at the front and the mouse to its right on the pad', () => {
    const layout = layoutDesk([item('monitor'), item('keyboard'), item('mouse'), item('mousepad')], CASE);
    const panel = byId(layout, 'desk:monitor:0')[0];
    const keyboard = byId(layout, 'desk:keyboard:0')[0];
    const mouse = byId(layout, 'desk:mouse:0')[0];
    const pad = byId(layout, 'desk:mousepad:0')[0];
    const center = (b: typeof panel, axis: 0 | 2) => b.min[axis] + b.size[axis] / 2;
    expect(center(panel, 0)).toBeCloseTo(center(keyboard, 0));
    expect(center(panel, 2)).toBe(deskSpec('monitor').home[2]);
    expect(center(keyboard, 2)).toBeGreaterThan(center(panel, 2));
    expect(center(mouse, 0)).toBeGreaterThan(center(keyboard, 0));
    expect(mouse.min[1]).toBe(pad.size[1]);
    expect(pad.min[1]).toBe(0);
  });

  it('rests a mouse on the desk when there is no pad under it', () => {
    expect(byId(layoutDesk([item('mouse')], CASE), 'desk:mouse:0')[0].min[1]).toBe(0);
  });

  it('raises the monitor on a stand and shares one id across its boxes', () => {
    const boxes = byId(layoutDesk([item('monitor', { screenSize: 27 })], CASE), 'desk:monitor:0');
    expect(boxes).toHaveLength(3);
    const panel = boxes.reduce((a, b) => (b.size[1] > a.size[1] ? b : a));
    expect(panel.min[1]).toBeGreaterThan(0);
    expect(boxes.some((b) => b.min[1] === 0)).toBe(true);
  });

  it('puts the first monitor over the keyboard and wings the others out either side, turned in', () => {
    const layout = layoutDesk([item('monitor', { screenSize: 24 }, null, 'm0'), item('monitor', { screenSize: 24 }, null, 'm1'), item('monitor', { screenSize: 24 }, null, 'm2'), item('keyboard')], null);
    const [m0, m1, m2] = ['m0', 'm1', 'm2'].map((id) => layout.spots[id]);
    expect(m0.cx).toBeCloseTo(layout.spots['desk:keyboard:0'].cx);
    expect(m1.cx).toBeGreaterThan(m0.cx);
    expect(m2.cx).toBeLessThan(m0.cx);
    expect(m1.yaw).toBe(345);
    expect(m2.yaw).toBe(15);
    // The wings come toward the user at their outer ends.
    expect(m1.cz).toBeGreaterThan(m0.cz);
  });

  it('stands a webcam on the first monitor, else at the back of the desk', () => {
    const on = layoutDesk([item('monitor', { screenSize: 27 }), item('webcam')], CASE);
    const panel = byId(on, 'desk:monitor:0').reduce((a, b) => (b.size[1] > a.size[1] ? b : a));
    expect(byId(on, 'desk:webcam:0')[0].min[1]).toBeCloseTo(panel.min[1] + panel.size[1]);
    expect(byId(layoutDesk([item('webcam')], CASE), 'desk:webcam:0')[0].min[1]).toBe(0);
  });

  it('puts speakers either side of the monitors', () => {
    const layout = layoutDesk([item('speaker', {}, null, 's0'), item('speaker', {}, null, 's1')], CASE);
    expect(byId(layout, 's0')[0].min[0]).toBeLessThan(0);
    expect(byId(layout, 's1')[0].min[0]).toBeGreaterThan(0);
  });

  it('draws a default desk under everything, with no row of its own', () => {
    const layout = layoutDesk([item('keyboard')], CASE);
    const desk = layout.boxes[0];
    expect(desk).toMatchObject({ id: DESK_ID, kind: 'desk' });
    expect(desk.min[1] + desk.size[1]).toBe(0);
    expect(desk.size[0]).toBeGreaterThanOrEqual(1600);
    expect(desk.size[2]).toBeGreaterThanOrEqual(800);
    expect(layout.caseSpot).toEqual(DESK_SPOT);
  });

  it('widens the default desk to hold a case that overhangs it', () => {
    const wide = layoutDesk([item('keyboard')], [450, 600, 470]);
    const desk = wide.boxes[0];
    expect(desk.min[0] + desk.size[0]).toBeGreaterThanOrEqual(DESK_SPOT[0] + 300);
  });

  it('uses a custom desk at its stated size, owning the desk id', () => {
    const custom: CustomItem = { id: 'd', name: 'Oak', kind: 'desk', widthMm: 1400, depthMm: 700 };
    const layout = layoutDesk([item('desk', null, custom, deskCustomId('d')), item('keyboard')], null);
    const desk = layout.boxes[0];
    expect(desk.id).toBe(DESK_ID);
    expect(desk.size[0]).toBe(1400);
    expect(desk.size[2]).toBe(700);
    // The slab and its four legs.
    expect(layout.boxes.filter((b) => b.kind === 'desk')).toHaveLength(5);
  });

  it('bounds the whole scene: desk, items and the case on the desk', () => {
    const layout = layoutDesk([item('monitor', { screenSize: 27 }), item('keyboard')], CASE);
    const { min, max, size, center } = layout.bounds;
    for (const box of layout.boxes) for (let i = 0; i < 3; i++) {
      expect(box.min[i]).toBeGreaterThanOrEqual(min[i] - 1e-6);
      expect(box.min[i] + box.size[i]).toBeLessThanOrEqual(max[i] + 1e-6);
    }
    expect(max[1]).toBeGreaterThanOrEqual(CASE[2]);
    expect(max[0]).toBeGreaterThanOrEqual(DESK_SPOT[0] + CASE[1] / 2);
    // The legs reach the floor and are framed with the rest.
    expect(min[1]).toBe(-DESK_HEIGHT);
    size.forEach((v, i) => expect(v).toBeCloseTo(max[i] - min[i]));
    center.forEach((v, i) => expect(v).toBeCloseTo((max[i] + min[i]) / 2));
  });

  it('bounds only the desk and its items when there is no case', () => {
    const withCase = layoutDesk([item('keyboard')], [450, 230, 2000]);
    const without = layoutDesk([item('keyboard')], null);
    expect(without.bounds.max[1]).toBeLessThan(withCase.bounds.max[1]);
  });
});

describe('catalogCurve and curveRadius', () => {
  it('reads a stated radius or the word Curved from a title, and a flat panel otherwise', () => {
    expect(catalogCurve('Acer EI322QUR 31.5" 1500R Curved Monitor')).toBe(1500);
    expect(catalogCurve('Sceptre C275W 27" Curved Monitor')).toBe(DEFAULT_CURVE_RADIUS);
    expect(catalogCurve('Dell U2415 24" IPS Monitor')).toBeNull();
    expect(catalogCurve(undefined)).toBeNull();
  });

  it('lets the user override the catalog either way', () => {
    expect(curveRadius({ curved: false }, 'X 1500R Curved')).toBeNull();
    expect(curveRadius({ curved: true }, 'X Monitor')).toBe(DEFAULT_CURVE_RADIUS);
    expect(curveRadius({ curved: true }, 'X 1000R Curved')).toBe(1000);
    expect(curveRadius(undefined, 'X Curved')).toBe(DEFAULT_CURVE_RADIUS);
  });
});

describe('monitorCurve', () => {
  it('bows the edges toward the viewer by the sag of the arc', () => {
    const { chord, sag, theta } = monitorCurve(600, 1800);
    expect(theta).toBeCloseTo(600 / 1800);
    expect(chord).toBeLessThan(600);
    expect(chord).toBeGreaterThan(590);
    expect(sag).toBeCloseTo(1800 * (1 - Math.cos(theta / 2)));
  });
});

describe('layoutDesk placement', () => {
  const keyboard = (place?: DeskPlacement): DeskItem => ({ ...item('keyboard'), place });
  const spotOf = (layout: ReturnType<typeof layoutDesk>, id = 'desk:keyboard:0') => layout.spots[id];

  it('puts an item at its stored spot, and an item without one where the catalog does', () => {
    const home = layoutDesk([keyboard()], CASE);
    const moved = layoutDesk([keyboard({ x: 100, z: 50 })], CASE);
    expect(spotOf(moved)).toMatchObject({ cx: 100, cz: 50 });
    expect(spotOf(home).cx).toBe(deskSpec('keyboard').home[0]);
  });

  it('keeps an item on the desk, whatever is stored', () => {
    const layout = layoutDesk([keyboard({ x: 99999 / 20, z: -4000 })], CASE);
    const { cx, cz, hw, hd } = spotOf(layout);
    expect(cx + hw).toBeLessThanOrEqual(layout.rect.x1 + 1e-6);
    expect(cz - hd).toBeGreaterThanOrEqual(layout.rect.z0 - 1e-6);
  });

  it('never sizes the desk from stored spots', () => {
    const home = layoutDesk([keyboard()], CASE);
    const far = layoutDesk([keyboard({ x: 4000, z: 4000 })], CASE);
    expect(far.rect).toEqual(home.rect);
  });

  it('turns an item about its center and bounds the turned footprint', () => {
    const turned = layoutDesk([keyboard({ yaw: 90 })], null);
    const flat = layoutDesk([keyboard()], null);
    expect(turned.boxes.find((b) => b.id === 'desk:keyboard:0')).toMatchObject({ yaw: 90 });
    const s = spotOf(turned);
    expect(s.hw).toBeCloseTo(spotOf(flat).hd);
    expect(s.hd).toBeCloseTo(spotOf(flat).hw);
  });

  it('moves the case and turns it, clamped to the desk', () => {
    const layout = layoutDesk([], CASE, { x: 0, z: 0, yaw: 90 });
    expect(layout.caseSpot).toEqual([0, 0, 0]);
    expect(layout.caseYaw).toBe(90);
    expect(layout.spots.case).toMatchObject({ cx: 0, cz: 0, yaw: 90 });
    const off = layoutDesk([], CASE, { x: 50000 / 20, z: 0 });
    expect(off.spots.case.cx + off.spots.case.hw).toBeLessThanOrEqual(off.rect.x1 + 1e-6);
  });

  it('keeps a webcam on the first monitor as it moves, until the webcam gets a spot of its own', () => {
    const monitor = (place?: DeskPlacement): DeskItem => ({ ...item('monitor', { screenSize: 27 }), place });
    const riding = layoutDesk([monitor({ x: -200, z: -150 }), item('webcam')], CASE);
    expect(spotOf(riding, 'desk:webcam:0')).toMatchObject({ cx: -200, cz: -150 });
    expect(riding.boxes.find((b) => b.id === 'desk:webcam:0')?.rideId).toBe('desk:monitor:0');
    const own = layoutDesk([monitor({ x: -200, z: -150 }), { ...item('webcam'), place: { x: 300, z: 100 } }], CASE);
    expect(spotOf(own, 'desk:webcam:0')).toMatchObject({ cx: 300, cz: 100 });
    expect(own.boxes.find((b) => b.id === 'desk:webcam:0')?.rideId).toBeUndefined();
  });

  it('rests a mouse on the pad only while it is over it', () => {
    const pad = item('mousepad');
    const on = layoutDesk([pad, item('mouse')], CASE);
    const off = layoutDesk([pad, { ...item('mouse'), place: { x: -500, z: 0 } }], CASE);
    expect(on.boxes.find((b) => b.id === 'desk:mouse:0')!.min[1]).toBeGreaterThan(0);
    expect(off.boxes.find((b) => b.id === 'desk:mouse:0')!.min[1]).toBe(0);
  });

  it('draws a curved monitor deeper than a flat one and narrower by the chord', () => {
    const flat = layoutDesk([item('monitor', { screenSize: 27 })], null);
    const curved = layoutDesk([{ ...item('monitor', { screenSize: 27 }), curveRadius: 1000 }], null);
    const panel = (l: typeof flat) => l.boxes.filter((b) => b.id === 'desk:monitor:0').reduce((a, b) => (b.size[1] > a.size[1] ? b : a));
    expect(panel(curved).size[2]).toBeGreaterThan(panel(flat).size[2]);
    expect(panel(curved).size[0]).toBeLessThan(panel(flat).size[0]);
    expect(panel(curved).curveRadius).toBe(1000);
  });

  it('clamps a center so a footprint stays inside the rect, and centers one larger than the desk', () => {
    const rect = { x0: -100, x1: 100, z0: -50, z1: 50 };
    expect(clampCenter(500, -500, 20, 10, rect)).toEqual([80, -40]);
    expect(clampCenter(0, 0, 300, 10, rect)[0]).toBe(0);
    expect(halfExtents(100, 40, 90)).toEqual({ hw: expect.closeTo(20), hd: expect.closeTo(50) });
  });
});

describe('layoutDesk case home', () => {
  const widest = (layout: ReturnType<typeof layoutDesk>) => Math.max(...layout.boxes.filter((b) => b.kind === 'monitor').map((b) => b.min[0] + b.size[0]));

  it('keeps the case at the app\'s spot while the monitors leave it room', () => {
    expect(layoutDesk([item('monitor', { screenSize: 24 })], CASE).caseSpot).toEqual(DESK_SPOT);
  });

  it('moves the case past monitors that reach its spot', () => {
    const items = [item('monitor', { screenSize: 24 }, null, 'm0'), item('monitor', { screenSize: 24 }, null, 'm1')];
    const layout = layoutDesk(items, CASE);
    expect(layout.caseSpot[0] - CASE[1] / 2).toBeGreaterThanOrEqual(widest(layout));
    expect(layout.spots.case.cx + layout.spots.case.hw).toBeLessThanOrEqual(layout.rect.x1 + 1e-6);
  });
});

describe('monitor aspect', () => {
  const sized = (aspect?: number) => itemSize({ ...item('monitor', { screenSize: 34 }), aspect });

  it('sizes a monitor from its diagonal at its own ratio, 16:9 when none is known', () => {
    const [w, h] = sized(21 / 9);
    const [w16, h16] = sized();
    expect((w - 24) / (h - 24)).toBeCloseTo(21 / 9, 2);
    expect(Math.hypot(w - 24, h - 24)).toBeCloseTo(34 * 25.4, 0);
    expect(w).toBeGreaterThan(w16);
    expect(h).toBeLessThan(h16);
  });

});

// Whether two turned footprints overlap, by the separating axis test.
function overlapsRef(a: { cx: number; cz: number; w: number; d: number; yaw: number }, b: typeof a): boolean {
  const corners = (r: typeof a) => {
    const t = (r.yaw * Math.PI) / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const x = (sx * r.w) / 2;
      const z = (sz * r.d) / 2;
      return [r.cx + x * Math.cos(t) + z * Math.sin(t), r.cz - x * Math.sin(t) + z * Math.cos(t)];
    });
  };
  const [pa, pb] = [corners(a), corners(b)];
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const axis = [z1 - z2, x2 - x1];
      const project = (p: number[][]) => p.map(([x, z]) => x * axis[0] + z * axis[1]);
      const [ra, rb] = [project(pa), project(pb)];
      if (Math.max(...ra) <= Math.min(...rb) + 1e-6 || Math.max(...rb) <= Math.min(...ra) + 1e-6) return false;
    }
  }
  return true;
}

describe('layoutDesk defaults do not collide', () => {
  const sets: Record<string, DeskItem[]> = {
    'one monitor, keyboard, pad, mouse': [item('monitor', { screenSize: 27 }), item('keyboard'), item('mousepad'), item('mouse')],
    'three monitors with everything': [item('monitor', { screenSize: 24 }, null, 'm0'), item('monitor', { screenSize: 27 }, null, 'm1'), item('monitor', { screenSize: 24 }, null, 'm2'), item('keyboard'), item('mousepad'), item('mouse'), item('headphones'), item('speaker', {}, null, 's0'), item('speaker', {}, null, 's1'), item('webcam')],
    'two keyboards and two pads': [item('keyboard', {}, null, 'k0'), item('keyboard', {}, null, 'k1'), item('mousepad', {}, null, 'p0'), item('mousepad', {}, null, 'p1')],
    'four monitors, four speakers': [0, 1, 2, 3].map((n) => item('monitor', { screenSize: 27 }, null, `m${n}`)).concat([0, 1, 2, 3].map((n) => item('speaker', {}, null, `s${n}`))),
  };

  for (const [name, items] of Object.entries(sets)) {
    it(`${name}: no two items or the case overlap, and all of them stand on the desk`, () => {
      const layout = layoutDesk(items, CASE);
      const ids = Object.keys(layout.spots);
      const nested = (a: string, b: string) => (a.includes('mouse') && b.includes('mousepad')) || (b.includes('mouse') && a.includes('mousepad')) || a.includes('webcam') || b.includes('webcam');
      for (let i = 0; i < ids.length; i++) {
        const s = layout.spots[ids[i]];
        expect(s.cx - s.hw).toBeGreaterThanOrEqual(layout.rect.x0 - 1);
        expect(s.cx + s.hw).toBeLessThanOrEqual(layout.rect.x1 + 1);
        for (let j = i + 1; j < ids.length; j++) {
          if (nested(ids[i], ids[j])) continue;
          expect(overlapsRef(s, layout.spots[ids[j]]), `${ids[i]} against ${ids[j]}`).toBe(false);
        }
      }
      expect(layout.unfit).toEqual([]);
    });
  }

  it('keeps the same defaults after a reset, which is the layout with no stored spots', () => {
    const items = sets['one monitor, keyboard, pad, mouse'];
    const moved = items.map((i) => ({ ...i, place: { x: 10, z: 10 } }));
    const reset = items.map((i) => ({ ...i, place: undefined }));
    expect(layoutDesk(reset, CASE).spots).toEqual(layoutDesk(items, CASE).spots);
    expect(layoutDesk(moved, CASE).spots['desk:keyboard:0']).toMatchObject({ cx: 10, cz: 10 });
  });
});

describe('layoutDesk on a desk that is too small', () => {
  const desk = (w: number, d: number): DeskItem => item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: w, depthMm: d }, deskCustomId('d'));

  it('keeps an item on the floor where it was left when the desk shrinks from under it, and holds one that straddles the edge on the desk by the least it must', () => {
    const placed: DeskItem = { ...item('keyboard'), place: { x: 700, z: 0 } };
    const wide = layoutDesk([desk(2000, 900), placed], null);
    expect(wide.spots['desk:keyboard:0']).toMatchObject({ cx: 700, cz: 0 });
    const narrow = layoutDesk([desk(900, 600), placed], null);
    expect(narrow.spots['desk:keyboard:0']).toMatchObject({ cx: 700, cz: 0 });
    expect(narrow.unfit).toEqual(['desk:keyboard:0']);
    const straddling = layoutDesk([desk(900, 600), { ...item('keyboard'), place: { x: 300, z: 0 } }], null);
    expect(straddling.spots['desk:keyboard:0'].cx).toBeCloseTo(straddling.rect.x1 - straddling.spots['desk:keyboard:0'].hw);
    expect(straddling.spots['desk:keyboard:0'].cz).toBe(0);
    expect(straddling.unfit).toEqual([]);
  });

  it('names what fits nowhere and stands it beside the desk, never clamped over the others', () => {
    const layout = layoutDesk([desk(300, 300), item('keyboard')], [450, 230, 470]);
    expect(layout.unfit).toContain('desk:keyboard:0');
    expect(layout.unfit).toContain('case');
    expect(layout.spots['desk:keyboard:0'].cx - layout.spots['desk:keyboard:0'].hw).toBeGreaterThanOrEqual(layout.rect.x1);
    expect(overlaps(layout.spots['desk:keyboard:0'], layout.spots.case)).toBe(false);
  });
});

describe('webcams', () => {
  const monitor: DeskItem = item('monitor', { screenSize: 27 });

  it('keeps its own turn while riding a monitor', () => {
    const layout = layoutDesk([monitor, { ...item('webcam'), place: { yaw: 45 } }], null);
    expect(layout.spots['desk:webcam:0'].yaw).toBe(45);
    expect(layout.spots['desk:webcam:0'].cx).toBe(layout.spots['desk:monitor:0'].cx);
    expect(layout.boxes.find((b) => b.id === 'desk:webcam:0')?.rideId).toBe('desk:monitor:0');
  });

  it('stands on the monitor top when released over it, and on the desk elsewhere', () => {
    const panel = layoutDesk([monitor], null).spots['desk:monitor:0'];
    const over = layoutDesk([monitor, { ...item('webcam'), place: { x: panel.cx + 50, z: panel.cz } }], null);
    const top = over.boxes.find((b) => b.id === 'desk:monitor:0' && b.size[1] > 200)!;
    expect(over.boxes.find((b) => b.id === 'desk:webcam:0')!.min[1]).toBeCloseTo(top.min[1] + top.size[1]);
    const off = layoutDesk([monitor, { ...item('webcam'), place: { x: panel.cx + 800, z: 200 } }], null);
    expect(off.boxes.find((b) => b.id === 'desk:webcam:0')!.min[1]).toBe(0);
  });
});


describe('packing a desk that is too small for the defaults', () => {
  const desk = (w: number, d: number): DeskItem => item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: w, depthMm: d }, deskCustomId('d'));
  const set = [item('monitor', { screenSize: 24 }, null, 'm0'), item('monitor', { screenSize: 24 }, null, 'm1'), item('keyboard'), item('mousepad'), item('mouse')];

  it('places everything on a desk that can hold it, without overlap, though not where the catalog would', () => {
    const layout = layoutDesk([desk(1500, 900), ...set], [450, 230, 470]);
    expect(layout.unfit).toEqual([]);
    const ids = Object.keys(layout.spots).filter((id) => id !== 'desk:mouse:0');
    for (let i = 0; i < ids.length; i++) {
      const s = layout.spots[ids[i]];
      expect(s.cx - s.hw).toBeGreaterThanOrEqual(layout.rect.x0 - 1);
      expect(s.cx + s.hw).toBeLessThanOrEqual(layout.rect.x1 + 1);
      expect(s.cz + s.hd).toBeLessThanOrEqual(layout.rect.z1 + 1);
      for (let j = i + 1; j < ids.length; j++) expect(overlaps(s, layout.spots[ids[j]]), `${ids[i]} / ${ids[j]}`).toBe(false);
    }
    expect(layout.spots['desk:mouse:0'].cx).toBeCloseTo(layout.spots['desk:mousepad:0'].cx);
  });

  it('puts what does not fit beside the desk, reports it, and says what size would hold everything', () => {
    const layout = layoutDesk([desk(700, 500), ...set], [450, 230, 470]);
    expect(layout.unfit.length).toBeGreaterThan(0);
    for (const id of layout.unfit) expect(layout.spots[id].cx - layout.spots[id].hw).toBeGreaterThanOrEqual(layout.rect.x1 - 1);
    expect(layout.needed.w).toBeGreaterThan(700);
    expect(layout.needed.w % 50).toBe(0);
    const roomy = layoutDesk([desk(layout.needed.w, layout.needed.d), ...set], [450, 230, 470]);
    expect(roomy.unfit).toEqual([]);
  });

  it('leaves a desk that holds the defaults laid out as the catalog does', () => {
    const big = layoutDesk([desk(3000, 1500), ...set], [450, 230, 470]);
    const auto = layoutDesk(set, [450, 230, 470]);
    expect(big.spots['m0']).toMatchObject({ cx: auto.spots['m0'].cx, cz: auto.spots['m0'].cz });
  });

  it('gives a reset layout without overlap, since a reset only drops the stored spots', () => {
    const placed = set.map((i) => ({ ...i, place: { x: 0, z: 0 } }));
    const reset = placed.map((i) => ({ ...i, place: undefined }));
    const layout = layoutDesk([desk(1500, 900), ...reset], [450, 230, 470]);
    expect(layout.unfit).toEqual([]);
    expect(layoutDesk([desk(1500, 900), ...reset], [450, 230, 470]).spots).toEqual(layout.spots);
  });
});

describe('the main monitor', () => {
  const mon = (id: string, inches: number, place?: DeskItem['place']): DeskItem => ({ ...item('monitor', { screenSize: inches }, null, id), place });

  it('is the widest when none is chosen, the first among equals, and stands over the keyboard', () => {
    const layout = layoutDesk([mon('a', 24), mon('b', 27), mon('c', 27), item('keyboard')], null);
    expect(layout.mainId).toBe('b');
    expect(layout.spots.b.cx).toBeCloseTo(layout.spots['desk:keyboard:0'].cx);
    expect(layout.spots.a.cx).not.toBeCloseTo(layout.spots.b.cx);
    expect(layout.spots.c.cx).not.toBeCloseTo(layout.spots.b.cx);
    expect(layoutDesk([mon('a', 27), mon('b', 27)], null).mainId).toBe('a');
  });

  it('is the one the user chose, whatever its size', () => {
    const layout = layoutDesk([mon('a', 24, { main: true }), mon('b', 27), item('keyboard')], null);
    expect(layout.mainId).toBe('a');
    expect(layout.spots.a.cx).toBeCloseTo(layout.spots['desk:keyboard:0'].cx);
  });

  it('carries the webcam, and the others wing out turned in', () => {
    const layout = layoutDesk([mon('a', 24), mon('b', 27, { main: true }), item('webcam')], null);
    expect(layout.boxes.find((b) => b.id === 'desk:webcam:0')?.rideId).toBe('b');
    expect(layout.spots.a.yaw).not.toBe(0);
  });
});

describe('a laptop', () => {
  const laptop: DeskItem = { id: 'desk:laptop:0', kind: 'laptop', specs: {}, custom: null, name: 'Color LCD' };

  it('stands front-center when it is all there is to type on, a base and a lid leaning back', () => {
    const layout = layoutDesk([laptop], null);
    expect(layout.spots['desk:laptop:0'].cx).toBe(0);
    const boxes = layout.boxes.filter((b) => b.id === 'desk:laptop:0');
    expect(boxes).toHaveLength(2);
    const lid = boxes.find((b) => b.tilt)!;
    expect(lid.tilt!.deg).toBeLessThan(0);
    expect(lid.size[1]).toBeGreaterThan(boxes.find((b) => !b.tilt)!.size[1]);
    expect(layout.spots['desk:laptop:0'].top).toBeGreaterThan(lid.size[1] / 2);
  });

  it('moves beside the keyboard when there is one, and the headphones step past it', () => {
    const layout = layoutDesk([laptop, item('keyboard'), item('headphones')], null);
    const kb = layout.spots['desk:keyboard:0'];
    const lap = layout.spots['desk:laptop:0'];
    expect(lap.cx + lap.hw).toBeLessThanOrEqual(kb.cx - kb.hw);
    expect(layout.spots['desk:headphones:0'].cx + layout.spots['desk:headphones:0'].hw).toBeLessThanOrEqual(lap.cx - lap.hw);
    expect(overlaps(lap, kb)).toBe(false);
  });

  it('makes a laptop-only desk with no case and nothing unfit', () => {
    const layout = layoutDesk([laptop], null);
    expect(layout.spots.case).toBeUndefined();
    expect(layout.unfit).toEqual([]);
  });
});

describe('collisions while dragging', () => {
  const layout = layoutDesk([item('keyboard'), item('mousepad'), item('mouse'), item('monitor', { screenSize: 24 }), item('webcam')], [450, 230, 470]);

  it('sees an item moved onto another, not onto free desk, and lets a mouse stand on its pad and a webcam on its monitor', () => {
    const kb = layout.spots['desk:keyboard:0'];
    const pad = layout.spots['desk:mousepad:0'];
    expect(collidesAt(layout, 'desk:mousepad:0', kb.cx, kb.cz)).toBe(true);
    expect(collidesAt(layout, 'desk:mousepad:0', pad.cx, pad.cz)).toBe(false);
    expect(collidesAt(layout, 'desk:mouse:0', pad.cx, pad.cz)).toBe(false);
    const mon = layout.spots['desk:monitor:0'];
    expect(collidesAt(layout, 'desk:webcam:0', mon.cx + 20, mon.cz)).toBe(false);
    expect(collidesAt(layout, 'desk:keyboard:0', mon.cx, mon.cz)).toBe(true);
  });

  it('does not count the item against itself or the webcam riding it', () => {
    const mon = layout.spots['desk:monitor:0'];
    expect(collidesAt(layout, 'desk:monitor:0', mon.cx, mon.cz)).toBe(false);
  });

  it('finds the nearest free spot within the radius, and none when the drop is deep in another item', () => {
    const kb = layout.spots['desk:keyboard:0'];
    const edgeDrop = freeSpot(layout, 'desk:mousepad:0', kb.cx + kb.hw + 20, kb.cz);
    expect(edgeDrop).not.toBeNull();
    expect(collidesAt(layout, 'desk:mousepad:0', edgeDrop![0], edgeDrop![1])).toBe(false);
    expect(Math.hypot(edgeDrop![0] - (kb.cx + kb.hw + 20), edgeDrop![1] - kb.cz)).toBeLessThanOrEqual(200);
    expect(freeSpot(layout, 'desk:mousepad:0', kb.cx, kb.cz + 40)).toBeNull();
  });
});

describe('overlaps', () => {
  const r = (cx: number, cz: number, yaw = 0) => ({ cx, cz, w: 100, d: 40, yaw });

  it('is true for crossing footprints, false for apart or only touching ones', () => {
    expect(overlaps(r(0, 0), r(50, 0))).toBe(true);
    expect(overlaps(r(0, 0), r(100, 0))).toBe(false);
    expect(overlaps(r(0, 0), r(300, 0))).toBe(false);
  });

  it('sees a turned footprint reach where an unturned one would not', () => {
    expect(overlaps(r(0, 0), r(0, 60))).toBe(false);
    expect(overlaps(r(0, 0), { ...r(0, 60), yaw: 90 })).toBe(true);
  });
});

describe('what stands beside a desk that is too small', () => {
  const small = (w: number, d: number): DeskItem => item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: w, depthMm: d }, deskCustomId('d'));
  const set = [item('monitor', { screenSize: 24 }, null, 'm0'), item('monitor', { screenSize: 24 }, null, 'm1'), item('keyboard'), item('mousepad'), item('mouse')];

  it('stands on the floor, below the desk top, and the desk gets legs to the floor', () => {
    const layout = layoutDesk([small(700, 500), ...set], [450, 230, 470]);
    expect(layout.unfit.length).toBeGreaterThan(0);
    const floorBoxes = layout.boxes.filter((b) => layout.unfit.includes(b.id ?? '') && b.kind !== 'desk');
    expect(floorBoxes.length).toBeGreaterThan(0);
    for (const box of floorBoxes) expect(box.min[1]).toBeLessThan(0);
    for (const id of layout.unfit) expect(layout.spots[id].top).toBeLessThan(layout.spots[id].y + 1000);
    expect(layout.boxes.filter((b) => b.kind === 'desk')).toHaveLength(5);
    const onDeskBox = layout.boxes.find((b) => b.id === 'desk:keyboard:0' && !layout.unfit.includes('desk:keyboard:0'));
    if (onDeskBox) expect(onDeskBox.min[1]).toBeGreaterThanOrEqual(0);
  });

  it('draws the same desk, slab and four legs, with nothing on the floor when everything fits', () => {
    const layout = layoutDesk([small(3000, 1500), ...set], [450, 230, 470]);
    expect(layout.unfit).toEqual([]);
    expect(layout.boxes.filter((b) => b.kind === 'desk')).toHaveLength(5);
    expect(layout.boxes.every((b) => b.min[1] >= 0 || b.kind === 'desk')).toBe(true);
  });

  it('counts what is beside from where items ended up: one placed back on the desk is no longer beside', () => {
    const before = layoutDesk([small(700, 500), ...set], [450, 230, 470]);
    const moved = before.unfit.find((id) => id.startsWith('desk:keyboard')) ?? before.unfit.find((id) => id !== 'case')!;
    const items = [small(700, 500), ...set.map((i) => (i.id === moved ? { ...i, place: { x: 0, z: 0 } } : i))];
    const after = layoutDesk(items, [450, 230, 470]);
    expect(after.unfit).not.toContain(moved);
    expect(after.unfit.length).toBe(before.unfit.length - 1);
    expect(layoutDesk([small(700, 500), ...set.map((i) => ({ ...i, place: undefined }))], [450, 230, 470]).unfit.length).toBe(before.unfit.length);
  });

  it('keeps a monitor and its foot fully on the desk when it is clamped to an edge', () => {
    const items = [small(1600, 800), { ...item('monitor', { screenSize: 24 }, null, 'm0'), place: { x: 0, z: -5000 } }];
    const layout = layoutDesk(items, null);
    const spot = layout.spots.m0;
    const foot = layout.boxes.filter((b) => b.id === 'm0' && b.min[1] <= 0 && b.size[2] > 100)[0];
    expect(foot.min[2]).toBeGreaterThanOrEqual(layout.rect.z0 - 1);
    expect(foot.min[2] + foot.size[2]).toBeLessThanOrEqual(layout.rect.z1 + 1);
    expect(keepExtents(spot).hd).toBeGreaterThanOrEqual(100);
  });

  it('stops a monitor dropped with its foot on a keyboard, though the panel is clear', () => {
    const layout = layoutDesk([item('monitor', { screenSize: 27 }, null, 'm0'), item('keyboard')], null);
    const kb = layout.spots['desk:keyboard:0'];
    expect(collidesAt(layout, 'm0', kb.cx, kb.cz - kb.hd - 60)).toBe(true);
    expect(collidesAt(layout, 'm0', kb.cx, kb.cz - kb.hd - 140)).toBe(false);
  });
});

describe('isOnDesk', () => {
  it('is true for a footprint wholly on the desk, foot included, and false for one beside it', () => {
    const layout = layoutDesk([item('monitor', { screenSize: 24 }, null, 'm0')], null);
    expect(isOnDesk(layout.spots.m0, layout.rect)).toBe(true);
    expect(isOnDesk({ ...layout.spots.m0, cx: layout.rect.x1 + 10 }, layout.rect)).toBe(false);
    expect(isOnDesk({ ...layout.spots.m0, cz: layout.rect.z0 + 20 }, layout.rect)).toBe(false);
  });
});

describe('who keeps a short desk', () => {
  const desk = (w: number, d: number): DeskItem => item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: w, depthMm: d }, deskCustomId('d'));
  const mon = (id: string, inches: number): DeskItem => item('monitor', { screenSize: inches }, null, id);
  const everything = [mon('main', 32), mon('extra', 24), item('keyboard'), item('mousepad'), item('mouse'), item('speaker'), item('webcam')];

  it('keeps what is typed on at the front and the main monitor behind it, and sends the extra monitor and the case to the floor first', () => {
    const layout = layoutDesk([desk(1194, 610), ...everything], [450, 230, 470]);
    expect(layout.unfit).toEqual(expect.arrayContaining(['case', 'extra']));
    for (const id of ['main', 'desk:keyboard:0', 'desk:mousepad:0', 'desk:mouse:0']) expect(layout.unfit).not.toContain(id);
    const kb = layout.spots['desk:keyboard:0'];
    const pad = layout.spots['desk:mousepad:0'];
    const monitor = layout.spots.main;
    expect(kb.cz).toBeGreaterThan(monitor.cz);
    expect(pad.cz).toBeGreaterThan(monitor.cz);
    expect(kb.cz + kb.hd).toBeGreaterThan(layout.rect.z1 - 100);
    expect(overlaps(kb, pad)).toBe(false);
    expect(layout.spots['desk:webcam:0'].cx).toBeCloseTo(monitor.cx);
  });

  it('sends the last of the front row to the floor before the main monitor when the desk is too shallow for both', () => {
    const layout = layoutDesk([desk(900, 500), mon('main', 27), item('keyboard'), item('mousepad'), item('mouse')], null);
    expect(layout.unfit).not.toContain('main');
    expect(layout.unfit).not.toContain('desk:keyboard:0');
    expect(layout.unfit).toContain('desk:mousepad:0');
  });

  it('puts the main monitor the user chose on the desk even when it is the narrower one', () => {
    const items = [desk(1194, 610), { ...mon('chosen', 24), place: { main: true } }, mon('wide', 32), item('keyboard')];
    const layout = layoutDesk(items, null);
    expect(layout.mainId).toBe('chosen');
    expect(layout.unfit).toEqual(['wide']);
  });
});

describe('the floor around the desk', () => {
  const desk = (w: number, d: number): DeskItem => item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: w, depthMm: d }, deskCustomId('d'));
  const crowded = [desk(700, 500), item('monitor', { screenSize: 24 }, null, 'm0'), item('monitor', { screenSize: 24 }, null, 'm1'), item('keyboard')];

  it('is the desk grown by a margin, and holds what already stands beside it', () => {
    const layout = layoutDesk(crowded, null);
    expect(layout.unfit.length).toBeGreaterThan(0);
    expect(layout.floor.x0).toBeLessThan(layout.rect.x0 - 1000);
    for (const id of layout.unfit) {
      const s = layout.spots[id];
      expect(s.cx - s.hw).toBeGreaterThanOrEqual(layout.floor.x0);
      expect(s.cx + s.hw).toBeLessThanOrEqual(layout.floor.x1);
    }
  });

  it('keeps a spot the user left on the floor, clear of the desk', () => {
    const base = layoutDesk(crowded, null);
    const id = base.unfit[0];
    const moved = crowded.map((i) => (i.id === id ? { ...i, place: { x: base.rect.x0 - 600, z: 100 } } : i));
    const layout = layoutDesk(moved, null);
    expect(layout.spots[id]).toMatchObject({ cx: base.rect.x0 - 600, cz: 100 });
    expect(layout.unfit).toContain(id);
  });

  it('settles a floor target inside the floor area and out of the desk footprint', () => {
    const layout = layoutDesk(crowded, null);
    const id = layout.unfit[0];
    const over = floorSpot(layout, id, 0, 0);
    const keep = keepExtents(layout.spots[id]);
    const outside = over[0] + keep.hw <= layout.rect.x0 + 1 || over[0] - keep.hw >= layout.rect.x1 - 1 || over[1] + keep.hd <= layout.rect.z0 + 1 || over[1] - keep.hd >= layout.rect.z1 - 1;
    expect(outside).toBe(true);
    const far = floorSpot(layout, id, 1e6, 1e6);
    expect(far[0] + keep.hw).toBeLessThanOrEqual(layout.floor.x1);
    expect(far[1] + keep.hd).toBeLessThanOrEqual(layout.floor.z1);
  });

  it('finds a free floor spot near a drop on another floor item', () => {
    const layout = layoutDesk(crowded, null);
    const [a, b] = layout.unfit;
    if (!b) return;
    const other = layout.spots[b];
    const spot = freeSpot(layout, a, other.cx, other.cz, true);
    if (spot) expect(collidesAt(layout, a, spot[0], spot[1])).toBe(false);
  });
});

describe('the floor takes speakers before the main monitor', () => {
  it('stands speakers on the floor once the monitor and what is typed on have the desk', () => {
    const desk: DeskItem = item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: 900, depthMm: 700 }, deskCustomId('d'));
    const layout = layoutDesk([desk, item('monitor', { screenSize: 27 }, null, 'main'), item('keyboard'), item('mousepad'), item('speaker', {}, null, 's1'), item('speaker', {}, null, 's2')], null);
    expect(layout.unfit).toEqual(['s2']);
    expect(layout.unfit).not.toContain('main');
    expect(layout.unfit).not.toContain('desk:keyboard:0');
  });
});

describe('turning an item that has a spot', () => {
  const desk: DeskItem = item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: 1600, depthMm: 800 }, deskCustomId('d'));
  const at = (yaw: number, x = 100, z = 300): DeskItem => ({ ...item('keyboard'), place: { x, z, yaw } });

  it('holds a turned footprint on the desk by the least it must, and puts the item back when it is turned back', () => {
    const before = layoutDesk([desk, at(0)], null).spots['desk:keyboard:0'];
    const turned = layoutDesk([desk, at(90)], null).spots['desk:keyboard:0'];
    expect(turned.cz + turned.hd).toBeLessThanOrEqual(400 + 1);
    expect(turned.cz).toBeLessThan(before.cz);
    expect(turned.cx).toBe(before.cx);
    const back = layoutDesk([desk, at(0)], null).spots['desk:keyboard:0'];
    expect(back).toMatchObject({ cx: before.cx, cz: before.cz });
    const again = layoutDesk([desk, at(180)], null).spots['desk:keyboard:0'];
    expect(again.cz).toBeCloseTo(before.cz);
  });

  it('sees a turned footprint collide where the unturned one does not, at the turn given', () => {
    const items = [desk, at(0, 0, 0), { ...item('mousepad'), place: { x: 0, z: 255 } }];
    const layout = layoutDesk(items, null);
    const kb = layout.spots['desk:keyboard:0'];
    const clear = collidesAt(layout, 'desk:keyboard:0', kb.cx, kb.cz, 0);
    const turnedHit = collidesAt(layout, 'desk:keyboard:0', kb.cx, kb.cz, 90);
    expect(clear).toBe(false);
    expect(turnedHit).toBe(true);
    const free = freeSpot(layout, 'desk:keyboard:0', kb.cx, kb.cz, false, 90);
    expect(free).not.toBeNull();
    expect(collidesAt(layout, 'desk:keyboard:0', free![0], free![1], 90)).toBe(false);
  });
});

describe('legs and the framed bounds', () => {
  it('frames the legs down to the floor for every desk, so none is cut off by the view', () => {
    for (const items of [[item('monitor', { screenSize: 27 })], []]) {
      const layout = layoutDesk(items, null);
      expect(layout.boxes.filter((b) => b.leg)).toHaveLength(4);
      expect(layout.bounds.min[1]).toBe(-DESK_HEIGHT);
    }
  });
});

describe('settledAt', () => {
  const desk: DeskItem = item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: 1600, depthMm: 800 }, deskCustomId('d'));

  it('holds a turned footprint on the desk by the least it must', () => {
    const layout = layoutDesk([desk, { ...item('keyboard'), place: { x: 0, z: 320 } }], null);
    const kb = layout.spots['desk:keyboard:0'];
    const [x, z] = settledAt(layout, 'desk:keyboard:0', kb.cx, kb.cz, 90);
    expect(x).toBe(kb.cx);
    expect(z + keepExtents(kb, 90).hd).toBeCloseTo(layout.rect.z1);
  });
});


describe('an L-shaped desk', () => {
  const lDesk = (over: Partial<CustomItem> = {}): DeskItem => item('desk', null, { id: 'd', name: 'L desk', kind: 'desk', widthMm: 1400, depthMm: 700, shape: 'l', returnWidthMm: 600, returnDepthMm: 1500, returnSide: 'right', ...over }, deskCustomId('d'));
  const slabs = (layout: ReturnType<typeof layoutDesk>) => layout.boxes.filter((b) => b.kind === 'desk' && !b.leg);
  const legs = (layout: ReturnType<typeof layoutDesk>) => layout.boxes.filter((b) => b.leg);

  it('is the main arm and a second arm reaching toward the user from one end, a corner left empty', () => {
    const layout = layoutDesk([lDesk()], null);
    expect(layout.rect.main).toEqual({ x0: -700, x1: 700, z0: -350, z1: 350 });
    expect(layout.rect.ret).toEqual({ x0: 100, x1: 700, z0: -350, z1: 1150 });
    expect(layout.rect.notch).toEqual({ x0: -700, x1: 100, z0: 350, z1: 1150 });
    expect(layout.size).toEqual({ w: 1400, d: 700 });
    // The main arm first, then the part of the second arm beyond it.
    expect(slabs(layout)).toHaveLength(2);
    expect(slabs(layout)[0]).toMatchObject({ min: [-700, -30, -350], size: [1400, 30, 700] });
    expect(slabs(layout)[1]).toMatchObject({ min: [100, -30, 350], size: [600, 30, 800] });
  });

  it('stands on a leg at each of its six corners, in the same style as the straight desk', () => {
    const l = layoutDesk([lDesk()], null);
    expect(legs(l)).toHaveLength(6);
    const straight = layoutDesk([item('desk', null, { id: 'd', name: 'Desk', kind: 'desk', widthMm: 1400, depthMm: 700 }, deskCustomId('d'))], null);
    expect(legs(straight)).toHaveLength(4);
    for (const leg of legs(l)) {
      expect(leg.size).toEqual(legs(straight)[0].size);
      expect(leg.min[1]).toBe(legs(straight)[0].min[1]);
      // Each leg is under the desk, not in the empty corner.
      const cx = leg.min[0] + leg.size[0] / 2;
      const cz = leg.min[2] + leg.size[2] / 2;
      const inNotch = cx > -700 && cx < 100 && cz > 350 && cz < 1150;
      expect(inNotch).toBe(false);
    }
  });

  it('mirrors for a second arm on the left', () => {
    const layout = layoutDesk([lDesk({ returnSide: 'left' })], null);
    expect(layout.rect.ret).toEqual({ x0: -700, x1: -100, z0: -350, z1: 1150 });
    expect(layout.rect.notch).toEqual({ x0: -100, x1: 700, z0: 350, z1: 1150 });
    expect(legs(layout)).toHaveLength(6);
  });

  it('holds an item on either arm and not in the corner left empty', () => {
    const base = [lDesk(), item('keyboard')];
    const onReturn = layoutDesk([...base, { ...item('mousepad'), place: { x: 400, z: 900 } }], null);
    expect(onReturn.spots['desk:mousepad:0']).toMatchObject({ cx: 400, cz: 900 });
    expect(isOnDesk(onReturn.spots['desk:mousepad:0'], onReturn.rect)).toBe(true);
    expect(onReturn.unfit).toEqual([]);
    // Left half over the empty corner it is held on the desk by the least it must: out of the corner, onto an arm.
    const inCorner = layoutDesk([...base, { ...item('mousepad'), place: { x: -60, z: 500 } }], null);
    const pad = inCorner.spots['desk:mousepad:0'];
    expect(isOnDesk(pad, inCorner.rect)).toBe(true);
    const near = (pad.cx - pad.hw >= 100 - 1) || (pad.cz + pad.hd <= 350 + 1);
    expect(near).toBe(true);
  });

  it('clamps a footprint over the empty corner out by the nearest side', () => {
    const { rect } = layoutDesk([lDesk()], null);
    const [x, z] = clampCenter(-300, 800, 150, 100, rect);
    expect(x - 150 >= 100 - 1 || z + 100 <= 350 + 1).toBe(true);
    // Clear of the corner it is left alone.
    expect(clampCenter(400, 800, 150, 100, rect)).toEqual([400, 800]);
    expect(clampCenter(-300, 0, 150, 100, rect)).toEqual([-300, 0]);
  });

  it('keeps the keyboard and the main monitor on the main arm and puts overflow on the second arm before the floor', () => {
    const monitors = [item('monitor', { screenSize: 27 }, null, 'main'), item('monitor', { screenSize: 24 }, null, 'second')];
    const layout = layoutDesk([lDesk({ widthMm: 900, depthMm: 600, returnWidthMm: 700, returnDepthMm: 1600 }), ...monitors, item('keyboard'), item('mousepad'), item('speaker', {}, null, 's1')], null);
    const arm = layout.rect.main!;
    for (const id of ['main', 'desk:keyboard:0', 'desk:mousepad:0']) {
      const s = layout.spots[id];
      expect(s.cz + s.hd).toBeLessThanOrEqual(arm.z1 + 1);
    }
    // Something ranked below them stands past the main arm, on the second one, and nothing is left on the floor.
    const past = Object.entries(layout.spots).filter(([, s]) => s.cz - s.hd >= arm.z1 - 1);
    expect(past.length).toBeGreaterThan(0);
    for (const [, s] of past) expect(isOnDesk(s, layout.rect)).toBe(true);
    expect(layout.unfit).toEqual([]);
  });

  it('still stands what fits on neither arm beside the desk, on the floor, and reports it', () => {
    const many = Array.from({ length: 6 }, (_, i) => item('monitor', { screenSize: 32 }, null, `m${i}`));
    const layout = layoutDesk([lDesk({ widthMm: 800, depthMm: 500, returnWidthMm: 400, returnDepthMm: 700 }), ...many], null);
    expect(layout.unfit.length).toBeGreaterThan(0);
    for (const id of layout.unfit) expect(isOnDesk(layout.spots[id], layout.rect)).toBe(false);
  });

  it('counts an item in the empty corner as on the floor and lets a drop there settle clear of the arms', () => {
    const layout = layoutDesk([lDesk(), item('keyboard'), { ...item('mouse'), place: { x: -400, z: 800 } }], null);
    const mouse = layout.spots['desk:mouse:0'];
    // The corner is floor: the mouse stands wholly inside it, below the desk top.
    expect(isOnDesk(mouse, layout.rect)).toBe(false);
    expect(layout.unfit).toContain('desk:mouse:0');
    const [x, z] = floorSpot(layout, 'desk:mouse:0', 0, 0);
    const keep = keepExtents(layout.spots['desk:mouse:0']);
    expect(isOnDesk({ ...mouse, cx: x, cz: z }, layout.rect)).toBe(false);
    expect(keep.hw).toBeGreaterThan(0);
  });

  it('sees items collide across the junction of the arms', () => {
    const layout = layoutDesk([lDesk(), { ...item('mousepad'), place: { x: 400, z: 300 } }, { ...item('headphones'), place: { x: 400, z: 700 } }], null);
    const pad = layout.spots['desk:mousepad:0'];
    expect(collidesAt(layout, 'desk:headphones:0', pad.cx, pad.cz)).toBe(true);
    expect(collidesAt(layout, 'desk:headphones:0', 400, 1000)).toBe(false);
  });

  it('is a straight desk when the second arm is no deeper than the main one or as wide', () => {
    expect(layoutDesk([lDesk({ returnDepthMm: 600 })], null).rect.notch).toBeUndefined();
    expect(layoutDesk([lDesk({ returnWidthMm: 1400 })], null).rect.notch).toBeUndefined();
  });
});


describe('placed items draw as the layout draws them', () => {
  // The record Build exports for an item: its footprint center, the height of its lowest box, and the box that holds all its boxes.
  const placed = (layout: ReturnType<typeof layoutDesk>, id: string, kind: DeskKind, stand: boolean) => {
    const spot = layout.spots[id];
    const boxes = byId(layout, id);
    const bottom = Math.min(...boxes.map((b) => b.min[1]));
    const top = Math.max(...boxes.map((b) => b.min[1] + b.size[1]));
    return placedItemBoxes({ id, kind, cx: spot.cx, cz: spot.cz, minY: bottom, yaw: spot.yaw, size: [spot.w, top - bottom, spot.d], stand });
  };
  const items: DeskItem[] = [item('monitor', { screenSize: 27 }), item('laptop'), item('keyboard'), item('mouse'), item('speaker')];
  const layout = layoutDesk(items, null);

  it('a monitor keeps its panel, foot and neck', () => {
    expect(placed(layout, 'desk:monitor:0', 'monitor', true)).toEqual(byId(layout, 'desk:monitor:0'));
  });

  it('a laptop keeps its base and tilted lid', () => {
    expect(placed(layout, 'desk:laptop:0', 'laptop', false)).toEqual(byId(layout, 'desk:laptop:0'));
  });

  it('a plain item is the one box it was', () => {
    for (const kind of ['keyboard', 'mouse', 'speaker'] as const) expect(placed(layout, `desk:${kind}:0`, kind, false)).toEqual(byId(layout, `desk:${kind}:0`));
  });

  it('a monitor without a stand is its panel alone', () => {
    const boxes = placedItemBoxes({ id: 'm', kind: 'monitor', cx: 10, cz: 20, minY: 0, yaw: 0, size: [620, 380, 50] });
    expect(boxes).toHaveLength(1);
    expect(boxes[0].min).toEqual([-300, 0, -5]);
  });
});

describe('the desk surface', () => {
  it('draws the slabs and legs the layout draws', () => {
    const l = layoutDesk([item('desk', null, { id: 'd', name: 'L', kind: 'desk', widthMm: 1400, depthMm: 700, shape: 'l', returnWidthMm: 600, returnDepthMm: 1500, returnSide: 'right' }, deskCustomId('d'))], null);
    const surface = [...deskSlabBoxes(l.rect), ...deskLegBoxes(l.rect)];
    expect(l.boxes.filter((b) => b.id === DESK_ID)).toEqual(surface);
  });

  it('rebuilds an L from its two arms', () => {
    const main = { x0: -700, x1: 700, z0: -350, z1: 350 };
    const rect = lDeskRect(main, { x0: 100, x1: 700, z0: -350, z1: 1150 });
    expect(rect.main).toEqual(main);
    expect(rect.z1).toBe(1150);
    expect(rect.notch).toEqual({ x0: -700, x1: 100, z0: 350, z1: 1150 });
    expect(deskLegBoxes(rect)).toHaveLength(6);
  });
});
