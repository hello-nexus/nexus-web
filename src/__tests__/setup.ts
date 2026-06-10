import '@testing-library/jest-dom/vitest';

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

// Stub ResizeObserver for jsdom (StackedChart and other width-tracking components)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Clear localStorage between tests
afterEach(() => {
  localStorage.clear();
});
