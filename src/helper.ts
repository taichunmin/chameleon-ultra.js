import _ from 'lodash'

export type MiddlewareComposeFn = (ctx: Record<string, any>, next: () => Promise<unknown>) => Promise<unknown>

enum MiddlewareStatus {
  PENDING,
  STARTED,
  FINISHED,
  ERROR,
}

export function middlewareCompose (middlewares: MiddlewareComposeFn[]): (ctx?: Record<string, any>, next?: MiddlewareComposeFn) => Promise<unknown> {
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
  let timer: NodeJS.Timeout | undefined
  await new Promise(resolve => { timer = setTimeout(resolve, ms) })
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

export function versionCompare (str1: string, str2: string): number {
  const tmp = _.map([str1, str2], (str, idx) => {
    const matched = _.trim(str).match(/^(?:(\d+)[.]?)(?:(\d+)[.]?)?(?:(\d+)[.]?)?/)
    if (_.isNil(matched)) throw new Error(`invalid version: str${idx + 1} = ${str}`)
    return _.map(matched.slice(1), v => _.isNil(v) ? 0 : _.toSafeInteger(v))
  })
  for (let i = 0; i < 3; i++) {
    if (tmp[0][i] > tmp[1][i]) return 1
    if (tmp[0][i] < tmp[1][i]) return -1
  }
  return 0
}
