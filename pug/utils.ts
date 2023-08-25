import _ from 'lodash'
import { promises as fsPromises } from 'fs'
import dayjs from 'dayjs'
import path from 'path'

const ERROR_KEYS = [
  'address',
  'args',
  'code',
  'data',
  'dest',
  'errno',
  'extensions',
  'info',
  'locations',
  'message',
  'name',
  'path',
  'port',
  'positions',
  'reason',
  'response.data',
  'response.headers',
  'response.status',
  'source',
  'stack',
  'status',
  'statusCode',
  'statusMessage',
  'syscall',
]

export function errToJson<T extends Error & { originalError?: any, stack?: any }> (err: T): Partial<T> {
  const tmp: any = {
    ..._.pick(err, ERROR_KEYS),
    ...(_.isNil(err.originalError) ? {} : { originalError: errToJson(err.originalError) }),
    stack: err?.stack,
  }
  return tmp
}

export const genSitemap = (() => {
  const toUrl = (url: string): string => `<url><loc>${url}</loc><changefreq>daily</changefreq></url>`
  const toUrlset = (urls: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${_.join(_.map(urls, toUrl), '')}</urlset>`
  const toSitemap = ({ lastmod, url }: { lastmod: string, url: string }): string => `<sitemap><loc>${url}</loc><lastmod>${lastmod}</lastmod></sitemap>`
  const toSitemapIndex = ({ lastmod, urls }: { lastmod: string, urls: string[] }): string => `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${_.join(_.map(urls, url => toSitemap({ lastmod, url })), '')}</sitemapindex>`
  return async ({ baseurl, dist, urls }: { baseurl: string, dist: string, urls: string[] }) => {
    const sitemapIndex = []
    const lastmod = dayjs().format('YYYY-MM-DDTHH:mmZ')
    for (const [index, chunk] of _.toPairs(_.chunk(urls, 1000))) {
      await fsPromises.writeFile(path.join(dist, `sitemap_${index}.xml`), toUrlset(chunk))
      sitemapIndex.push(new URL(`sitemap_${index}.xml`, baseurl).href)
    }
    await fsPromises.writeFile(path.join(dist, 'sitemap.xml'), toSitemapIndex({ lastmod, urls: sitemapIndex }))
  }
})()