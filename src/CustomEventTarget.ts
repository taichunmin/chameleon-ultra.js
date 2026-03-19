export default class CustomEventTarget extends EventTarget {
  readonly #listeners = new Map<string, Map<Listener, EventListener>>()

  #wrapListener (listener: Listener, once: boolean = false): EventListener {
    const wrapped: EventListener = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (Array.isArray(detail)) listener(...detail)
      if (once) this.removeListener(event.type, listener)
    }
    return wrapped
  }

  on (type: string, listener: Listener): this {
    const typeListeners = this.#listeners.get(type) ?? new Map()
    if (typeListeners.has(listener)) return this

    if (!this.#listeners.has(type)) this.#listeners.set(type, typeListeners)
    const wrapped = this.#wrapListener(listener)
    typeListeners.set(listener, wrapped)
    this.addEventListener(type, wrapped)
    return this
  }

  once (type: string, listener: Listener): this {
    const typeListeners = this.#listeners.get(type) ?? new Map()
    if (typeListeners.has(listener)) return this

    if (!this.#listeners.has(type)) this.#listeners.set(type, typeListeners)
    const wrapped = this.#wrapListener(listener, true)
    typeListeners.set(listener, wrapped)
    this.addEventListener(type, wrapped, { once: true })
    return this
  }

  emit (type: string, ...detail: any[]): void {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  removeListener (type: string, listener: Listener): this {
    const typeListeners = this.#listeners.get(type)
    const wrapped = typeListeners?.get(listener)
    if (!wrapped) return this

    typeListeners?.delete(listener)
    if (typeListeners?.size === 0) this.#listeners.delete(type)
    this.removeEventListener(type, wrapped)
    return this
  }
}

/** @inline */
type Listener = (...detail: any[]) => unknown
