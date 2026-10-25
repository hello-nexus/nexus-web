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
