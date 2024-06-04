import { EventEmitter } from './EventEmitter'
// import { EventEmitter } from 'node:events'

describe('Event: error', () => {
  test('should emit error event', () => {
    expect.hasAssertions()
    const emitter = new EventEmitter()
    emitter.on('error', err => {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('test')
    })
    emitter.on('test', () => {
      throw new Error('test')
    })
    emitter.emit('test')
  })

  test('should capture rejections of promises', async () => {
    expect.hasAssertions()
    const emitter = new EventEmitter()
    emitter.on('error', err => {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('test')
    })
    emitter.on('test', (async () => {
      throw new Error('test')
    }) as any)
    emitter.emit('test')
  })
})

describe('Event: newListener', () => {
  test('should emit newListener event', () => {
    class TestEmitter1 extends EventEmitter {}
    const emitter = new TestEmitter1()
    const actual: string[] = []
    emitter.once('newListener', (eventName, listener) => {
      if (eventName !== 'test') return
      emitter.on('test', () => { actual.push('newListener') })
    })
    expect(emitter.listenerCount('test')).toBe(0)
    emitter.on('test', () => { actual.push('test') })
    expect(emitter.listenerCount('test')).toBe(2)
    emitter.emit('test')
    expect(actual).toEqual(['newListener', 'test'])
  })
})

describe('Event: removeListener', () => {
  test('should emit removeListener event', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.once('removeListener', (eventName, listener) => {
      if (eventName !== 'test') return
      actual.push('removeListener')
    })
    emitter.once('test', () => { actual.push('test') })
    emitter.emit('test')
    expect(actual).toEqual(['removeListener', 'test'])
  })
})

describe('function alias test', () => {
  test.each([
    { a: 'addListener', b: 'on' },
    { a: 'off', b: 'removeListener' },
  ] as const)('EventEmitter#$a should be alias of EventEmitter#$b', ({ a, b }) => {
    const emitter = new EventEmitter()
    expect(emitter[a]).toBe(emitter[b])
  })
})

describe('#emit', () => {
  test('should call all listeners with same arguments', () => {
    const emitter = new EventEmitter()
    const actual: any[] = []
    emitter.on('test', () => {
      actual.push('first')
    })
    emitter.on('test', (arg1, arg2) => {
      actual.push(`second: ${arg1}, ${arg2}`)
    })
    emitter.on('test', (...args) => {
      actual.push(`third: ${args.join(', ')}`)
    })
    emitter.emit('test', 1, 2, 3, 4, 5)
    expect(actual).toEqual([
      'first',
      'second: 1, 2',
      'third: 1, 2, 3, 4, 5',
    ])
  })
})

describe('#eventNames', () => {
  test('should return all event names', () => {
    const emitter = new EventEmitter()
    emitter.on('foo', () => {})
    emitter.on('bar', () => {})
    const sym = Symbol('symbol')
    emitter.on(sym, () => {})

    const actual = emitter.eventNames()
    expect(actual).toEqual(['foo', 'bar', sym])
  })
})

describe('#getMaxListeners, #setMaxListeners', () => {
  test('should return the max listeners count', () => {
    const emitter = new EventEmitter()
    expect(emitter.getMaxListeners()).toBe(10)

    emitter.setMaxListeners(5)
    expect(emitter.getMaxListeners()).toBe(5)
  })

  test('should throw an error when max listeners exceeded', () => {
    expect.hasAssertions()
    try {
      const emitter = new EventEmitter()
      emitter.setMaxListeners(1)
      emitter.on('test', () => {})
      emitter.on('test', () => {})
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toMatch('Max listeners exceeded for event: ')
    }
  })

  test('should throw an error when max listeners exceeded', () => {
    expect.hasAssertions()
    try {
      const emitter = new EventEmitter()
      emitter.setMaxListeners(1)
      emitter.prependListener('test', () => {})
      emitter.prependListener('test', () => {})
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toMatch('Max listeners exceeded for event: ')
    }
  })
})

describe('#listenerCount', () => {
  test('should return the number of listeners for the eventName', () => {
    const emitter = new EventEmitter()
    const [listener1, listener2, listener3] = [jest.fn(), jest.fn(), jest.fn()]
    emitter.on('test', listener1)
    expect(emitter.listenerCount('test')).toEqual(1)
    emitter.on('test', listener2)
    expect(emitter.listenerCount('test')).toEqual(2)
    emitter.on('test', listener3)
    expect(emitter.listenerCount('test')).toEqual(3)
  })

  test('should return 0 when there are no listeners', () => {
    const emitter = new EventEmitter()
    const [listener1, listener2, listener3] = [jest.fn(), jest.fn(), jest.fn()]
    emitter.on('test', listener1)
    expect(emitter.listenerCount('test', listener1)).toEqual(1)
    emitter.on('test', listener2)
    expect(emitter.listenerCount('test', listener1)).toEqual(1)

    emitter.on('test', listener1)
    expect(emitter.listenerCount('test', listener1)).toEqual(2)
    emitter.on('test', listener3)
    expect(emitter.listenerCount('test', listener1)).toEqual(2)

    emitter.on('test', listener1)
    expect(emitter.listenerCount('test', listener1)).toEqual(3)
  })
})

describe('#listeners', () => {
  test('should return all listeners for the eventName', () => {
    const emitter = new EventEmitter()
    const [listener1, listener2, listener3] = [jest.fn(), jest.fn(), jest.fn()]
    emitter.on('test1', listener1)
    emitter.on('test2', listener2)
    emitter.on('test1', listener3)
    expect(emitter.listeners('test1')).toEqual([listener1, listener3])
    expect(emitter.listeners('test2')).toEqual([listener2])
  })
})

