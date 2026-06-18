import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Attributes whose string values are never shown to a user (technical,
// layout, or routing props). Everything not listed here that carries visible
// text - title, label, description, placeholder, alt, aria-label, etc. - must
// go through t(). Keep this list lean; when in doubt, translate.
const NON_UI_JSX_ATTRIBUTES = [
  'className', 'id', 'key', 'type', 'name', 'href', 'to', 'src', 'rel',
  'target', 'role', 'htmlFor', 'value', 'testId', 'data-testid', 'style',
  'autoComplete', 'inputMode', 'enterKeyHint', 'width', 'height', 'viewBox',
  'fill', 'stroke', 'd', 'points', 'transform', 'xmlns', 'preserveAspectRatio',
  'tone', 'size', 'variant', 'position', 'align', 'justify', 'direction',
  'gap', 'as', 'icon', 'color', 'accent', 'mode', 'kind', 'side', 'placement',
  'layout',
]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { i18next },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Guardrail: any user-facing string must go through t() (i18n), never a
      // hardcoded literal. Scoped to JSX (visible text + user-facing
      // attributes); pure code strings are not flagged. See NON_UI_JSX_ATTRIBUTES
      // for the technical-attribute allowlist.
      'i18next/no-literal-string': ['error', {
        mode: 'jsx-only',
        'jsx-attributes': { exclude: NON_UI_JSX_ATTRIBUTES },
        // String arguments to function calls are technical here (route keys,
        // filter ids, API paths, enum values, formatter inputs), never display
        // text - that always goes through JSX or t(). Treat them all as valid.
        callees: { exclude: ['.*'] },
      }],
      // React Compiler hint rules — off because this project does not run
      // React Compiler (see vite.config.ts — no babel-plugin-react-compiler).
      // They flag patterns the compiler can't auto-memoize, which is irrelevant
      // without the compiler and produces noise on legitimate external-system
      // sync, latest-ref, and intentional ref-as-state patterns.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/static-components': 'off',
      // Vite Fast Refresh convenience rule — off because tightly co-located
      // constants, types, and hooks alongside their component are idiomatic
      // here and the cost is at most a full reload in dev, not a correctness
      // issue in production.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Internal / developer-only surfaces that never ship as end-user UI: test
    // files, the component storybook, the in-app SDK + telemetry reference
    // pages (dense API docs), and the component sandbox. Hardcoded strings
    // there are fine; the user-facing Tools cards linking to them are not.
    files: [
      '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}',
      'src/storybook/**', 'src/sandbox/**', 'src/telemetry/reference/**',
    ],
    rules: { 'i18next/no-literal-string': 'off' },
  },
])
