import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {


// Stub matchMedia for jsdom (theme detection)
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

// Stub ResizeObserver for jsdom (TimeSeriesChart and other width-tracking components)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no layout engine, so scrollIntoView is undefined. No-op it so
// components that keep an active item in view (Select listbox, TopSearch) don't
// throw under test.
Element.prototype.scrollIntoView ??= function () {};

// Clear localStorage between tests
afterEach(() => {
  localStorage.clear();
});

}
