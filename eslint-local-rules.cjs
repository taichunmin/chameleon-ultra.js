const eslintPluginTsdoc = require('eslint-plugin-tsdoc')
const fs = require('fs')

function eslintPluginTsdocPatch () {
  const origRule = eslintPluginTsdoc.rules.syntax
  return {
    ...origRule,
    create: context => {
      const patched = {
        report: opts => {
          // fs.writeFileSync('./debug.txt', `${JSON.stringify(opts)}\r\n`, { flag: 'as' })
          if (opts.messageId === 'tsdoc-param-tag-with-invalid-name' && opts?.data?.unformattedText?.indexOf?.('non-word characters') !== -1) return
          return context.report(opts)
        },
      }
      Object.setPrototypeOf(patched, context)
      return origRule.create(patched)
    },
  }
}

module.exports = {
  'tsdoc/syntax': eslintPluginTsdocPatch(),
}
