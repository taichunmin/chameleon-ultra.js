import { fileURLToPath } from 'url'
import fsPromises from 'fs/promises'
import JSON5 from 'json5'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

async function main (): Promise<void> {
  // version in package.json
  const pkg = JSON5.parse(await fsPromises.readFile(path.resolve(__dirname, '../package.json'), 'utf8'))
  const verFiles = [
    '../dist/variables/index.version.html',
  ]
  for (let file of verFiles) {
    try {
      file = path.resolve(__dirname, file)
      let content = await fsPromises.readFile(file, 'utf8')
      content = content.replace(/ = [.]{3}/g, ` = &#39;${pkg.version}&#39;`)
      await fsPromises.writeFile(file, content, 'utf8')
    } catch (err) {
      err.message = `${err.message}, file: ${file}`
      console.error(err)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