describe('#on', () => {
  test('should trigger the listener 2 times', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.on('test', actual)
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(2)
  })

  test('should return this so that calls can be chained', () => {
    const emitter = new EventEmitter()
    const actual = emitter.on('test', () => {})
    expect(actual).toBe(emitter)
  })

  test('listeners should be invoked in the order they are added', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.on('test', () => { actual.push('first') })
    emitter.on('test', () => { actual.push('second') })
    emitter.emit('test')
    expect(actual).toEqual(['first', 'second'])
  })

  test('prependListener() should add the listener to the beginning of the listeners', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.on('test', () => { actual.push('second') })
    emitter.prependListener('test', () => { actual.push('first') })
    emitter.emit('test')
    expect(actual).toEqual(['first', 'second'])
  })
})

describe('#once', () => {
  test('should trigger the listener once', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.once('test', actual)
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(1)
  })

  test('should trigger newListener and removeListener events', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.on('newListener', () => { actual.push('newListener') })
    emitter.on('removeListener', () => { actual.push('removeListener') })
    emitter.once('test', () => { actual.push('test') })
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toEqual(['newListener', 'newListener', 'removeListener', 'test'])
  })
})

describe('#prependOnceListener', () => {
  test('should trigger the listener once', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.prependOnceListener('test', actual)
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(1)
  })

  test('should trigger newListener and removeListener events', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.on('newListener', () => { actual.push('newListener') })
    emitter.on('removeListener', () => { actual.push('removeListener') })
    emitter.prependOnceListener('test', () => { actual.push('test') })
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toEqual(['newListener', 'newListener', 'removeListener', 'test'])
  })
})

describe('#removeAllListeners', () => {
  test('should remove all listeners for the eventName', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.on('test', () => { actual.push('first') })
    emitter.on('test', () => { actual.push('second') })
    emitter.emit('test')
    emitter.removeAllListeners('test')
    emitter.emit('test')
    expect(actual).toEqual(['first', 'second'])
  })

  test('should remove all listeners', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.on('test1', () => { actual.push('test1') })
    emitter.on('test2', () => { actual.push('test2') })
    emitter.removeAllListeners()
    emitter.emit('test1')
    emitter.emit('test2')
    expect(actual).toEqual([])
  })
})

describe('#removeListener', () => {
  test('should remove one listener', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.on('test', actual)
    emitter.on('test', actual)
    emitter.emit('test')
    emitter.removeListener('test', actual)
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(3)
  })

  test('cb2 removes cb1 but cb1 should be called', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    const cb1 = (): void => { actual.push('cb1') }
    const cb2 = (): void => {
      actual.push('cb2')
      emitter.removeListener('test', cb1)
    }
    emitter.on('test', cb2).on('test', cb1)
    emitter.emit('test')
    expect(actual).toEqual(['cb2', 'cb1'])
    emitter.emit('test')
    expect(actual).toEqual(['cb2', 'cb1', 'cb2'])
  })

  test('should remove listener added by #once', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.once('test', actual)
    emitter.removeListener('test', actual)
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(0)
  })

  test('should remove latest listener', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    function pong (): void { actual.push('pong') }

    emitter.on('ping', pong)
    emitter.once('ping', pong)
    emitter.removeListener('ping', pong)

    emitter.emit('ping')
    emitter.emit('ping')
    expect(actual).toEqual(['pong', 'pong'])
  })

  test('#removeEventListener', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.on('test', actual)
    emitter.on('test', actual)
    emitter.emit('test')
    ;(emitter as any).removeEventListener('test', actual)
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(3)
  })

  test('should no effect if no listeners', () => {
    const emitter = new EventEmitter()
    emitter.removeListener('test', () => {})
    expect(emitter.listenerCount('test')).toBe(0)
  })
})

describe('#rawListeners', () => {
  test('should return a copy of the listeners including wrappers', () => {
    const emitter = new EventEmitter()
    const actual: string[] = []
    emitter.once('test', () => { actual.push('once') })

    const listeners1 = emitter.rawListeners('test')
    const fnWrapper = listeners1[0]

    ;(fnWrapper as any).listener?.()
    fnWrapper()

    emitter.on('test', () => { actual.push('on') })
    const listeners2 = emitter.rawListeners('test')
    listeners2[0]()
    emitter.emit('test')

    expect(actual).toEqual(['once', 'once', 'on', 'on'])
  })
})

describe('#dispatchEvent', () => {
  test('should emit the event', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    emitter.on('test', actual)
    ;(emitter as any).dispatchEvent({ type: 'test' })
    expect(actual).toHaveBeenCalledTimes(1)
  })
})

describe('#addEventListener', () => {
  test('should add an event listener that can be trigger multiple times', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    ;(emitter as any).addEventListener('test', actual)
    emitter.emit('test')
    ;(emitter as any).dispatchEvent({ type: 'test' })
    expect(actual).toHaveBeenCalledTimes(2)
  })

  test('should add an event listener that can be trigger once', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    ;(emitter as any).addEventListener('test', actual, { once: true })
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(1)
  })

  test('should add an event listener and ignore capture boolean', () => {
    const emitter = new EventEmitter()
    const actual = jest.fn()
    ;(emitter as any).addEventListener('test', actual, false)
    emitter.emit('test')
    emitter.emit('test')
    expect(actual).toHaveBeenCalledTimes(2)
  })
})
