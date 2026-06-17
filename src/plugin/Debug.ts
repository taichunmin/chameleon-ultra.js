import { type Buffer } from '@taichunmin/buffer'
import createDebugger, { type Debugger } from 'debug'
import * as _ from 'lodash-es'
import { setObject } from '../iifeExportHelper'
import { type PluginInstallContext as ChameleonCtx, type UltraPlugin, type DebugFilter } from '../types'

let Buffer1: typeof Buffer

const ERROR_KEYS = [
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/Error
  'columnNumber',
  'filename',
  'lineNumber',
  'message',
  'name',
  'stack',

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
  'errors',

  // https://nodejs.org/api/errors.html
  'address',
  'code',
  'dest',
  'errno',
  'function',
  'info',
  'library',
  'opensslErrorStack',
  'path',
  'port',
  'reason',
  'syscall',

  // axios: https://github.com/axios/axios/blob/v1.x/lib/core/AxiosError.js
  'config',
  'description',
  'fileName',
  'number',
  'request',
  'response.data',
  'response.headers',
  'response.status',
  'status',

  // http-errors: https://github.com/jshttp/http-errors/blob/master/index.js
  'statusCode',
  'statusMessage',

  // GraphQLError: https://www.graphql-js.org/api-v16/error/
  'args',
  'cause',
  'positions',
  'source',
  'locations',
  'line',
  'column',

  // custom
  'data',
] as const

export default class Debug implements UltraPlugin {
  debugers = new Map<string, Debugger>()
  filter?: DebugFilter
  name = 'debug'

  async install (context: ChameleonCtx): Promise<this> {
    const { ultra } = context
    if (_.isNil(Buffer1)) Buffer1 = context.Buffer
    ultra.emitter.on('error', (err: Error) => {
      const errJson = Debug.errToJson(err)
      ultra.emitter.emit('debug', 'error', Debug.jsonStringify(errJson))
      console.error(errJson)
    })
    ultra.emitter.on('debug', (namespace: string, formatter: any, ...args: [] | any[]) => {
      if (!(this.filter?.(namespace, formatter, ...args) ?? true)) return
      const debug = this.debugers.get(namespace) ?? createDebugger(`ultra:${namespace}`)
      if (!this.debugers.has(namespace)) this.debugers.set(namespace, debug)
      debug(formatter, ...args)
    })
    return this
  }

  /**
   * @group Internal
   * @internal
   */
  static errToJson<T extends Error & { cause?: any, stack?: any }> (err: T): Partial<T> {
    const tmp: any = {
      ..._.pick(err, ERROR_KEYS),
      ...(_.isNil(err.cause) ? {} : { cause: Debug.errToJson(err.cause) }),
    }
    return tmp
  }

  /**
   * @group Internal
   * @internal
   */
  static stringifyClone (obj: any): any {
    const preventCircular = new Set()
    return _.cloneDeepWith(obj, val1 => {
      if (_.isObject(val1) && !_.isEmpty(val1)) {
        if (preventCircular.has(val1)) return '[Circular]'
        preventCircular.add(val1)
      }
      if (Buffer1?.isBuffer(val1)) return { type: 'Buffer', hex: val1.toString('hex') }
      if (typeof val1 === 'bigint') return val1.toString()
      if (val1 instanceof Error) return Debug.errToJson(val1)
      if (val1 instanceof Map) return _.fromPairs([...val1.entries()])
      if (val1 instanceof Set) return [...val1.values()]
      if (val1 instanceof Date) return val1.toISOString()
    })
  }

  /**
   * @group Internal
   * @internal
   */
  static stringifyReplacer (this: any, key: any, val: any): any {
    if (key.length > 1 && key[0] === '_') return undefined
    const censored = this?._censored ?? []
    for (const key1 of censored) {
      if (!_.hasIn(this, key1)) continue
      _.set(this, key1, '[Censored]')
    }
    delete this?._censored
    return this[key]
  }

  /**
   * @group Internal
   * @internal
   */
  static jsonStringify (obj: object, space?: number): string {
    return JSON.stringify(Debug.stringifyClone(obj), Debug.stringifyReplacer, space)
  }
}

setObject(globalThis, ['ChameleonUltraJS', 'Debug'], Debug)
