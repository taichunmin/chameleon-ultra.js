import * as _ from 'lodash-es'
const captureRejectionSymbol = Symbol.for('nodejs.rejection')

export class EventEmitter implements NodeJS.EventEmitter, EventTarget {
  ;[captureRejectionSymbol]?: (err: Error, eventName: EventName, ...args: [] | any[]) => void
  static readonly defaultMaxListeners = 10
  #maxListeners = EventEmitter.defaultMaxListeners
  readonly #eventMap: EventMap = new Map()

  emit (eventName: EventName, ...args: [] | any[]): boolean {
    const listeners = this.rawListeners(eventName)
    if (listeners.length === 0) return false
    for (const listener of listeners) {
      try {
        const promise: any | Promise<any> = listener.apply(null, args)
        if (!_.isFunction(promise?.catch)) continue // not promise
        promise.catch((err: Error) => {
          if (err instanceof Error) this.emit('error', err)
        })
      } catch (err) {
        this.emit('error', err)
      }
    }
    return true
  }

  dispatchEvent (event: DomEvent): boolean {
    this.emit(event.type, event)
    return true
  }

  eventNames (): EventName[] {
    return [...this.#eventMap.keys()]
  }

  getMaxListeners (): number {
    return this.#maxListeners
  }

  listenerCount (eventName: EventName, listener?: EventListener): number {
    const listeners = this.rawListeners(eventName)
    if (listener === undefined) return listeners.length
    return _.sumBy(listeners, listener2 => isListenerEqual(listener, listener2) ? 1 : 0)
  }

  listeners (eventName: EventName): EventListener[] {
    return _.map(this.#eventMap.get(eventName), listener => listener.listener ?? listener)
  }

  on<T extends any[]> (eventName: EventName, listener: EventListener<T>): this {
    const listeners = this.#eventMap.get(eventName) ?? []
    if (!this.#eventMap.has(eventName)) this.#eventMap.set(eventName, listeners)
    if (this.#maxListeners > 0 && listeners.length >= this.#maxListeners) throw new Error(`Max listeners exceeded for event: ${String(eventName)}`)

    this.emit('newListener', eventName, listener)
    listeners.push(listener)
    return this
  }

  // @ts-expect-error ts(2416)
  get addListener (): this['on'] { return this.on }

  addEventListener (eventName: EventName, listener: EventListener, options: boolean | AddEventListenerOptions = {}): this {
    if (typeof options === 'boolean') options = { capture: options }
    if (options.once === true) return this.once(eventName, listener)
    return this.on(eventName, listener)
  }

  once<T extends EventListener> (eventName: EventName, listener: T): this {
    return this.on(eventName, onceWrapper(this, eventName, listener))
  }

  prependListener (eventName: EventName, listener: EventListener): this {
    const listeners = this.#eventMap.get(eventName) ?? []
    if (!this.#eventMap.has(eventName)) this.#eventMap.set(eventName, listeners)
    if (this.#maxListeners > 0 && listeners.length >= this.#maxListeners) throw new Error(`Max listeners exceeded for event: ${String(eventName)}`)

    listeners.unshift(listener)
    this.emit('newListener', eventName, listener)
    return this
  }

  prependOnceListener (eventName: EventName, listener: EventListener): this {
    return this.prependListener(eventName, onceWrapper(this, eventName, listener))
  }

  removeAllListeners (eventName?: EventName): this {
    if (eventName !== undefined) {
      this.#eventMap.delete(eventName)
    } else {
      for (const eventName1 of this.#eventMap.keys()) this.#eventMap.delete(eventName1)
    }
    return this
  }

  removeListener (eventName: EventName, listener: EventListener): this {
    const listeners = this.#eventMap.get(eventName) ?? []
    const idx = _.findLastIndex(listeners, listener2 => isListenerEqual(listener, listener2))
    // console.log(`idx = ${idx}, listeners = ${listeners as unknown as string}`)
    if (idx >= 0) {
      listeners.splice(idx, 1)
      this.emit('removeListener', eventName, listener)
    }
    return this
  }

  removeEventListener (eventName: EventName, listener: EventListener, options: EventListenerOptions = {}): void {
    this.removeListener(eventName, listener)
  }

  // @ts-expect-error ts(2416)
  get off (): this['removeListener'] { return this.removeListener }

  setMaxListeners (num: number): this {
    this.#maxListeners = num
    return this
  }

  rawListeners (eventName: EventName): EventListener[] {
    return [...(this.#eventMap.get(eventName) ?? [])]
  }
}

/** @inline */
type EventListener<T extends any[] = any[]> = EventListenerOrig<T> & { listener?: EventListenerOrig<T> }

/** @inline */
type EventListenerOrig<T extends any[] = any[]> = (...args: T) => unknown | Promise<unknown>

/** @inline */
type EventMap = Map<EventName, EventListener[]>

/** @inline */
type EventName = string | symbol

/** @inline */
interface DomEvent {
  type: string
}

/** @inline */
interface EventListenerOptions {
  capture?: boolean
}

/** @inline */
interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean
  passive?: boolean
  signal?: any
}

function onceWrapper (emitter: EventEmitter, eventName: EventName, listener: EventListener): EventListener {
  const wrapped = (...args: [] | any[]): void => {
    emitter.removeListener(eventName, listener)
    listener.apply(null, args)
  }
  wrapped.listener = listener
  return wrapped
}

function isListenerEqual (listener1: EventListener, listener2: EventListener): boolean {
  return (listener1.listener ?? listener1) === (listener2.listener ?? listener2)
}
