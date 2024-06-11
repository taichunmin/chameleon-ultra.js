import _ from 'lodash'
import * as sut from './Debug'

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
    _censored: ['censored', 'censored1'],
    bigint: 1n,
    censored: 'test',
    circular1: circular,
    circular2: circular,
    date: new Date('2000-01-01T00:00:00Z'),
    error: new Error('test'),
    map: new Map([['a', 1]]),
    number: 1,
    set: new Set([1, 2, 3]),
    string: 'abc',
  }
  const actual = JSON.parse(sut.jsonStringify(obj))
  expect(actual).toMatchObject({
    bigint: '1',
    censored: '[Censored]',
    circular1: { b: 1 },
    circular2: '[Circular]',
    date: '2000-01-01T00:00:00.000Z',
    error: { message: 'test', name: 'Error' },
    map: { a: 1 },
    number: 1,
    set: [1, 2, 3],
    string: 'abc',
  })
})
