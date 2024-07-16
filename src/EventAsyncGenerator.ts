const symbolClose = Symbol.for('EventAsyncGenerator.close')

export class EventAsyncGenerator<T = unknown, TReturn = unknown, TNext = unknown> implements AsyncGenerator<T, TReturn, TNext> {
  #isFinally = false
  #pullPromise: Resolvable<T | typeof symbolClose> | null = null
  readonly #it: AsyncGenerator<T, TReturn, TNext>
  readonly #queue: Array<T | typeof symbolClose | Error> = []

  onClose: () => void
  onData: (value: T) => void
  onError: (err: Error) => void
  removeCallback?: () => void | Promise<void>

  constructor (init?: (me: EventAsyncGenerator<T, TReturn, TNext>) => void | Promise<void>) {
    const me = this // eslint-disable-line @typescript-eslint/no-this-alias
    this.onData = (value: T) => {
      if (this.#pullPromise !== null) this.#pullPromise.resolve?.(value)
      else this.#queue.push(value)
    }
    this.onClose = () => {
      if (this.#pullPromise !== null) this.#pullPromise.resolve?.(symbolClose)
      else this.#queue.push(symbolClose)
      void this.finally()
    }
    this.onError = (err: Error) => {
      if (this.#pullPromise !== null) this.#pullPromise.reject?.(err)
      else this.#queue.push(err)
      void this.finally()
    }
    this.#it = (async function * () {
      try {
        await init?.(me)
        while (true) {
          let valueOrErr: T | typeof symbolClose | Error
          if (me.#queue.length > 0) valueOrErr = me.#queue.shift() as T | typeof symbolClose | Error
          else {
            me.#pullPromise = createResolvable<T | typeof symbolClose>()
            valueOrErr = await me.#pullPromise.catch(err => err)
            me.#pullPromise = null
          }
          if (valueOrErr === symbolClose) return
          if (valueOrErr instanceof Error) throw valueOrErr
          yield valueOrErr
        }
      } finally {
        await me.finally()
      }
    })() as AsyncGenerator<T, TReturn, TNext>
  }

  async next (...args: [] | [TNext]): Promise<IteratorResult<T, TReturn>> {
    return await this.#it.next(...args)
  }

  async return (value: TReturn | PromiseLike<TReturn>): Promise<IteratorResult<T, TReturn>> {
    const result = await this.#it.return(value)
    await this.finally()
    return result
  }

  async throw (err: Error): Promise<IteratorResult<T, TReturn>> {
    const result = await this.#it.throw(err)
    await this.finally()
    return result
  }

  async finally (): Promise<void> {
    if (this.#isFinally) return
    this.#isFinally = true
    await this.removeCallback?.()
  }

  [Symbol.asyncIterator] (): this {
    return this
  }
}

type Resolvable<T> = Promise<T> & {
  resolve: (t: T) => void
  reject: (err: Error) => void
}

function createResolvable<T> (): Resolvable<T> {
  let resolve, reject
  const resolvable = new Promise<T>((...args) => {
    ;[resolve, reject] = args
  }) as Resolvable<T>
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  Object.assign(resolvable, { resolve, reject })
  return resolvable
}
