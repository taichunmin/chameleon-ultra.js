module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "jest": true,
    "node": true
  },
  extends: ['standard-with-typescript'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc'],
  root: true,
  parserOptions: {
    project: './tsconfig.json'
  },
  rules: {
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/return-await': 'off',
    'multiline-ternary': 'off',
    'no-extra-boolean-cast': 'off',
    'no-return-await': 'off',
    'tsdoc/syntax': 'warn',
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
      functions: 'only-multiline',
      imports: 'always-multiline',
      objects: 'always-multiline',
    }],
    '@typescript-eslint/unbound-method': ['error', {
      ignoreStatic: true,
    }]
  },
}
