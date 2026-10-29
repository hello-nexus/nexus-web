import { afterAll, beforeAll } from 'vitest';
import { configure, getConfig } from '@testing-library/dom';

/** Gives a test file's waitFor and findBy a longer timeout, for a big page that renders slowly when the suite runs in parallel. The rest of the suite keeps the default. */
export function allowSlowAsyncUtils(timeoutMs = 8000): void {
  let previous: number | undefined;
  beforeAll(() => {
    previous = getConfig().asyncUtilTimeout;
    configure({ asyncUtilTimeout: timeoutMs });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: previous });
  });
}
