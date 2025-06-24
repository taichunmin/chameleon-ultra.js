import * as _ from 'lodash-es'

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
