import { describe, expect, it } from 'vitest';
import vectors from './scene-projection-vectors.json';
import { makeCamera, projectToCanvas } from './sceneCamera';
import type { SceneCamera, Vec3 } from '../../api/lightingScene';

// The same file pins nexus-service's SceneCameraBasis; the editor's camera must agree with it to the hundredth of a canvas unit.
describe('scene camera', () => {
  it('projects the shared vectors the way the service samples them', () => {
    let checked = 0;
    for (const c of vectors.cases) {
      const camera = makeCamera(c.camera as SceneCamera);
      c.points.forEach((p, i) => {
        const got = projectToCanvas(camera, p as Vec3);
        const want = c.expected[i];
        if (want === null) {
          expect(got).toBeNull();
          return;
        }
        expect(got).not.toBeNull();
        expect(got![0]).toBeCloseTo(want[0], 2);
        expect(got![1]).toBeCloseTo(want[1], 2);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(20);
  });
});
