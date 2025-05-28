import { getenv, getSiteurl } from './dotenv'

import * as _ from 'lodash-es'
import { errToJson } from './utils'
import { fileURLToPath } from 'url'
import { inspect } from 'util'
import { minify as htmlMinifier } from 'html-minifier'
import { promises as fsPromises } from 'fs'
import fg from 'fast-glob'
import path from 'path'
import process from 'process'
import pug from 'pug'
import UglifyJS from 'uglify-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, './src/')
const distDir = path.resolve(__dirname, '../dist/')

export async function build (): Promise<void> {
  const sitemapUrls = []

  const PUG_OPTIONS = {
    basedir: path.resolve(__dirname),
    baseurl: getSiteurl(),
    NODE_ENV: getenv('NODE_ENV', 'production'),
  }

  const htmlMinifierOptions = {
    caseSensitive: true,
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    conservativeCollapse: true,
    decodeEntities: true,
    minifyCSS: true,
    minifyJS: (code: string) => UglifyJS.minify(code).code,
    removeCDATASectionsFromCDATA: true,
    removeComments: true,
    removeCommentsFromCDATA: true,
    removeEmptyAttributes: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true,
  }

  // compile pug files
  const pugFiles = _.map(await fg('src/**/*.pug', { cwd: __dirname }), file => file.slice(4))

  let pugErrors = 0
  for (const file of pugFiles) {
    try {
      let html = pug.renderFile(path.resolve(srcDir, file), PUG_OPTIONS)
      if (PUG_OPTIONS.NODE_ENV === 'production') html = htmlMinifier(html, htmlMinifierOptions)
      const dist = path.resolve(distDir, file.replace(/\.pug$/, '.html'))
      await fsPromises.mkdir(path.dirname(dist), { recursive: true })
      await fsPromises.writeFile(dist, html)
      sitemapUrls.push(getSiteurl(`pug/${file.replace(/\.pug$/, '.html').replace(/index\.html$/, '')}`))
    } catch (err: any) {
      _.set(err, 'data.src', `./src/${file}`)
      console.log(`Failed to render pug, err = ${inspect(errToJson(err), { depth: 100, sorted: true })}`)
      pugErrors++
    }
  }
  if (pugErrors > 0) throw new Error(`Failed to render ${pugErrors} pug files.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
