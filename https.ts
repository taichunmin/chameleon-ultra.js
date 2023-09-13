import { getPort, getSiteurl } from './pug/dotenv'

import _ from 'lodash'
import { promises as fsPromises } from 'fs'
import finalhandler from 'finalhandler'
import https from 'https'
import livereload from 'livereload'
import path from 'path'
import serveStatic from 'serve-static'
import watch from 'node-watch'

async function readMkcert (): Promise<any> {
  try {
    const [cert, key] = await Promise.all([
      fsPromises.readFile(path.resolve(__dirname, './mkcert/cert.pem')),
      fsPromises.readFile(path.resolve(__dirname, './mkcert/key.pem')),
    ])
    return { cert, key }
  } catch (err) {
    throw new Error('Failed to load mkcert. Please run "yarn mkcert" first.')
  }
}

async function main (): Promise<void> {
  const publicDir = path.resolve(__dirname, './dist')

  const httpsServer = https.createServer(await readMkcert(), (req, res) => {
    serveStatic(publicDir, {
      index: ['index.html', 'index.htm'],
    })(req, res, finalhandler(req, res))
  })

  const livereloadServer = livereload.createServer({
    port: getPort(),
    server: httpsServer,
  })

  livereloadServer.watch(publicDir)
  console.log(`build finish. Visit: ${getSiteurl()}`)

  watch(['./pug'], { recursive: true }, async (e, name) => {
    if (e !== 'update') return
    const match = name.match(/^pug[/]src[/](.+)\.pug$/)
    if (_.isNil(match)) return
    console.log(getSiteurl(`./${match[1].replace(/\\/g, '/')}.html`))
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
