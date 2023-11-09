import _ from 'lodash'
import * as sut from './helper'

test('sleep', async () => {
  expect.hasAssertions()
  const start = Date.now()
  await sut.sleep(100)
  const end = Date.now()
  expect(end - start).toBeGreaterThanOrEqual(90)
})

test('errToJson', async () => {
  const err = _.merge(new Error('test'), { originalError: new Error('test') })
  const actual = sut.errToJson(err)
  expect(actual).toMatchObject({
    name: 'Error',
    message: 'test',
    originalError: {
      name: 'Error',
      message: 'test',
    },
  })
})

test('jsonStringify', async () => {
  const circular = { b: 1 }
  const obj = {
    circular1: circular,
    circular2: circular,
    map: new Map([['a', 1]]),
    number: 1,
    set: new Set([1, 2, 3]),
    string: 'abc',
  }
  const actual = sut.jsonStringify(obj)
  expect(actual).toBe('{"circular1":{"b":1},"circular2":"[Circular]","map":{"a":1},"number":1,"set":[1,2,3],"string":"abc"}')
})

describe('middlewareCompose', () => {
  test('should have correct order', async () => {
    const actual: number[] = []

    await sut.middlewareCompose([
      async (ctx, next) => {
        actual.push(1)
        await sut.sleep(1)
        await next()
        await sut.sleep(1)
        actual.push(6)
      },
      async (ctx, next) => {
        actual.push(2)
        await sut.sleep(1)
        await next()
        await sut.sleep(1)
        actual.push(5)
      },
      async (ctx, next) => {
        actual.push(3)
        await sut.sleep(1)
        await next()
        await sut.sleep(1)
        actual.push(4)
      },
    ])({})

    expect(actual).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('should be able to called twice', async () => {
    const actual1 = { arr: [] }
    const actual2 = { arr: [] }
    const expected = [1, 2, 3, 4, 5, 6]

    const handler = sut.middlewareCompose([
      async (ctx, next) => {
        ctx.arr.push(1)
        await sut.sleep(1)
        await next()
        await sut.sleep(1)
        ctx.arr.push(6)
      },
      async (ctx, next) => {
        ctx.arr.push(2)
        await sut.sleep(1)
        await next()
        await sut.sleep(1)
        ctx.arr.push(5)
      },
      async (ctx, next) => {
        ctx.arr.push(3)
        await sut.sleep(1)
        await next()
        await sut.sleep(1)
        ctx.arr.push(4)
      },
    ])
    await Promise.all([
      handler(actual1),
      handler(actual2),
    ])

    expect(actual1.arr).toEqual(expected)
    expect(actual2.arr).toEqual(expected)
  })

  test('should only accept an array', async () => {
    expect.hasAssertions()
    try {
      await (sut.middlewareCompose as (...args: any[]) => unknown)()
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError)
    }
  })

  test('should work with 0 middleware', async () => {
    expect.hasAssertions()
    await sut.middlewareCompose([])({})
    expect(1).toBe(1)
  })

  test('should only accept an array of functions', async () => {
    expect.hasAssertions()
    try {
      await (sut.middlewareCompose as (...args: any[]) => unknown)([{}])
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError)
    }
  })

  test('should execute after next() is called', async () => {
    expect.hasAssertions()
    await sut.middlewareCompose([
      async (ctx, next) => {
        await next()
        expect(1).toBe(1)
      },
    ])({})
  })

  test('should reject when middleware throw error', async () => {
    expect.hasAssertions()
    try {
      await sut.middlewareCompose([
        async (ctx, next) => {
          throw new Error()
        },
      ])({})
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })

  test('should share the same context', async () => {
    const actual = {}
    await sut.middlewareCompose([
      async (ctx, next) => {
        await next()
        expect(ctx).toBe(actual)
      },
      async (ctx, next) => {
        await next()
        expect(ctx).toBe(actual)
      },
      async (ctx, next) => {
        await next()
        expect(ctx).toBe(actual)
      },
    ])(actual)
  })

  test('should catch error throwed in next()', async () => {
    expect.hasAssertions()
    const actual: number[] = []

    await sut.middlewareCompose([
      async (ctx, next) => {
        actual.push(1)
        try {
          actual.push(2)
          await next()
          actual.push(6)
        } catch (err) {
          actual.push(4)
          expect(err).toBeInstanceOf(Error)
        }
        actual.push(5)
      },
      async (ctx, next) => {
        actual.push(3)
        throw new Error()
      },
    ])({})

    expect(actual).toEqual([1, 2, 3, 4, 5])
  })

  test('should work with next', async () => {
    expect.hasAssertions()
    await sut.middlewareCompose([])({}, async () => {
      expect(1).toBe(1)
    })
  })

  test('should handle error throwed in non-async middleware', async () => {
    expect.hasAssertions()
    try {
      await sut.middlewareCompose([
        () => {
          throw new Error()
        },
      ])({})
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })

  test('should work with other compositions', async () => {
    const actual: number[] = []

    await sut.middlewareCompose([
      sut.middlewareCompose([
        async (ctx, next) => {
          actual.push(1)
          await next()
        },
        async (ctx, next) => {
          actual.push(2)
          await next()
        },
      ]),
      async (ctx, next) => {
        actual.push(3)
        await next()
      },
    ])({})

    expect(actual).toEqual([1, 2, 3])
  })

  test('should throw error when next() called multiple times', async () => {
    expect.hasAssertions()
    try {
      await sut.middlewareCompose([
        async (ctx, next) => {
          await next()
          await next()
        },
      ])({})
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain('called multiple times')
    }
  })

  test('should not mutate original middleware array', async () => {
    const fn1 = (ctx: any, next: any): any => next()
    const fns = [fn1]

    await sut.middlewareCompose(fns)({})

    expect(fns).toEqual([fn1])
  })

  test('should share the same context in middleware and next()', async () => {
    const actual = { middleware: 0, next: 0 }

    await sut.middlewareCompose([
      async (ctx, next) => {
        ctx.middleware++
        await next()
      },
    ])(actual, async (ctx, next) => {
      ctx.next++
      await next()
    })

    expect(actual).toEqual({ middleware: 1, next: 1 })
  })

  test('should throw error on non-await async middleware', async () => {
    expect.hasAssertions()
    const ctx1 = { flag: 0 }
    try {
      await sut.middlewareCompose([
        async (ctx, next) => {
          void next()
        },
        async (ctx, next) => {
          await sut.sleep(1)
          ctx1.flag = 1
        },
      ])(ctx1)
    } catch (err) {
      expect(err.message).toContain('should be awaited')
      expect(ctx1.flag).toBe(0)
    }
  })

  test('should have correct return value with next', async () => {
    const actual = await sut.middlewareCompose([
      async (ctx, next) => {
        expect(await next()).toBe(2)
        return 1
      },
      async (ctx, next) => {
        expect(await next()).toBe(0)
        return 2
      },
    ])({}, (): any => 0)

    expect(actual).toBe(1)
  })

  test('should have correct return value without next', async () => {
    const actual = await sut.middlewareCompose([
      async (ctx, next) => {
        expect(await next()).toBe(2)
        return 1
      },
      async (ctx, next) => {
        expect(await next()).toBeUndefined()
        return 2
      },
    ])({})

    expect(actual).toBe(1)
  })
})

describe('versionCompare', () => {
  test.each([
    // equal
    { str1: '1', str2: '1', expected: 0 },
    { str1: '1', str2: '1.0', expected: 0 },
    { str1: '1', str2: '1.0.0', expected: 0 },
    { str1: '1.0', str2: '1', expected: 0 },
    { str1: '1.0', str2: '1.0', expected: 0 },
    { str1: '1.0', str2: '1.0.0', expected: 0 },
    { str1: '1.0.0', str2: '1', expected: 0 },
    { str1: '1.0.0', str2: '1.0', expected: 0 },
    { str1: '1.0.0', str2: '1.0.0', expected: 0 },

    // greater
    { str1: '1.0.1', str2: '1.0.0', expected: 1 },
    { str1: '1.1.0', str2: '1.0.0', expected: 1 },
    { str1: '2.0.0', str2: '1.0.0', expected: 1 },

    // less
    { str1: '1.0.0', str2: '1.0.1', expected: -1 },
    { str1: '1.0.0', str2: '1.1.0', expected: -1 },
    { str1: '1.0.0', str2: '2.0.0', expected: -1 },
  ])('versionCompare(\'$str1\', \'$str2\') = $expected', ({ str1, str2, expected }) => {
    expect(sut.versionCompare(str1, str2)).toBe(expected)
  })
})
