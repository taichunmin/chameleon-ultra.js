import fg from 'fast-glob'
import fsPromises from 'node:fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

async function main (): Promise<void> {
  try {
    const changed = { cjs: 0, dts: 0 }
    const cjsInteropFiles = new Set<string>()

    // .d.ts
    for (let filepath of await fg(['../dist/**/*.d.ts'], { cwd: __dirname })) {
      filepath = path.resolve(__dirname, filepath)
      let code = await fsPromises.readFile(filepath, 'utf-8')
      const matches = [...code.matchAll(/export { [\w$]+ as default };/g)]
      if (matches.length !== 1) continue
      // console.log(`filepath = ${filepath}`)

      const origCode = code
      code = code.replace(/export { ([\w$]+) as default };/, 'export = $1;')
      if (origCode === code) continue
      await fsPromises.writeFile(filepath, code, 'utf8')
      cjsInteropFiles.add(filepath.substring(0, filepath.length - 5)) // for cjs
      changed.dts++
    }

    // .cjs
    for (let filepath of await fg(['../dist/**/*.js'], { cwd: __dirname })) {
      filepath = path.resolve(__dirname, filepath)
      if (!cjsInteropFiles.has(filepath.substring(0, filepath.length - 3))) continue
      let code = await fsPromises.readFile(filepath, 'utf-8')
      // console.log(`filepath = ${filepath}`)

      const origCode = code
      code = code.replace(/"use strict";.*?module.exports=[^;]+;/, '"use strict";')
      code = code.replace(/[\w$]+\(globalThis,\[[^\]]+\],([\w$]+)\);/, 'module.exports=$1;')
      if (origCode === code) continue
      await fsPromises.writeFile(filepath, code, 'utf8')
      changed.cjs++
    }

    console.log(`changed = ${JSON.stringify(changed)}`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main().catch(() => {})
