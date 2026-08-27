// setupFiles run for `@vitest-environment node` files too, where none of this
// exists; the guard is what lets those files load this at all.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

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

  afterEach(() => {
    localStorage.clear();
  });
}
