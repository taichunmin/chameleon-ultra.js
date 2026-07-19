import fg from 'fast-glob'
import fsPromises from 'fs/promises'
import JSON5 from 'json5'
import path from 'path'

const __dirname = import.meta.dirname

const CONTEXT7_SCRIPT = '<script src="https://context7.com/widget.js" data-library="/llmstxt/taichunmin_idv_tw_chameleon-ultra_js_llms_txt"></script>'
const OG_IMAGE_META = '<meta property="og:image" content="https://i.imgur.com/bWJGSGq.png"><meta property="og:image:width" content="1280"><meta property="og:image:height" content="640"></head>'

async function main (): Promise<void> {
  // version in package.json
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

  // og:image
  let ogImageAddedCnt = 0
  for (const filepath of await fg('../dist/**/*.html', { cwd: __dirname })) {
    try {
      const filepath1 = path.resolve(__dirname, filepath)
      let content = await fsPromises.readFile(filepath1, 'utf8')
      if (content.includes('property="og:image"')) continue
      content = content.replace('</head>', OG_IMAGE_META)
      await fsPromises.writeFile(filepath1, content, 'utf8')
      ogImageAddedCnt++
    } catch (err) {
      err.message = `${err.message}, filepath: ${filepath}`
      console.error(err)
    }
  }
  console.log(`Added og:image to ${ogImageAddedCnt} files`)

  // Add Context7 chat integration
  let context7AddedCnt = 0
  for (let filepath of await fg('../dist/**/*.html', { cwd: __dirname })) {
    try {
      filepath = path.resolve(__dirname, filepath)
      let content = await fsPromises.readFile(filepath, 'utf8')
      if (content.includes(CONTEXT7_SCRIPT)) continue
      content = content.replace('</body>', `${CONTEXT7_SCRIPT}</body>`)
      await fsPromises.writeFile(filepath, content, 'utf8')
      context7AddedCnt++
    } catch (err) {
      err.message = `${err.message}, filepath: ${filepath}`
      console.error(err)
    }
  }
  console.log(`Added Context7 chat integration to ${context7AddedCnt} files`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
