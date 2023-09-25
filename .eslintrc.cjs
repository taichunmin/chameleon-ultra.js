module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "jest": true,
    "node": true
  },
  extends: ['standard-with-typescript'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  parserOptions: {
    project: './tsconfig.json'
  },
  rules: {
    '@typescript-eslint/return-await': 0, // 0 = off, 1 = warn, 2 = error
    'multiline-ternary': 0, // 0 = off, 1 = warn, 2 = error
    'no-extra-boolean-cast': 0, // 0 = off, 1 = warn, 2 = error
    'no-return-await': 0, // 0 = off, 1 = warn, 2 = error
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
  },
}
