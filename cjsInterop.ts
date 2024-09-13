import fg from 'fast-glob'
import fsPromises from 'node:fs/promises'

async function main (): Promise<void> {
  try {
    const changed = { cjs: 0, dts: 0 }
    const cjsInteropFiles = new Set<string>()

    // .d.ts
    for (const dtsfile of await fg(['dist/**/*.d.ts'])) {
      let code = await fsPromises.readFile(dtsfile, 'utf-8')
      const matches = [...code.matchAll(/export { [\w$]+ as default };/g)]
      if (matches.length !== 1) continue
      // console.log(`dtsfile = ${dtsfile}`)

      const origCode = code
      code = code.replace(/export { ([\w$]+) as default };/, 'export = $1;')
      if (origCode === code) continue
      await fsPromises.writeFile(dtsfile, code, 'utf8')
      cjsInteropFiles.add(dtsfile.substring(0, dtsfile.length - 5)) // for cjs
      changed.dts++
    }

    // .cjs
    for (const file of await fg(['dist/**/*.js'])) {
      if (!cjsInteropFiles.has(file.substring(0, file.length - 3))) continue
      let code = await fsPromises.readFile(file, 'utf-8')
      // console.log(`file = ${file}`)

      const origCode = code
      code = code.replace(/"use strict";.*?module.exports=[^;]+;/, '"use strict";')
      code = code.replace(/[\w$]+\(globalThis,\[[^\]]+\],([\w$]+)\);/, 'module.exports=$1;')
      if (origCode === code) continue
      await fsPromises.writeFile(file, code, 'utf8')
      changed.cjs++
    }

    console.log(`changed = ${JSON.stringify(changed)}`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main().catch(() => {})
