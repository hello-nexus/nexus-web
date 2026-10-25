// setupFiles run for `@vitest-environment node` files too, where none of this
// exists; the guard is what lets those files load this at all.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  // The 1s default waitFor/findBy timeout flakes on big pages when the suite runs in parallel.
  const { configure } = await import('@testing-library/dom');
  configure({ asyncUtilTimeout: 8000 });

  // Theme detection reads matchMedia, which jsdom does not implement.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('light') ? false : true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Node's BroadcastChannel reaches every worker in the process, so a page in one test file would receive control-sync messages from another file running in parallel.
  class BroadcastChannelStub {
    onmessage = null;
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  globalThis.BroadcastChannel = BroadcastChannelStub as unknown as typeof BroadcastChannel;

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

  // jsdom has no layout engine, so scrollIntoView is undefined. No-op it so
  // components that keep an active item in view (Select listbox, TopSearch)
  // don't throw under test.
  Element.prototype.scrollIntoView ??= function () {};

  // jsdom logs "not implemented" for media element control; background video
  // release calls both on unmount.
  HTMLMediaElement.prototype.pause = function () {};
  HTMLMediaElement.prototype.load = function () {};

  afterEach(() => {
    localStorage.clear();
  });
}
