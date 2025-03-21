module.exports = {
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2020,
    ecmaFeatures: {
      jsx: true,
    },
    requireConfigFile: false,
  },
  env: {
    browser: true,
    es6: true,
    es2017: true,
    node: true,
    jest: true,
  },
  // Prettier should be ALWAYS in the end of the list
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  ],
  plugins: [],
  // https://eslint.org/docs/rules/
  rules: {
    curly: 'error',
    eqeqeq: ['error', 'smart'],
    'guard-for-in': 'error',
    'max-lines': ['error', 300],
    'no-caller': 'error',
    'no-cond-assign': 'error',
    'no-console': [
      'error',
      {
        allow: [
          'debug',
          'info',
          'dirxml',
          'warn',
          'error',
          'dir',
          'time',
          'timeEnd',
          'timeLog',
          'trace',
          'assert',
          'clear',
          'count',
          'countReset',
          'group',
          'groupCollapsed',
          'groupEnd',
          'table',
          'Console',
          'markTimeline',
          'profile',
          'profileEnd',
          'timeline',
          'timelineEnd',
          'timeStamp',
          'context',
        ],
      },
    ],
    'no-debugger': 'error',
    'no-duplicate-case': 'error',
    'no-duplicate-imports': 'error',
    'no-eval': 'error',
    'no-fallthrough': 'error',
    'no-new-wrappers': 'error',
    'no-param-reassign': 'error',
    'no-prototype-builtins': 'off',
    'no-redeclare': 'error',
    'no-return-await': 'error',
    'no-sparse-arrays': 'error',
    'no-template-curly-in-string': 'error',
    'no-undef-init': 'error',
    'no-unsafe-finally': 'error',
    'no-unused-expressions': 'error',
    'no-unused-labels': 'error',
    'object-shorthand': 'error',
    'one-var': ['error', 'never'],
    'padding-line-between-statements': [
      'error',
      {
        blankLine: 'always',
        prev: '*',
        next: 'return',
      },
    ],
    'use-isnan': 'error',
    radix: 'error',
    'import/no-default-export': 'error',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    'import/order': [
      'error',
      {
        alphabetize: {
          order: 'asc',
        },
        groups: [['builtin', 'external'], ['internal', 'parent', 'sibling', 'index'], 'object', 'type'],
        'newlines-between': 'always',
        warnOnUnassignedImports: true,
      },
    ],
  },
  overrides: [
    {
      // Settings for TS
      files: ['*.ts', '*.tsx'],
      excludedFiles: ['webpack.config.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./tsconfig.test.json'],
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      settings: {
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
          },
        },
        'react': {
          version: 'detect',
        },
      },
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/adjacent-overload-signatures':  'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/consistent-type-assertions': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-member-accessibility': [
          'error',
          {
            accessibility: 'explicit',
            overrides: {
              accessors: 'explicit',
              constructors: 'explicit',
            },
          },
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'interface', format: ['PascalCase'], filter: { regex: 'Window', match: false } },
          { selector: 'class', format: ['PascalCase'] },
          { selector: 'method', format: null, filter: { regex: '^UNSAFE_', match: true } },
        ],
        '@typescript-eslint/member-ordering': [
          'error',
          {
            classes: [
              'public-static-field',
              'protected-static-field',
              'public-static-method',
              'protected-static-method',
            ],
            interfaces: 'never',
            typeLiterals: 'never',
          },
        ],
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-extraneous-class': 'error',
        '@typescript-eslint/no-for-in-array': 'off',
        '@typescript-eslint/no-inferrable-types': ['error', { ignoreParameters: true }],
        '@typescript-eslint/no-misused-new': 'error',
        '@typescript-eslint/no-namespace': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unnecessary-qualifier': 'error',
        '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: false, typedefs: true }],
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/parameter-properties': 'error',
        '@typescript-eslint/prefer-as-const': 'warn',
        '@typescript-eslint/prefer-namespace-keyword': 'error',
        '@typescript-eslint/restrict-plus-operands': 'off',
        '@typescript-eslint/space-within-parens': ['off', 'never'],
        '@typescript-eslint/triple-slash-reference': 'error',
        '@typescript-eslint/unbound-method': 'off',
        'prefer-const': 'warn',
        // TS checks this, no need to use eslint rule
        'import/export': 'off',
        'import/named': 'off',
        'import/namespace': 'off',
        'import/no-unresolved': 'off',
      },
      overrides: [
        // Rules for stubs and tests
        {
          files: [
            '**/__stubs__/*.ts',
            '**/__stubs__/**/*.ts',
            '**/__mocks__/*.ts',
            '**/__mocks__/**/*.ts',
            '*.test.ts',
            '*.test.tsx',
          ],
          rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'import/no-extraneous-dependencies': 'off',
            'max-lines': ['error', 500],
          },
        },
        // Rules for typings
        {
          files: ['*.d.ts'],
          rules: {
            '@typescript-eslint/naming-convention': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'import/no-extraneous-dependencies': 'off',
          },
        },
        {
          files: ['*.stories.tsx'],
          rules: {
            'import/no-default-export': 'off',
          },
        },
      ],
    },
    {
      files: ['webpack.config.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./tsconfig-webpack.json'],
      },
      overrides: [
        {
          files: ['webpack.config.ts'],
          rules: {
            'import/no-extraneous-dependencies': 'off',
            'import/no-default-export': 'off',
          },
        },
      ]
    },
  ],
};
