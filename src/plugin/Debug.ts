import { type Buffer } from '@taichunmin/buffer'
import createDebugger, { type Debugger } from 'debug'
import _ from 'lodash'
import { type PluginInstallContext as ChameleonCtx, type ChameleonPlugin } from '../ChameleonUltra'

let Buffer1: typeof Buffer

export default class Debug implements ChameleonPlugin {
  debugers = new Map<string, Debugger>()
  filter?: DebugFilter
  name = 'debug'

  async install (context: ChameleonCtx): Promise<this> {
    const { ultra } = context
    if (_.isNil(Buffer1)) Buffer1 = context.Buffer
    ultra.emitter.on('error', (err: Error) => {
      const errJson = errToJson(err)
      ultra.emitter.emit('debug', 'error', jsonStringify(errJson))
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
}

;((globalThis as any ?? {}).ChameleonUltraJS ?? {}).Debug = Debug // eslint-disable-line @typescript-eslint/prefer-optional-chain

type DebugFilter = (namespace: string, formatter: any, ...args: [] | any[]) => boolean

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

/**
 * @group Internal
 * @internal
 */
export function errToJson<T extends Error & { originalError?: any, stack?: any }> (err: T): Partial<T> {
  const tmp: any = {
    ..._.pick(err, ERROR_KEYS),
    ...(_.isNil(err.originalError) ? {} : { originalError: errToJson(err.originalError) }),
  }
  return tmp
}

/**
 * @group Internal
 * @internal
 */
export function stringifyClone (obj: any): any {
  const preventCircular = new Set()
  return _.cloneDeepWith(obj, val1 => {
    if (_.isObject(val1) && !_.isEmpty(val1)) {
      if (preventCircular.has(val1)) return '[Circular]'
      preventCircular.add(val1)
    }
    if (Buffer1?.isBuffer(val1)) return { type: 'Buffer', hex: val1.toString('hex') }
    if (typeof val1 === 'bigint') return val1.toString()
    if (val1 instanceof Error) return errToJson(val1)
    if (val1 instanceof Map) return _.fromPairs([...val1.entries()])
    if (val1 instanceof Set) return [...val1.values()]
    if (val1 instanceof Date) return val1.toISOString()
  })
}

/**
 * @group Internal
 * @internal
 */
export function stringifyReplacer (this: any, key: any, val: any): any {
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
export function jsonStringify (obj: object, space?: number): string {
  return JSON.stringify(stringifyClone(obj), stringifyReplacer, space)
}
