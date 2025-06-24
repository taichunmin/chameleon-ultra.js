import 'dotenv/config'
import * as _ from 'lodash-es'

export function getenv<T extends string | undefined> (key: string, defaultVal: T): string | T {
  return process.env?.[key] ?? defaultVal
}

export function getPort (): number {
  return _.toInteger(getenv('PORT', '30000'))
}

export function getSiteurl (path: string = ''): string {
  return new URL(path, getenv('BASEURL', 'https://taichunmin.idv.tw/chameleon-ultra.js/')).href
}

export const isDevelopment = getenv('NODE_ENV', 'development') === 'development'

export const isProduction = getenv('NODE_ENV', 'development') === 'production'
