import { EventEmitter } from 'events'
import { describe, expect, test, vi } from 'vitest'
import { EventAsyncGenerator } from './EventAsyncGenerator'
import { sleep } from './helper'

describe('EventIterable', () => {
  test('should await immediate onData value', async () => {
    const it = new EventAsyncGenerator()
    it.onData(1)
    expect(await it.next()).toEqual({ value: 1, done: false })
  })

  test('should await dalayed onData value', async () => {
    const it = new EventAsyncGenerator()
    void sleep(10).then(() => { it.onData(1) }) // no wait
    expect(await it.next()).toEqual({ value: 1, done: false })
  })

  test('should await immediate end', async () => {
    const it = new EventAsyncGenerator()
    it.onClose()
    expect(await it.next()).toEqual({ value: undefined, done: true })
  })

  test('should await delayed end', async () => {
    const it = new EventAsyncGenerator()
    void sleep(10).then(async () => { it.onClose() }) // no wait
    expect(await it.next()).toEqual({ value: undefined, done: true })
  })

  test('should await immediate error', async () => {
    expect.assertions(1)

    try {
      const it = new EventAsyncGenerator()
      it.onError(new Error())
      await it.next()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })

  test('should await delayed error', async () => {
    expect.assertions(1)

    try {
      const it = new EventAsyncGenerator()
      void sleep(10).then(async () => { it.onError(new Error()) }) // no wait
      await it.next()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })

  test('does not yield new items if return has been called', async () => {
    const it = new EventAsyncGenerator()
    void it.return(undefined)
    expect(await it.next()).toEqual({ value: undefined, done: true })
  })

  test('does not queue for new items if return has been called', async () => {
    const it = new EventAsyncGenerator()
    it.onData(1)
    expect(await it.next()).toEqual({ value: 1, done: false })
    expect(await it.return(undefined)).toEqual({ value: undefined, done: true })
    it.onData(2)
    expect(await it.next()).toEqual({ value: undefined, done: true })
  })

  test('should call remove handler once with no arguments on immediate end', async () => {
    const it = new EventAsyncGenerator()
    it.removeCallback = vi.fn()
    it.onClose()
    expect(it.removeCallback).toHaveBeenCalledTimes(1)
    expect(it.removeCallback).toHaveBeenCalledWith()
  })

  test('should call remove handler once with no arguments on delayed end', async () => {
    const it = new EventAsyncGenerator()
    it.removeCallback = vi.fn()
    void sleep(10).then(() => { it.onClose() }) // no wait
    await sleep(20)
    expect(it.removeCallback).toHaveBeenCalledTimes(1)
    expect(it.removeCallback).toHaveBeenCalledWith()
  })

  test('should call remove handler on immediate return', async () => {
    const it = new EventAsyncGenerator()
    it.removeCallback = vi.fn()
    await it.return(undefined)
    expect(it.removeCallback).toHaveBeenCalledTimes(1)
    expect(it.removeCallback).toHaveBeenCalledWith()
  })

  test('should call remove handler on delayed return', async () => {
    const it = new EventAsyncGenerator()
    it.removeCallback = vi.fn()
    void sleep(10).then(async () => { await it.return(undefined) }) // no wait
    await sleep(20)
    expect(it.removeCallback).toHaveBeenCalledTimes(1)
    expect(it.removeCallback).toHaveBeenCalledWith()
  })

  test('should call remove handler on immediate error', async () => {
    expect.hasAssertions()
    const it = new EventAsyncGenerator()
    try {
      it.removeCallback = vi.fn()
      it.onError(new Error())
      await it.next()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(it.removeCallback).toHaveBeenCalledTimes(1)
      expect(it.removeCallback).toHaveBeenCalledWith()
    }
  })

  test('should call remove handler on delayed error', async () => {
    expect.hasAssertions()
    const it = new EventAsyncGenerator()
    try {
      it.removeCallback = vi.fn()
      void sleep(10).then(() => { it.onError(new Error()) }) // no wait
      await it.next()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(it.removeCallback).toHaveBeenCalledTimes(1)
      expect(it.removeCallback).toHaveBeenCalledWith()
    }
  })

  test('should buffer iterator calls when the queue is empty', async () => {
    const event = new EventEmitter()
    const it = new EventAsyncGenerator()
    event.on('data', it.onData)
    it.removeCallback = () => {
      event.removeListener('data', it.onData)
    }

    const reqs = Promise.all([it.next(), it.next()])
    event.emit('data', 1)
    event.emit('data', 2)

    const actual = await reqs
    expect(actual).toMatchObject([
      { value: 1, done: false },
      { value: 2, done: false },
    ])
  })

  test('should broadcast all reqs when event emitter closes', async () => {
    const event = new EventEmitter()
    const it = new EventAsyncGenerator()
    event.on('data', it.onData)
    event.on('close', it.onClose)
    it.removeCallback = () => {
      event.removeListener('data', it.onData)
      event.removeListener('close', it.onClose)
    }

    event.emit('data', 1)
    event.emit('data', 2)
    event.emit('close')
    event.emit('data', 3)

    const actual = await Promise.all([it.next(), it.next(), it.next(), it.next()])
    expect(actual).toMatchObject([
      { value: 1, done: false },
      { value: 2, done: false },
      { value: undefined, done: true },
      { value: undefined, done: true },
    ])
  })

  test('it should buffer iterator calls and yield undefined after return', async () => {
    const event = new EventEmitter()
    const it = new EventAsyncGenerator()
    event.on('data', it.onData)
    it.removeCallback = () => {
      event.removeListener('data', it.onData)
    }

    const reqs = Promise.all([it.next(), it.return(undefined), it.next()])
    void sleep(10).then(() => { event.emit('data', 1) }) // no wait
    void sleep(20).then(() => { event.emit('data', 2) }) // no wait
    void sleep(30).then(() => { event.emit('data', 3) }) // no wait

    const actual = await reqs
    expect(actual).toMatchObject([
      { value: 1, done: false },
      { value: undefined, done: true },
      { value: undefined, done: true },
    ])
  })

  test('it should buffer values and yield undefined after return', async () => {
    const event = new EventEmitter()
    const it = new EventAsyncGenerator()
    event.on('data', it.onData)
    it.removeCallback = () => {
      event.removeListener('data', it.onData)
    }

    event.emit('data', 1)
    event.emit('data', 2)
    event.emit('data', 3)

    const actual = await Promise.all([it.next(), it.return(undefined), it.next()])
    expect(actual).toMatchObject([
      { value: 1, done: false },
      { value: undefined, done: true },
      { value: undefined, done: true },
    ])
  })
})
