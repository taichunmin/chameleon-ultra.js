import fsPromises from 'fs/promises'
import JSON5 from 'json5'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

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
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
