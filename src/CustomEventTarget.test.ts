import CustomEventTarget from './CustomEventTarget'
import { describe, expect, test, vi } from 'vitest'

describe('on', () => {
  test('1 on() + 0 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    expect(listener).toHaveBeenCalledTimes(0)
  })

  test('1 on() + 1 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    target.emit('test', 'hello')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('hello')
  })

  test('1 on() + 2 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    target.emit('test', 'hello')
    target.emit('test', 'world')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 'hello')
    expect(listener).toHaveBeenNthCalledWith(2, 'world')
  })

  test('duplicate on()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    target.on('test', listener)
    target.emit('test', 'hello')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('hello')
  })

  test('2 on() + 1 emit()', () => {
    const target = new CustomEventTarget()
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    target.on('test', listener1)
    target.on('test', listener2)
    target.emit('test', 'hello')
    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener1).toHaveBeenCalledWith('hello')
    expect(listener2).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledWith('hello')
  })
})

describe('once', () => {
  test('1 once() + 0 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.once('test', listener)
    expect(listener).toHaveBeenCalledTimes(0)
  })

  test('1 once() + 2 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.once('test', listener)
    target.emit('test', 'hello')
    target.emit('test', 'world')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('hello')
  })

  test('duplicate once()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.once('test', listener)
    target.once('test', listener)
    target.emit('test', 'hello')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('hello')
  })

  test('2 once() + 1 emit()', () => {
    const target = new CustomEventTarget()
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    target.once('test', listener1)
    target.once('test', listener2)
    target.emit('test', 'hello')
    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener1).toHaveBeenCalledWith('hello')
    expect(listener2).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledWith('hello')
  })

  test('1 on() + 1 once() + 2 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    target.once('test', listener)
    target.emit('test', 'hello')
    target.emit('test', 'world')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 'hello')
    expect(listener).toHaveBeenNthCalledWith(2, 'world')
  })

  test('1 once() + 1 on() + 2 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.once('test', listener)
    target.on('test', listener)
    target.emit('test', 'hello')
    target.emit('test', 'world')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenNthCalledWith(1, 'hello')
  })
})

describe('removeListener', () => {
  test('1 on() + 1 removeListener() + 1 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    target.removeListener('test', listener)
    target.emit('test', 'hello')
    expect(listener).toHaveBeenCalledTimes(0)
  })

  test('1 once() + 1 removeListener() + 1 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.once('test', listener)
    target.removeListener('test', listener)
    target.emit('test', 'hello')
    expect(listener).toHaveBeenCalledTimes(0)
  })

  test('1 on() + 1 emit() + 1 removeListener() + 1 emit()', () => {
    const target = new CustomEventTarget()
    const listener = vi.fn()
    target.on('test', listener)
    target.emit('test', 'hello')
    target.removeListener('test', listener)
    target.emit('test', 'world')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('hello')
  })
})
