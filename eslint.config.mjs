import pug from 'eslint-plugin-pug'
import { defineConfig } from 'eslint/config'
import * as _ from 'lodash-es'
import neostandard from 'neostandard'
// import { inspect } from 'util'

const neostandardCfg = removeRules(
  neostandard({
    env: ['browser', 'es2026', 'node', 'vitest', 'vue'],
    files: ['**/*.cjs', '**/*.js', '**/*.mjs'],
    filesTs: ['**/*.ts'],
    globals: ['_', 'axios', 'Crypto1', 'JSON5', 'Papa', 'Swal', 'Vue'],
    ignores: ['dist/**/*'],
    noJsx: true,
    ts: true,
  }),
  [
    '@stylistic/func-call-spacing',
    '@stylistic/object-property-newline',
    '@stylistic/quotes',
  ],
)

// console.log(inspect(neostandardCfg))

export default defineConfig([
  ...neostandardCfg,
  {
    name: 'chameleon-ultra.js/js',
    files: ['**/*.cjs', '**/*.js', '**/*.mjs', '**/*.ts'],
    rules: {
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/function-call-spacing': ['error', 'never'],
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
      'multiline-ternary': 'off',
      'no-void': ['error', { allowAsStatement: true }],
      '@stylistic/quotes': ['error', 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'never',
      }],
    },
  },
  {
    name: 'chameleon-ultra.js/pug1',
    files: ['**/*.pug', '**/*.jade'], // apply processor to .jade, .pug files
    plugins: { pug },
    processor: 'pug/pug',
  },
  {
    name: 'chameleon-ultra.js/pug2',
    files: ['**/*.pug.mjs', '**/*.pug.js'],
    rules: {
      '@stylistic/eol-last': ['error', 'never'],
      '@stylistic/spaced-comment': ['error', 'always', {
        line: { markers: ['*package', '!', '/', ',', '=', '-'] },
        block: { balanced: true, markers: ['*package', '!', ',', ':', '::', 'flow-include'], exceptions: ['*'] },
      }],
    },
  },
])

function removeRules (configs, ruleKeys) {
  return _.map(configs, config => ({
    ...config,
    ...(_.has(config, 'rules') ? { rules: _.omit(config.rules, ruleKeys) } : {}),
  }))
}
