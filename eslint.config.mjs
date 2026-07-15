import pug from 'eslint-plugin-pug'
import { defineConfig } from 'eslint/config'
import * as _ from 'lodash-es'
import { inspect } from 'util'
import neostandard from 'neostandard'
import tsdoc from 'eslint-plugin-tsdoc'

// DEBUG_CONFIG=1 FORCE_COLOR=1 yarn lint:ci '**/*.pug' | less -R
const DEBUG_CONFIG = process.env.DEBUG_CONFIG === '1'
const tsFiles = ['**/*.ts']
const jsFiles = ['**/*.{cjs,js,mjs}']

const importedCfgs = removeRules(neostandard({
  env: ['browser', 'es2026', 'node', 'vitest', 'vue'],
  files: ['**/*.cjs', '**/*.js', '**/*.mjs'],
  filesTs: ['**/*.ts'],
  globals: ['_', 'axios', 'Crypto1', 'JSON5', 'Papa', 'Swal', 'Vue'],
  ignores: ['dist/**/*'],
  noJsx: true,
  ts: true,
}), [])
if (DEBUG_CONFIG) console.log(inspect(importedCfgs, { depth: 5, colors: true }))

// patch tsdoc
;(() => {
  const origRule = tsdoc.rules.syntax
  tsdoc.rules.syntax = {
    ...origRule,
    create: (context) => {
      const patched = {
        report: (opts) => {
          // require('fs').writeFileSync('./debug.txt', `${JSON.stringify(opts)}\r\n`, { flag: 'as' })
          if (opts.messageId === 'tsdoc-param-tag-with-invalid-name' && opts?.data?.unformattedText?.indexOf?.('non-word characters') !== -1) return
          return context.report(opts)
        },
      }
      Object.setPrototypeOf(patched, context)
      return origRule.create(patched)
    },
  }
})()

export default defineConfig([
  {
    name: 'chameleon-ultra.js/projectService',
    languageOptions: {
      parserOptions: {
        projectService: {
          defaultProject: 'tsconfig.eslint.json',
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 1000,
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
          allowDefaultProject: [
            'pug/*/*.pug/*.pug.{mjs,js}',
          ],
        },
      },
    },
  },
  {
    name: 'chameleon-ultra.js/plugins',
    plugins: {
      pug,
      tsdoc,
    },
  },
  ...importedCfgs,
  {
    name: 'chameleon-ultra.js/ignores',
    ignores: ['.*', 'dist/**/*'],
  },
  {
    name: 'chameleon-ultra.js/js',
    files: [...jsFiles, ...tsFiles],
    rules: {
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/function-call-spacing': ['error', 'never'],
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
      'multiline-ternary': 'off',
      'no-void': ['error', { allowAsStatement: true }],
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
  {
    name: 'chameleon-ultra.js/tsdoc',
    files: ['**/*.ts'],
    rules: {
      'tsdoc/syntax': 'warn',
    },
  },
])

function removeRules (configs, ruleKeys) {
  return _.map(configs, config => ({
    ...config,
    ...(_.has(config, 'rules') ? { rules: _.omit(config.rules, ruleKeys) } : {}),
  }))
}
