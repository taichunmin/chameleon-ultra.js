import _ from 'lodash'
import { type ValuesType } from 'utility-types'

export type MiddlewareComposeFn = (ctx: Record<string, any>, next: () => Promise<unknown>) => Promise<unknown>

enum MiddlewareStatus {
  PENDING,
  STARTED,
  FINISHED,
  ERROR,
}

export function middlewareCompose (middlewares: MiddlewareComposeFn[]): (ctx: Record<string, any>, next?: MiddlewareComposeFn) => Promise<unknown> {
  // 型態檢查
  if (!_.isArray(middlewares)) throw new TypeError('Middleware stack must be an array!')
  if (_.some(middlewares, fn => !_.isFunction(fn))) throw new TypeError('Middleware must be composed of functions!')

  return async (context = {}, next?: MiddlewareComposeFn) => {
    const cloned = [...middlewares, ...(_.isFunction(next) ? [next] : [])]
    if (cloned.length === 0) return
    const executed = _.times(cloned.length + 1, () => MiddlewareStatus.PENDING)
    const dispatch = async (cur: number): Promise<unknown> => {
      if (executed[cur] !== MiddlewareStatus.PENDING) throw new Error(`middleware[${cur}] called multiple times`)
      if (cur >= cloned.length) {
        executed[cur] = MiddlewareStatus.FINISHED
        return
      }
      try {
        executed[cur] = MiddlewareStatus.STARTED
        const result = await cloned[cur](context, async () => await dispatch(cur + 1))
        if (executed[cur + 1] === MiddlewareStatus.STARTED) throw new Error(`next() in middleware[${cur}] should be awaited`)
        executed[cur] = MiddlewareStatus.FINISHED
        return result
      } catch (err) {
        executed[cur] = MiddlewareStatus.ERROR
        if (_.isString(err.stack)) err.stack = err.stack.replace(/at async dispatch[^\n]+\n[^\n]+\n\s*/g, '')
        throw err
      }
    }
    return await dispatch(0)
  }
}

export async function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createIsEnum<T extends readonly any[] | ArrayLike<any> | Record<any, any>> (e: T): (val: any) => val is ValuesType<T> {
  const s = new Set(_.values(e))
  return (val: any): val is ValuesType<T> => s.has(val)
}

export function createIsEnumInteger<T extends readonly any[] | ArrayLike<any> | Record<any, any>> (e: T): (val: any) => val is ValuesType<T> {
  const isEnum = createIsEnum(e)
  return (val: any): val is ValuesType<T> => _.isInteger(val) && isEnum(val)
}

const ERROR_KEYS = [
  'address',
  'args',
  'code',
  'data',
  'dest',
  'errno',
  'info',
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
] as const

export function errToJson<T extends Error & { originalError?: any, stack?: any }> (err: T): Partial<T> {
  const tmp: any = {
    ..._.pick(err, ERROR_KEYS),
    ...(_.isNil(err.originalError) ? {} : { originalError: errToJson(err.originalError) }),
  }
  return tmp
}

export function jsonStringify (obj: object, space?: number): string {
  try {
    const preventCircular = new Set()
    return JSON.stringify(obj, (key, value) => {
      if (value instanceof Map) return _.fromPairs([...value.entries()])
      if (value instanceof Set) return [...value.values()]
      if (_.isObject(value) && !_.isEmpty(value)) {
        if (preventCircular.has(value)) return '[Circular]'
        preventCircular.add(value)
      }
      return value
    }, space)
  } catch (err) {
    return `[UnexpectedJSONParseError]: ${err.message as string}`
  }
}
