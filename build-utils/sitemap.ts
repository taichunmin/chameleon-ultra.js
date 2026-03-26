import { getSiteurl } from '../pug/dotenv'

import dayjs from 'dayjs'
import fg from 'fast-glob'
import { promises as fsPromises } from 'fs'
import * as _ from 'lodash-es'
import path from 'path'

const __dirname = import.meta.dirname

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
}

build().catch(err => {
  console.error(err)
  process.exit(1)
})
