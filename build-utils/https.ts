import { getPort, getSiteurl } from '../pug/dotenv'

import * as _ from 'lodash-es'
import { fileURLToPath } from 'url'
import { promises as fsPromises } from 'fs'
import finalhandler from 'finalhandler'
import https from 'https'
import livereload from 'livereload'
import path from 'path'
import serveStatic from 'serve-static'
import watch from 'node-watch'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

async function readMkcert (): Promise<{ cert: Buffer, key: Buffer }> {
  try {
    const [cert, key] = await Promise.all([
      fsPromises.readFile(path.resolve(__dirname, '../mkcert/cert.pem')),
      fsPromises.readFile(path.resolve(__dirname, '../mkcert/key.pem')),
    ])
    return { cert, key }
  } catch (err) {
    throw new Error('Failed to load mkcert. Please run "yarn mkcert" first.')
  }
}

async function main (): Promise<void> {
  const publicDir = path.resolve(__dirname, '../dist')

  const httpsServer = https.createServer(await readMkcert(), (req, res) => {
    serveStatic(publicDir, {
      index: ['index.html', 'index.htm'],
    })(req, res, finalhandler(req, res))
  })

  const livereloadServer = livereload.createServer({
    port: getPort(),
    server: httpsServer,
  }) as LiveReloadServer1

  livereloadServer._filterRefresh = (livereloadServer as any).filterRefresh
  livereloadServer.filterRefresh = _.debounce((filepath: string) => { livereloadServer._filterRefresh?.(filepath) }, 1000)
  livereloadServer.watch(publicDir)
  console.log(`build finish. Visit: ${getSiteurl('/test.html')}`)

  watch(['./pug'], { recursive: true }, async (e, name) => {
    if (e !== 'update') return
    const match = name.match(/^pug[/]src[/](.+)\.pug$/)
    if (_.isNil(match)) return
    console.log(getSiteurl(`./${match[1].replace(/\\/g, '/')}.html`))
  })
}

type LiveReloadServer1 = livereload.LiveReloadServer & { _filterRefresh?: livereload.LiveReloadServer['filterRefresh'] }

main().catch(err => {
  console.error(err)
  process.exit(1)
})
