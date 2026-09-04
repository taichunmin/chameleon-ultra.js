import { getSiteurl } from '../pug/dotenv'

import fg from 'fast-glob'
import fsPromises from 'fs/promises'
import JSON5 from 'json5'
import path from 'path'

const __dirname = import.meta.dirname

async function main (): Promise<void> {
  await replaceVersionPlaceholder()
  await addOgImageMeta()
  await addContext7Widget()
  await absolutizeLlmsTxtLinks()
}

/** typedoc writes the links of `llms.txt` relative to the file, but crawlers and LLM clients read it with no base URL to resolve them against. */
async function absolutizeLlmsTxtLinks (): Promise<void> {
  const LLMS_TXT = path.resolve(__dirname, '../dist/llms.txt')
  const ABSOLUTE_LINK = /^(?:[a-z][a-z\d+\-.]*:|\/\/|#)/i
  const MARKDOWN_LINK = /(\[[^\]]*\]\()([^)\s]+)(\))/g

  let cnt = 0
  let isFenced = false
  const lines = (await fsPromises.readFile(LLMS_TXT, 'utf8')).split('\n').map(line => {
    if (line.trimStart().startsWith('```')) isFenced = !isFenced
    if (isFenced) return line // a JS sample like `fns[0](arg)` is not a link
    return line.replace(MARKDOWN_LINK, (matched, prefix, url, suffix) => {
      if (ABSOLUTE_LINK.test(url)) return matched
      cnt++
      return `${prefix}${getSiteurl(url)}${suffix}`
    })
  })
  await fsPromises.writeFile(LLMS_TXT, lines.join('\n'), 'utf8')
  console.log(`Rewrote ${cnt} relative links in llms.txt to ${getSiteurl()}`)
}

/** typedoc renders the source of the `version` export, which is the `...` placeholder that tsup only replaces at build time. */
async function replaceVersionPlaceholder (): Promise<void> {
  const pkg = JSON5.parse(await fsPromises.readFile(path.resolve(__dirname, '../package.json'), 'utf8'))
  const verFiles = [
    '../dist/variables/index.version.html',
  ]
  for (let filepath of verFiles) {
    try {
      filepath = path.resolve(__dirname, filepath)
      let content = await fsPromises.readFile(filepath, 'utf8')
      content = content.replace(/ = [.]{3}/g, ` = &#39;${pkg.version}&#39;`)
      await fsPromises.writeFile(filepath, content, 'utf8')
    } catch (err) {
      err.message = `${err.message}, filepath: ${filepath}`
      console.error(err)
    }
  }
}

/** Rewrites every page of `dist` with `patch`, which returns `null` to skip a page. */
async function patchHtmlFiles (label: string, patch: (content: string) => string | null): Promise<void> {
  let cnt = 0
  for (const globbed of await fg('../dist/**/*.html', { cwd: __dirname })) {
    const filepath = path.resolve(__dirname, globbed)
    try {
      const patched = patch(await fsPromises.readFile(filepath, 'utf8'))
      if (patched === null) continue
      await fsPromises.writeFile(filepath, patched, 'utf8')
      cnt++
    } catch (err) {
      err.message = `${err.message}, filepath: ${filepath}`
      console.error(err)
    }
  }
  console.log(`Added ${label} to ${cnt} files`)
}

async function addOgImageMeta (): Promise<void> {
  const OG_IMAGE_META = '<meta property="og:image" content="https://i.imgur.com/bWJGSGq.png"><meta property="og:image:width" content="1280"><meta property="og:image:height" content="640"></head>'
  await patchHtmlFiles('og:image', content => {
    if (content.includes('property="og:image"')) return null
    return content.replace('</head>', OG_IMAGE_META)
  })
}

async function addContext7Widget (): Promise<void> {
  const CONTEXT7_SCRIPT = '<script src="https://context7.com/widget.js" data-library="/llmstxt/taichunmin_idv_tw_chameleon-ultra_js_llms_txt"></script>'
  await patchHtmlFiles('Context7 chat integration', content => {
    if (content.includes(CONTEXT7_SCRIPT)) return null
    return content.replace('</body>', `${CONTEXT7_SCRIPT}</body>`)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
