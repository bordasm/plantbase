import baseConfig from '../../eslint.config.mjs'

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
          ],
          // Pre-declared for Tasks 5-10 (auth routes, session middleware, chat route),
          // not yet imported by this task's health-check-only app.ts/main.ts.
          ignoredDependencies: [
            '@plantbase/core',
            'ai',
            '@ai-sdk/anthropic',
            'zod',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  { ignores: ['**/out-tsc'] },
]
