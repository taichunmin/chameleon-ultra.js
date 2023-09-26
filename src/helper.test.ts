import * as sut from './helper'

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
