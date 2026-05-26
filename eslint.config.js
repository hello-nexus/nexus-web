import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
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
])
