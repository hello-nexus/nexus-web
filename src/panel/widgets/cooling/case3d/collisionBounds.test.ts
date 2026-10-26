// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Box3, Color } from 'three';
import { describe, expect, it } from 'vitest';
import { caseExtents, parseCaseLayout, type CaseLayout } from '../../../../lib/cooling/caseLayout';
import { buildCollisionShapes } from '../../../../lib/cooling/flow/collisionShapes';
import { obstaclesOf } from '../../../../lib/cooling/flow/obstacles';

// The renderer draws the shell outline, the fans and the collision shapes in the same layout-mm space, so the shapes' world bounds must sit inside the shell box.
describe('collision shapes against the shell box', () => {
  it('keeps every obstacle, the hull prism included, inside the shell box the outline is drawn from', () => {
    const y70 = parseCaseLayout(JSON.parse(readFileSync(new URL('../../../../lib/cooling/__fixtures__/y70-case-layout.json', import.meta.url), 'utf8'))) as CaseLayout;
    const [ex, ey, ez] = caseExtents(y70);
    const { group, dispose } = buildCollisionShapes(obstaclesOf(y70), new Color('#f00'), new Color('#00f'));
    const bounds = new Box3().setFromObject(group);
    const tolerance = 1;
    expect(bounds.min.toArray().every(v => v >= -tolerance)).toBe(true);
    expect(bounds.max.x).toBeLessThanOrEqual(ex + tolerance);
    expect(bounds.max.y).toBeLessThanOrEqual(ey + tolerance);
    expect(bounds.max.z).toBeLessThanOrEqual(ez + tolerance);
    dispose();
  });
});
