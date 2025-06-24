module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  extends: ['love'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'eslint-plugin-local-rules'],
  parserOptions: {
    project: true,
  },
  rules: {
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    '@typescript-eslint/return-await': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/unbound-method': 'off',
    'local-rules/tsdoc/syntax': 'warn',
    'multiline-ternary': 'off',
    'no-extra-boolean-cast': 'off',
    'no-return-await': 'off',
    '@typescript-eslint/no-invalid-void-type': ['error', {
      allowAsThisParameter: true,
    }],
    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'only-multiline',
    }],
    '@typescript-eslint/comma-dangle': ['error', {
      arrays: 'always-multiline',
      enums: 'always-multiline',
      exports: 'always-multiline',
      generics: 'always-multiline',
      imports: 'always-multiline',
      objects: 'always-multiline',
      tuples: 'always-multiline',
      functions: 'only-multiline',
    }],
  },
}
