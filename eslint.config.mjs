import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginSvelte from 'eslint-plugin-svelte'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'release',
      'coverage',
      'test-results',
      'playwright-report'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.svelte'],
    rules: {
      // Prompts and Fooocus log values are untrusted, unescaped HTML: never render as markup.
      'svelte/no-at-html-tags': 'error'
    }
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/main/ipc/**'],
    rules: {
      // Every renderer→main channel must go through ValidatingIpcRegistry (sender + schema checks).
      'no-restricted-properties': [
        'error',
        ...['handle', 'handleOnce', 'on', 'once'].map((property) => ({
          object: 'ipcMain',
          property,
          message: 'Register IPC handlers through ValidatingIpcRegistry in src/main/ipc.'
        }))
      ]
    }
  },
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.svelte'],
    rules: {
      // These modules pull zod into the bundle; the renderer may only import their types.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '(^@shared/|/shared/)(library|scan|gallery|service-contract|service-health|validation|service-rpc-guards)$',
              allowTypeImports: true,
              message: 'Import runtime values from the *-kinds modules; only types from here.'
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
