// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Box3, Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { parseCaseModel, sceneToLayoutMatrix } from '../../../../lib/scene/caseModel';
import { hideMovedRadiator } from './coolingCaseRenderer';

describe('hideMovedRadiator', () => {
  it('hides the exported cooler inside the old radiator box and keeps the rest, with names surviving the glTF parse', async () => {
    const buf = readFileSync(new URL('../../../../lib/cooling/__fixtures__/y70-case.glb', import.meta.url));
    const model = await parseCaseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const holder = new Group();
    holder.applyMatrix4(sceneToLayoutMatrix([470, 320, 487], false));
    holder.add(model);
    holder.updateMatrixWorld(true);
    const cooler = holder.getObjectByName('cooler');
    expect(cooler).toBeTruthy();
    const c = new Box3().setFromObject(cooler!).getCenter(new Vector3());
    const around = { min: [c.x - 5, c.y - 5, c.z - 5] as [number, number, number], size: [10, 10, 10] as [number, number, number] };
    expect(hideMovedRadiator(holder, { min: [-900, -900, -900], size: [10, 10, 10] })).toEqual([]);
    expect(cooler!.visible).toBe(true);
    const hidden = hideMovedRadiator(holder, around);
    expect(hidden).toContain(cooler);
    expect(cooler!.visible).toBe(false);
    expect(holder.getObjectByName('psu')?.visible).toBe(true);
    hideMovedRadiator(holder, null);
    expect(cooler!.visible).toBe(true);
  });
});

// An AIO as Build exports it: the pump block and the radiator are both nodes named "cooler"; the loader renames the repeat.
function aioGlb(): ArrayBuffer {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 10, 0, 0, 0, 10, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2] }],
    nodes: [
      { name: 'cooler', mesh: 0, translation: [0, 0, 0] },
      { name: 'cooler', mesh: 0, translation: [300, 0, 0] },
      { name: 'psu', mesh: 0, translation: [0, 300, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [10, 10, 0] }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jsonBuf = Buffer.from(text);
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const chunk = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32LE(body.length, 0); h.write(type, 4); return Buffer.concat([h, body]); };
  const all = Buffer.concat([header, chunk('JSON', jsonBuf), chunk('BIN\0', bin)]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
}

describe('hideMovedRadiator on an AIO with a pump and a radiator both named cooler', () => {
  it('hides the renamed radiator node and keeps the pump', async () => {
    const holder = new Group();
    holder.add(await parseCaseModel(aioGlb()));
    holder.updateMatrixWorld(true);
    const pump = holder.getObjectByName('cooler')!;
    const radiator = holder.getObjectByName('cooler_1')!;
    expect(radiator).toBeTruthy();
    const c = new Box3().setFromObject(radiator).getCenter(new Vector3());
    const hidden = hideMovedRadiator(holder, { min: [c.x - 20, c.y - 20, c.z - 20], size: [40, 40, 40] });
    expect(hidden).toEqual([radiator]);
    expect(radiator.visible).toBe(false);
    expect(pump.visible).toBe(true);
    expect(holder.getObjectByName('psu')?.visible).toBe(true);
  });
});

