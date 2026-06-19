// Polyfills for the HYTE Q60 Android System WebView (Chromium 83, June 2020).
// Vite's es2019 target handles syntax but does NOT polyfill runtime APIs.
// Imported FIRST in main.tsx so every later module sees the polyfilled globals.

// String.prototype.replaceAll - Chrome 85+
if (typeof String.prototype.replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function (search: string | RegExp, replacement: string | ((substring: string, ...args: unknown[]) => string)) {
      if (search instanceof RegExp) {
        if (!search.flags.includes('g')) {
          throw new TypeError('replaceAll must be called with a global RegExp');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return String(this).replace(search, replacement as any);
      }
      const s = String(search);
      if (s === '') {
        // Match V8 behavior for empty search string.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return String(this).replace(new RegExp('', 'g'), replacement as any);
      }
      // Escape regex specials.
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return String(this).replace(new RegExp(escaped, 'g'), replacement as any);
    },
    writable: true,
    configurable: true,
  });
}

// Array.prototype.at / String.prototype.at - Chrome 92+
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function (n: number) {
      const len = this.length;
      const i = n < 0 ? len + n : n;
      return i >= 0 && i < len ? this[i] : undefined;
    },
    writable: true,
    configurable: true,
  });
}
if (typeof String.prototype.at !== 'function') {
  Object.defineProperty(String.prototype, 'at', {
    value: function (n: number) {
      const s = String(this);
      const len = s.length;
      const i = n < 0 ? len + n : n;
      return i >= 0 && i < len ? s[i] : undefined;
    },
    writable: true,
    configurable: true,
  });
}

// Object.hasOwn - Chrome 93+
if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: function (o: object, k: PropertyKey) {
      return Object.prototype.hasOwnProperty.call(o, k);
    },
    writable: true,
    configurable: true,
  });
}

export {};
