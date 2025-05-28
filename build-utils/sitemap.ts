import { getSiteurl } from '../pug/dotenv'

import * as _ from 'lodash-es'
import { fileURLToPath } from 'url'
import { promises as fsPromises } from 'fs'
import dayjs from 'dayjs'
import fg from 'fast-glob'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

function toUrl (url: string): string {
  url = url.replace(/[/]index[.]html$/, '/')
  return `<url><loc>${url}</loc><changefreq>daily</changefreq></url>`
}

function toUrlset (urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${_.join(_.map(urls, toUrl), '')}</urlset>`
}

function toSitemap ({ lastmod, url }: { lastmod: string, url: string }): string {
  return `<sitemap><loc>${url}</loc><lastmod>${lastmod}</lastmod></sitemap>`
}

function toSitemapIndex ({ lastmod, urls }: { lastmod: string, urls: string[] }): string {
  return `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${_.join(_.map(urls, url => toSitemap({ lastmod, url })), '')}</sitemapindex>`
}

async function writeSitemapByUrls ({ baseurl, dist, urls }: GenSitemapArgs): Promise<void> {
  const sitemapIndex = []
  const lastmod = dayjs().format('YYYY-MM-DDTHH:mmZ')
  for (const [index, chunk] of _.toPairs(_.chunk(urls, 1000))) {
    await fsPromises.writeFile(path.join(dist, `sitemap_${index}.xml`), toUrlset(chunk))
    sitemapIndex.push(new URL(`sitemap_${index}.xml`, baseurl).href)
  }
  await fsPromises.writeFile(path.join(dist, 'sitemap.xml'), toSitemapIndex({ lastmod, urls: sitemapIndex }))
}

interface GenSitemapArgs {
  baseurl: string
  dist: string
  urls: string[]
}

export async function build (): Promise<void> {
  const publicDir = path.resolve(__dirname, '../dist')
  const urls = _.chain(await fg('../dist/**/*.html', { cwd: __dirname }))
    .map(filepath => path.resolve(__dirname, filepath))
    .map(filepath => path.relative(publicDir, filepath))
    .map(getSiteurl)
    .value()
  await writeSitemapByUrls({ baseurl: getSiteurl(), dist: publicDir, urls })

  // og:image
  let ogImageAddedCnt = 0
  for (const filepath of await fg('../dist/**/*.html', { cwd: __dirname })) {
    const filepath1 = path.resolve(__dirname, filepath)
    let content = await fsPromises.readFile(filepath1, 'utf8')
    if (content.includes('property="og:image"')) continue
    content = content.replace('</head>', '<meta property="og:image" content="https://i.imgur.com/bWJGSGq.png"><meta property="og:image:width" content="1280"><meta property="og:image:height" content="640"></head>')
    await fsPromises.writeFile(filepath1, content, 'utf8')
    ogImageAddedCnt++
  }
  console.log(`Added og:image to ${ogImageAddedCnt} files`)
}

build().catch(err => {
  console.error(err)
  process.exit(1)
})
