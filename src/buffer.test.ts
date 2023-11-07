import _ from 'lodash'
import { Buffer } from './buffer'

describe('Buffer.alloc()', () => {
  test('should creates a zero-filled Buffer of length 10', () => {
    const actual = Buffer.alloc(10)
    expect(actual.toString('hex')).toEqual('00000000000000000000')
  })

  test('should creates a Buffer of length 10, filled with bytes which all have the value `1`', () => {
    const actual = Buffer.alloc(10, 1)
    expect(actual.toString('hex')).toEqual('01010101010101010101')
  })

  test('shoud creates a Buffer of length 5, filled with bytes which all have the value `a`', () => {
    const actual = Buffer.alloc(5, 'a')
    expect(actual.toString('hex')).toEqual('6161616161')
  })

  test('shoud creates a Buffer, filled with base64 encoded string', () => {
    const actual = Buffer.alloc(11, 'aGVsbG8gd29ybGQ=', 'base64')
    expect(actual.toString('hex')).toEqual('68656c6c6f20776f726c64')
  })
})

test('Buffer.allocUnsafe()', () => {
  const actual = Buffer.allocUnsafe(10)
  expect(actual.length).toEqual(10)
})

test('Buffer.allocUnsafeSlow()', () => {
  const actual = Buffer.allocUnsafeSlow(10)
  expect(actual.length).toEqual(10)
})

describe('Buffer.from()', () => {
  test('should creates a Buffer containing the bytes [1, 2, 3]', () => {
    const actual = Buffer.from([1, 2, 3])
    expect(actual.toString('hex')).toEqual('010203')
  })

  test('should be truncated using `(value & 255)` to fit into the range 0-255', () => {
    const actual = Buffer.from([257, 257.5, -255, '1'] as any)
    expect(actual.toString('hex')).toEqual('01010101')
  })

  test('should creates a Buffer containing the UTF-8 encoded bytes', () => {
    const actual = Buffer.from('tést', 'utf8')
    expect(actual.toString('hex')).toEqual('74c3a97374')
  })

  test('should creates a Buffer containing the Latin-1 bytes', () => {
    const actual = Buffer.from('tést', 'latin1')
    expect(actual.toString('hex')).toEqual('74e97374')
  })

  test('should creates a Buffer containing the utf16le bytes', () => {
    const actual = Buffer.from('fhqwhgads', 'utf16le')
    expect(actual.toString('hex')).toEqual('660068007100770068006700610064007300')
  })

  test('should creates a Buffer shares memory with u16', () => {
    const u16 = new Uint16Array(2)
    ;[u16[0], u16[1]] = [5000, 4000]
    const actual = Buffer.from(u16.buffer)
    expect(actual.toString('hex')).toEqual('8813a00f')
    u16[1] = 6000
    expect(actual.toString('hex')).toEqual('88137017')
  })

  test('should creates a Buffer from ArrayBuffer with byteOffset and length', () => {
    const ab = new ArrayBuffer(10)
    const actual = Buffer.from(ab, 0, 2)
    expect(actual.length).toEqual(2)
  })

  test('should creates a Buffer from ArrayBuffer extend beyond the range of the TypedArray', () => {
    const arrA = Uint8Array.from([0x63, 0x64, 0x65, 0x66])
    const arrB = new Uint8Array(arrA.buffer, 1, 2)
    const actual = Buffer.from(arrB.buffer)
    expect(actual.toString('hex')).toEqual('63646566')
  })

  test('should creates a Buffer from Buffer', () => {
    const buf1 = Buffer.from('buffer')
    const buf2 = Buffer.from(buf1)
    buf1[0] = 0x61
    expect(buf1.toString()).toEqual('auffer')
    expect(buf2.toString()).toEqual('buffer')
  })

  test('should creates a Buffer from String Object', () => {
    const actual = Buffer.from(new String('this is a test')) // eslint-disable-line no-new-wrappers
    expect(actual.toString('hex')).toEqual('7468697320697320612074657374')
  })

  test('should creates a Buffer from objects that support Symbol.toPrimitive', () => {
    class Foo {
      [Symbol.toPrimitive] (): string {
        return 'this is a test'
      }
    }
    const actual = Buffer.from(new Foo(), 'utf8')
    expect(actual.toString('hex')).toEqual('7468697320697320612074657374')
  })

  test('should throw a Error', () => {
    expect.hasAssertions()
    try {
      Buffer.from(1 as any)
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})

describe('Buffer.copyBytesFrom()', () => {
  test('1 arguments', () => {
    const u16 = new Uint16Array([0, 0xffff])
    const actual = Buffer.copyBytesFrom(u16)
    u16[1] = 0
    expect(actual.toString('hex')).toEqual('0000ffff')
  })

  test('2 arguments', () => {
    const u16 = new Uint16Array([0, 0xffff])
    const actual = Buffer.copyBytesFrom(u16, 1)
    u16[1] = 0
    expect(actual.toString('hex')).toEqual('ffff')
  })

  test('3 arguments', () => {
    const u16 = new Uint16Array([0, 0xffff])
    const actual = Buffer.copyBytesFrom(u16, 1, 1)
    u16[1] = 0
    expect(actual.toString('hex')).toEqual('ffff')
  })
})

test.each([
  { inputName: 'Buffer.alloc', input: Buffer.alloc(10), expected: true },
  { inputName: 'Buffer.from', input: Buffer.from('foo'), expected: true },
  { inputName: 'string', input: 'a string', expected: false },
  { inputName: 'array', input: [], expected: false },
  { inputName: 'Uint8Array', input: new Uint8Array(10), expected: false },
])('Buffer.isBuffer($inputName) = $expected', ({ input, expected }) => {
  const actual = Buffer.isBuffer(input)
  expect(actual).toBe(expected)
})

test.each([
  { input: 'utf8', expected: true },
  { input: 'hex', expected: true },
  { input: 'utf/8', expected: false },
  { input: '', expected: false },
])('Buffer.isEncoding($input) = $expected', ({ input, expected }) => {
  const actual = Buffer.isEncoding(input)
  expect(actual).toBe(expected)
})

describe('Buffer.fromView()', () => {
  test('with TypedArray', async () => {
    const view = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)
    const actual = Buffer.fromView(view).toString('hex')
    expect(actual).toEqual('010203')
  })

  test('with DataView', async () => {
    const view = new DataView(new Uint8Array([0, 1, 2, 3, 4]).buffer, 1, 3)
    const actual = Buffer.fromView(view).toString('hex')
    expect(actual).toEqual('010203')
  })
})

describe('Buffer#copy()', () => {
  test('1 arguments', () => {
    const buf1 = Buffer.from('abc')
    const buf2 = Buffer.from('123')

    expect(buf1.copy(buf2)).toEqual(3)
    expect(buf2.toString()).toEqual('abc')
  })

  test('2 arguments', () => {
    const buf1 = Buffer.from('abc')
    const buf2 = Buffer.from('123')

    expect(buf1.copy(buf2, 1)).toEqual(2)
    expect(buf2.toString()).toEqual('1ab')
  })

  test('3 arguments', () => {
    const buf1 = Buffer.from('abc')
    const buf2 = Buffer.from('123')

    expect(buf1.copy(buf2, 1, 1)).toEqual(2)
    expect(buf2.toString()).toEqual('1bc')
  })

  test('should copy bytes from buf1 to buf2', () => {
    const buf1 = Buffer.allocUnsafe(26)
    const buf2 = Buffer.allocUnsafe(26).fill('!')

    // 97 is the decimal ASCII value for 'a'.
    for (let i = 0; i < 26; i++) buf1[i] = i + 97

    buf1.copy(buf2, 8, 16, 20)
    expect(buf2.toString('ascii', 0, 25)).toEqual('!!!!!!!!qrst!!!!!!!!!!!!!')
  })

  test('shoud copy bytes from one region to an overlapping region within the same Buffer', () => {
    const buf = Buffer.allocUnsafe(26)

    // 97 is the decimal ASCII value for 'a'.
    for (let i = 0; i < 26; i++) buf[i] = i + 97

    buf.copy(buf, 0, 4, 10)
    expect(buf.toString()).toEqual('efghijghijklmnopqrstuvwxyz')
  })
})

test('Buffer#entries()', () => {
  const buf = Buffer.from('buffer')
  const actual = []
  for (const pair of buf.entries()) actual.push(pair)
  expect(actual).toEqual([
    [0, 98],
    [1, 117],
    [2, 102],
    [3, 102],
    [4, 101],
    [5, 114],
  ])
})

test('Buffer#keys()', () => {
  const buf = Buffer.from('buffer')
  const actual = []
  for (const key of buf.keys()) actual.push(key)
  expect(actual).toEqual([0, 1, 2, 3, 4, 5])
})

test('Buffer#values()', () => {
  const buf = Buffer.from('buffer')
  const actual = []
  for (const value of buf.values()) actual.push(value)
  expect(actual).toEqual([98, 117, 102, 102, 101, 114])
})

describe('Buffer#fill()', () => {
  test('should fill with the ASCII character "h"', () => {
    const actual = Buffer.allocUnsafe(50).fill('h')
    expect(actual.toString()).toEqual('hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh')
  })

  test('should fill with empty string', () => {
    const actual = Buffer.allocUnsafe(5).fill('')
    expect(actual.toString('hex')).toEqual('0000000000')
  })

  test('should fill with character that takes up two bytes in UTF-8', () => {
    const actual = Buffer.allocUnsafe(5).fill('\u0222')
    expect(actual.toString('hex')).toEqual('c8a2c8a2c8')
  })

  test('should fill with hex string which contains invalid characters', () => {
    const actual = Buffer.allocUnsafe(5)

    actual.fill('a')
    expect(actual.toString('hex')).toEqual('6161616161')

    actual.fill('aazz', 'hex')
    expect(actual.toString('hex')).toEqual('aaaaaaaaaa')

    actual.fill('zz', 'hex')
    expect(actual.toString('hex')).toEqual('0000000000')
  })
})

describe('Buffer#includes()', () => {
  test.each([
    { inputName: 'this', input: 'this', expected: true },
    { inputName: 'is', input: 'is', expected: true },
    { inputName: 'Buffer.from("a buffer")', input: Buffer.from('a buffer'), expected: true },
    { inputName: '97', input: 97, expected: true },
    { inputName: 'Buffer#slice', input: Buffer.from('a buffer example').slice(0, 8), expected: true },
    { inputName: 'Buffer.from("a buffer example")', input: Buffer.from('a buffer example'), expected: false },
    { inputName: '0', input: 0, expected: false },
  ])('Buffer#includes($inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('this is a buffer')
    const actual = buf.includes(input)
    expect(actual).toBe(expected)
  })

  test('should not includes with byteOffset', () => {
    const buf = Buffer.from('this is a buffer')
    const actual = buf.includes('this', 4)
    expect(actual).toBe(false)
  })
})

describe('Buffer#indexOf()', () => {
  test.each([
    { inputName: 'this', input: 'this', expected: 0 },
    { inputName: 'is', input: 'is', expected: 2 },
    { inputName: 'Buffer.from("a buffer")', input: Buffer.from('a buffer'), expected: 8 },
    { inputName: '97', input: 97, expected: 8 },
    { inputName: '0', input: 0, expected: -1 },
    { inputName: 'Buffer#slice', input: Buffer.from('a buffer example').slice(0, 8), expected: 8 },
    { inputName: 'Buffer.from("a buffer example")', input: Buffer.from('a buffer example'), expected: -1 },
  ])('Buffer#indexOf($inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('this is a buffer')
    const actual = buf.indexOf(input)
    expect(actual).toBe(expected)
  })

  test.each([
    { inputName: '99.9', input: 99.9, expected: 2 },
    { inputName: '256 + 99', input: 256 + 99, expected: 2 },
  ])('Buffer#indexOf($inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('abcdef')
    const actual = buf.indexOf(input)
    expect(actual).toBe(expected)
  })

  test.each([
    { inputName: 'undefined', input: undefined, expected: 1 },
    { inputName: '{}', input: {}, expected: 1 },
    { inputName: 'null', input: null, expected: 1 },
    { inputName: '[]', input: [], expected: 1 },
  ])('Buffer#indexOf("b", $inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('abcdef')
    const actual = buf.indexOf('b', input as any)
    expect(actual).toBe(expected)
  })

  test('should be -1 with byteOffset', () => {
    const buf = Buffer.from('this is a buffer')
    const actual = buf.indexOf('this', 4)
    expect(actual).toBe(-1)
  })

  test('should work with encoding argument', () => {
    const buf = Buffer.from('\u039a\u0391\u03a3\u03a3\u0395', 'utf16le')
    expect(buf.indexOf('\u03a3', 0, 'utf16le')).toBe(4)
    expect(buf.indexOf('\u03a3', -4, 'utf16le')).toBe(6)
  })
})

describe('Buffer#lastIndexOf()', () => {
  test.each([
    { inputName: 'this', input: 'this', expected: 0 },
    { inputName: 'buffer', input: 'buffer', expected: 17 },
    { inputName: 'Buffer.from("buffer")', input: Buffer.from('buffer'), expected: 17 },
    { inputName: 'number', input: 97, expected: 15 },
    { inputName: 'Buffer.from("yolo")', input: Buffer.from('yolo'), expected: -1 },
  ])('Buffer#lastIndexOf($inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('this buffer is a buffer')
    const actual = buf.lastIndexOf(input)
    expect(actual).toBe(expected)
  })

  test.each([
    { inputName: '99.9', input: 99.9, expected: 2 },
    { inputName: '256 + 99', input: 256 + 99, expected: 2 },
  ])('Buffer#lastIndexOf($inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('abcdef')
    const actual = buf.lastIndexOf(input)
    expect(actual).toBe(expected)
  })

  test.each([
    { inputName: 'undefined', input: undefined, expected: 1 },
    { inputName: '{}', input: {}, expected: -1 },
    { inputName: 'null', input: null, expected: -1 },
    { inputName: '[]', input: [], expected: -1 },
  ])('Buffer#lastIndexOf("b", $inputName) = $expected', ({ input, expected }) => {
    const buf = Buffer.from('abcdef')
    const actual = buf.lastIndexOf('b', input as any)
    expect(actual).toBe(expected)
  })

  test('should work with byteOffset argument', () => {
    const buf = Buffer.from('this buffer is a buffer')
    expect(buf.lastIndexOf('buffer', 5)).toBe(5)
    expect(buf.lastIndexOf('buffer', 4)).toBe(-1)
  })

  test('should work with encoding argument', () => {
    const buf = Buffer.from('\u039a\u0391\u03a3\u03a3\u0395', 'utf16le')
    expect(buf.lastIndexOf('\u03a3', undefined, 'utf16le')).toBe(6)
    expect(buf.lastIndexOf('\u03a3', -5, 'utf16le')).toBe(4)
  })
})

test.each([
  ['0123456789ABCDEF', '0123456789abcdef'],
  ['0123456789abcdef', '0123456789abcdef'],
  ['01 23 45 67 89 AB CD EF', '0123456789abcdef'],
  ['0 1 2 3 4 5 6 7 8 9 A B C D E F', '0123456789abcdef'],
  ['01\n23\n45\n67\n89\nAB\nCD\nEF', '0123456789abcdef'],
  ['1a7', '1a'],
  ['', ''],
])('Buffer.from(%j, \'hex\').toString(\'hex\') = %j', async (input, expected) => {
  const actual = Buffer.from(input, 'hex').toString('hex')
  expect(actual).toEqual(expected)
})

test.each([
  ['hello world', '68656c6c6f20776f726c64'],
  ['', ''],
])('Buffer.from(%j, \'utf8\').toString(\'hex\') = %j', async (input, expected) => {
  const actual = Buffer.from(input, 'utf8').toString('hex')
  expect(actual).toEqual(expected)
})

test.each([
  ['68656c6c6f20776f726c64', 'hello world'],
  ['', ''],
])('Buffer.from(%j, \'hex\').toString(\'utf8\') = %j', async (input, expected) => {
  const actual = Buffer.from(input, 'hex').toString('utf8')
  expect(actual).toEqual(expected)
})

describe('Buffer.concat()', () => {
  test('return the same Buffer with 1 argument', async () => {
    const actual = Buffer.concat([Buffer.from([0, 1])]).toString('hex')
    expect(actual).toEqual('0001')
  })

  test('return the merged Buffer with 2 argument', async () => {
    const actual = Buffer.concat([Buffer.from([0, 1]), Buffer.from([2, 3])]).toString('hex')
    expect(actual).toEqual('00010203')
  })
})

describe('Buffer#equals()', () => {
  test('return false with invalid type', async () => {
    const actual = Buffer.from([0, 1]).equals('')
    expect(actual).toEqual(false)
  })

  test('return false with different data Buffer', async () => {
    const actual = Buffer.from([0, 1]).equals(Buffer.from([0]))
    expect(actual).toEqual(false)
  })

  test('return false with same length different data Buffer', async () => {
    const actual = Buffer.from([0, 1]).equals(Buffer.from([2, 3]))
    expect(actual).toEqual(false)
  })

  test('return true with same data Buffer', async () => {
    const actual = Buffer.from([0, 1]).equals(Buffer.from([0, 1]))
    expect(actual).toEqual(true)
  })
})

test('Buffer#chunk()', async () => {
  const actual = Buffer.from('00010203', 'hex').chunk(3)
  expect(actual[0].toString('hex')).toEqual('000102')
  expect(actual[1].toString('hex')).toEqual('03')
})

test('Buffer#xor()', async () => {
  const actual = Buffer.from('01020304', 'hex').xor()
  expect(actual).toEqual(0x04)
})

test('Buffer#toString(\'hex\')', async () => {
  const actual = Buffer.from([0, 1, 2])
  expect(actual.toString('hex')).toEqual('000102')
})

test('Buffer#toString(\'ucs2\')', async () => {
  const actual = Buffer.from('610062006300', 'hex')
  expect(actual.toString('ucs2')).toEqual('abc')
})

test('Buffer#toJSON()', async () => {
  const actual = Buffer.from([0, 1, 2])
  expect(actual.toJSON()).toMatchObject({ type: 'Buffer', data: [0, 1, 2] })
})

test.each([
  ['000000', 0],
  ['FFFFFF', 16777215],
  ['7FFFFF', 8388607],
  ['800000', 8388608],
])('Buffer.from(%j, \'hex\').readUIntBE(0, 3) = %j', async (hex, expected) => {
  const actual = Buffer.from(hex, 'hex').readUIntBE(0, 3)
  expect(actual).toEqual(expected)
})

test.each([
  ['000000', 0],
  ['FFFFFF', 16777215],
  ['FFFF7F', 8388607],
  ['000080', 8388608],
])('Buffer.from(%j, \'hex\').readUIntLE(0, 3) = %j', async (hex, expected) => {
  const actual = Buffer.from(hex, 'hex').readUIntLE(0, 3)
  expect(actual).toEqual(expected)
})

test.each([
  ['000000', 0],
  ['FFFFFF', -1],
  ['7FFFFF', 8388607],
  ['800000', -8388608],
])('Buffer.from(%j, \'hex\').readIntBE(0, 3) = %j', async (hex, expected) => {
  const actual = Buffer.from(hex, 'hex').readIntBE(0, 3)
  expect(actual).toEqual(expected)
})

test.each([
  ['000000', 0],
  ['FFFFFF', -1],
  ['FFFF7F', 8388607],
  ['000080', -8388608],
])('Buffer.from(%j, \'hex\').readIntLE(0, 3) = %j', async (hex, expected) => {
  const actual = Buffer.from(hex, 'hex').readIntLE(0, 3)
  expect(actual).toEqual(expected)
})

test.each([
  [0, '000000'],
  [16777215, 'ffffff'],
  [8388607, '7fffff'],
  [8388608, '800000'],
])('Buffer#writeUIntBE(%j, 0, 3), Buffer#toString(\'hex\') = %j', async (num, expected) => {
  const actual = new Buffer(3)
  actual.writeUIntBE(num, 0, 3)
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  [0, '000000'],
  [16777215, 'ffffff'],
  [8388607, 'ffff7f'],
  [8388608, '000080'],
])('Buffer#writeUIntLE(%j, 0, 3), Buffer#toString(\'hex\') = %j', async (num, expected) => {
  const actual = new Buffer(3)
  actual.writeUIntLE(num, 0, 3)
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  [0, '000000'],
  [-1, 'ffffff'],
  [8388607, '7fffff'],
  [-8388608, '800000'],
])('Buffer#writeIntBE(%j, 0, 3), Buffer#toString(\'hex\') = %j', async (num, expected) => {
  const actual = new Buffer(3)
  actual.writeIntBE(num, 0, 3)
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  [0, '000000'],
  [-1, 'ffffff'],
  [8388607, 'ffff7f'],
  [-8388608, '000080'],
])('Buffer#writeIntLE(%j, 0, 3), Buffer#toString(\'hex\') = %j', async (num, expected) => {
  const actual = new Buffer(3)
  actual.writeIntLE(num, 0, 3)
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  ['1', 'MQ'],
  ['12', 'MTI'],
  ['123', 'MTIz'],
])('Packet.from(%j, \'utf8\').toString(\'base64url\') = %j', async (str, expected) => {
  const actual = Buffer.from(str, 'utf8').toString('base64url')
  expect(actual).toEqual(expected)
})

test.each([
  ['-_-_', '-_-_'],
  ['+/+/', '-_-_'],
  ['MQ==', 'MQ'],
  ['MTI', 'MTI'],
  ['MTIz', 'MTIz'],
  ['SGVs/G8+d29ybGQ', 'SGVs_G8-d29ybGQ'],
])('Buffer.from(%j, \'base64\').toString(\'base64url\') = %j', async (str, expected) => {
  const actual = Buffer.from(str, 'base64').toString('base64url')
  expect(actual).toEqual(expected)
})

test.each([
  ['-_-_', '+/+/'],
  ['+/+/', '+/+/'],
  ['MQ', 'MQ=='],
  ['MTI', 'MTI='],
  ['MTIz', 'MTIz'],
  ['SGVs_G8-d29ybGQ', 'SGVs/G8+d29ybGQ='],
])('Buffer.from(%j, \'base64url\').toString(\'base64\') = %j', async (str, expected) => {
  const actual = Buffer.from(str, 'base64url').toString('base64')
  expect(actual).toEqual(expected)
})

test.each([
  { str1: 'ABC', str2: 'AB', expected: 1 },
  { str1: 'ABC', str2: 'ABC', expected: 0 },
  { str1: 'ABC', str2: 'ABCD', expected: -1 },
  { str1: 'ABC', str2: 'BCD', expected: -1 },
  { str1: 'BCD', str2: 'ABC', expected: 1 },
  { str1: 'BCD', str2: 'ABCD', expected: 1 },
])('Buffer.compare("$str1", "$str2") = $expected', async ({ str1, str2, expected }) => {
  const buf1 = Buffer.from(str1)
  const buf2 = Buffer.from(str2)
  expect(Buffer.compare(buf1, buf2)).toEqual(expected)
  expect(buf1.compare(buf2)).toEqual(expected)
})

test.each([
  { str: '', expected: false },
  { str: 'hex', expected: true },
  { str: 'utf/8', expected: false },
  { str: 'utf8', expected: true },
])('Buffer.isEncoding("$str") = $expected', async ({ str, expected }) => {
  const actual = Buffer.isEncoding(str)
  expect(actual).toEqual(expected)
})

test.each([
  ['12', 8],
  ['1234', 16],
  ['123456', 24],
  ['12345678', 32],
  ['FF', 8],
  ['FFFF', 16],
  ['FFFFFF', 24],
])('Buffer.from(%j, \'hex\').readBitMSB(offset)', async (hex, bits) => {
  const buf = Buffer.from(hex, 'hex')
  const actual = _.times(bits, i => `${buf.readBitMSB(i)}`).join('')
  expect(actual).toEqual(BigInt(`0x${hex}`).toString(2).padStart(bits, '0'))
})

test.each([
  ['12', 8],
  ['1234', 16],
  ['123456', 24],
  ['12345678', 32],
  ['FF', 8],
  ['FFFF', 16],
  ['FFFFFF', 24],
])('Buffer.from(%j, \'hex\').readBitLSB(offset)', async (hex, bits) => {
  const buf = Buffer.from(hex, 'hex')
  const actual = _.times(bits, i => `${buf.readBitLSB(i)}`).reverse().join('')
  expect(actual).toEqual(BigInt(`0x${hex}`).toString(2).padStart(bits, '0'))
})

describe('Buffer#swap16()', () => {
  test('should be swapped', () => {
    const buf1 = Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8])
    expect(buf1.swap16().toString('hex')).toEqual('0201040306050807')
  })

  test('should throw error', () => {
    expect.hasAssertions()
    try {
      Buffer.from([0x1, 0x2, 0x3]).swap16()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })

  test('should conversion between UTF-16 little-endian and UTF-16 big-endian', () => {
    const buf = Buffer.from('12345', 'utf16le')
    buf.swap16()
    expect(buf.toString('hex')).toEqual('00310032003300340035')
  })
})

describe('Buffer#swap32()', () => {
  test('should be swapped', () => {
    const buf1 = Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8])
    expect(buf1.swap32().toString('hex')).toEqual('0403020108070605')
  })

  test('should throw error', () => {
    expect.hasAssertions()
    try {
      Buffer.from([0x1, 0x2, 0x3]).swap32()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})

describe('Buffer#swap64()', () => {
  test('should be swapped', () => {
    const buf1 = Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8])
    expect(buf1.swap64().toString('hex')).toEqual('0807060504030201')
  })

  test('should throw error', () => {
    expect.hasAssertions()
    try {
      Buffer.from([0x1, 0x2, 0x3]).swap64()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})

describe('Buffer#write()', () => {
  test('should write string', () => {
    const actual = Buffer.alloc(256)
    actual.write('\u00bd + \u00bc = \u00be', 0)
    expect(actual.toString('utf8', 0, 12)).toBe('½ + ¼ = ¾')
  })

  test('should not write string exceed the end of buffer', () => {
    const actual = Buffer.alloc(10)
    actual.write('abcd', 8)
    expect(actual.toString('utf8', 8, 10)).toBe('ab')
  })
})

test.each([
  { str: 'abc123', encoding: 'ascii', len: 6 },
  { str: 'abc123', encoding: 'utf16le', len: 12 },
  { str: 'abc123', encoding: 'hex', len: 3 },
  { str: 'abc123', encoding: 'base64url', len: 4 },
  { str: '\u00bd + \u00bc = \u00be', encoding: 'utf8', len: 12 },
])('Buffer.byteLength("$str", "$encoding") = $len', ({ str, encoding, len }) => {
  expect(Buffer.byteLength(str, encoding as any)).toBe(len)
})

test('read/write BigInt64', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeBigInt64BE(1n).readBigInt64BE()).toBe(1n)
  expect(buf.writeBigInt64LE(1n).readBigInt64LE()).toBe(1n)
  expect(buf.writeBigInt64BE(1n, 1).readBigInt64BE(1)).toBe(1n)
  expect(buf.writeBigInt64LE(1n, 1).readBigInt64LE(1)).toBe(1n)
})

test('read/write BigUInt64', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeBigUInt64BE(1n).readBigUInt64BE()).toBe(1n)
  expect(buf.writeBigUInt64LE(1n).readBigUInt64LE()).toBe(1n)
  expect(buf.writeBigUInt64BE(1n, 1).readBigUInt64BE(1)).toBe(1n)
  expect(buf.writeBigUInt64LE(1n, 1).readBigUInt64LE(1)).toBe(1n)
})

test('read/write Double', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeDoubleBE(0.5).readDoubleBE()).toBe(0.5)
  expect(buf.writeDoubleLE(0.5).readDoubleLE()).toBe(0.5)
  expect(buf.writeDoubleBE(0.5, 1).readDoubleBE(1)).toBe(0.5)
  expect(buf.writeDoubleLE(0.5, 1).readDoubleLE(1)).toBe(0.5)
})

test('read/write Float', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeFloatBE(0.5).readFloatBE()).toBe(0.5)
  expect(buf.writeFloatLE(0.5).readFloatLE()).toBe(0.5)
  expect(buf.writeFloatBE(0.5, 1).readFloatBE(1)).toBe(0.5)
  expect(buf.writeFloatLE(0.5, 1).readFloatLE(1)).toBe(0.5)
})

test('read/write Int8', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeInt8(1).readInt8()).toBe(1)
  expect(buf.writeInt8(1, 1).readInt8(1)).toBe(1)
})

test('read/write UInt8', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeUInt8(1).readUInt8()).toBe(1)
  expect(buf.writeUInt8(1, 1).readUInt8(1)).toBe(1)
})

test('read/write Int16', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeInt16BE(0x0102).readInt16BE()).toBe(0x0102)
  expect(buf.writeInt16LE(0x0102).readInt16LE()).toBe(0x0102)
  expect(buf.writeInt16BE(0x0102, 1).readInt16BE(1)).toBe(0x0102)
  expect(buf.writeInt16LE(0x0102, 1).readInt16LE(1)).toBe(0x0102)
})

test('read/write UInt16', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeUInt16BE(0x0102).readUInt16BE()).toBe(0x0102)
  expect(buf.writeUInt16LE(0x0102).readUInt16LE()).toBe(0x0102)
  expect(buf.writeUInt16BE(0x0102, 1).readUInt16BE(1)).toBe(0x0102)
  expect(buf.writeUInt16LE(0x0102, 1).readUInt16LE(1)).toBe(0x0102)
})

test('read/write Int32', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeInt32BE(0x01020304).readInt32BE()).toBe(0x01020304)
  expect(buf.writeInt32LE(0x01020304).readInt32LE()).toBe(0x01020304)
  expect(buf.writeInt32BE(0x01020304, 1).readInt32BE(1)).toBe(0x01020304)
  expect(buf.writeInt32LE(0x01020304, 1).readInt32LE(1)).toBe(0x01020304)
})

test('read/write UInt32', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeUInt32BE(0x01020304).readUInt32BE()).toBe(0x01020304)
  expect(buf.writeUInt32LE(0x01020304).readUInt32LE()).toBe(0x01020304)
  expect(buf.writeUInt32BE(0x01020304, 1).readUInt32BE(1)).toBe(0x01020304)
  expect(buf.writeUInt32LE(0x01020304, 1).readUInt32LE(1)).toBe(0x01020304)
})

describe('read/write Int', () => {
  test.each([
    { byteLength: 1, value: 0x01 },
    { byteLength: 2, value: 0x0102 },
    { byteLength: 3, value: 0x010203 },
    { byteLength: 4, value: 0x01020304 },
    { byteLength: 5, value: 0x0102030405 },
    { byteLength: 6, value: 0x010203040506 },
  ])('read/write $byteLength bytes Int', ({ byteLength, value }) => {
    const buf = Buffer.alloc(10)
    expect(buf.writeIntBE(value, 0, byteLength).readIntBE(0, byteLength)).toBe(value)
    expect(buf.writeIntLE(value, 0, byteLength).readIntLE(0, byteLength)).toBe(value)
    expect(buf.writeIntBE(value, 1, byteLength).readIntBE(1, byteLength)).toBe(value)
    expect(buf.writeIntLE(value, 1, byteLength).readIntLE(1, byteLength)).toBe(value)
  })

  test.each([0, 7])('should throw error with byteLength = %j', byteLength => {
    expect.hasAssertions()
    try {
      Buffer.alloc(10).writeIntBE(0, 0, byteLength)
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})

describe('read/write UInt', () => {
  test.each([
    { byteLength: 1, value: 0x01 },
    { byteLength: 2, value: 0x0102 },
    { byteLength: 3, value: 0x010203 },
    { byteLength: 4, value: 0x01020304 },
    { byteLength: 5, value: 0x0102030405 },
    { byteLength: 6, value: 0x010203040506 },
  ])('read/write $byteLength bytes UInt', ({ byteLength, value }) => {
    const buf = Buffer.alloc(10)
    expect(buf.writeUIntBE(value, 0, byteLength).readUIntBE(0, byteLength)).toBe(value)
    expect(buf.writeUIntLE(value, 0, byteLength).readUIntLE(0, byteLength)).toBe(value)
    expect(buf.writeUIntBE(value, 1, byteLength).readUIntBE(1, byteLength)).toBe(value)
    expect(buf.writeUIntLE(value, 1, byteLength).readUIntLE(1, byteLength)).toBe(value)
  })

  test.each([0, 7])('should throw error with byteLength = %j', byteLength => {
    expect.hasAssertions()
    try {
      Buffer.alloc(10).writeUIntBE(0, 0, byteLength)
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})

test('read/write bit', () => {
  const buf = Buffer.alloc(10)
  expect(buf.writeBitMSB(1, 0).readBitMSB(0)).toBe(1)
  expect(buf.writeBitLSB(1, 0).readBitLSB(0)).toBe(1)
  expect(buf.writeBitMSB(1, 1).readBitMSB(1)).toBe(1)
  expect(buf.writeBitLSB(1, 1).readBitLSB(1)).toBe(1)
})

describe('Buffer#subarray()', () => {
  test('1 arguments', () => {
    const buf = Buffer.from('buffer')
    const actual = buf.subarray(1)
    expect(actual.toString()).toEqual('uffer')
  })

  test('should be modified while modify buf1', () => {
    const buf1 = Buffer.allocUnsafe(26)
    for (let i = 0; i < 26; i++) buf1[i] = i + 97 // 97 is the decimal ASCII value for 'a'
    const buf2 = buf1.subarray(0, 3)
    expect(buf2.toString()).toEqual('abc')
    buf1[0] = 33
    expect(buf2.toString()).toEqual('!bc')
  })

  test('negative indexes', () => {
    const buf = Buffer.from('buffer')
    expect(buf.subarray(-6, -1).toString()).toBe('buffe')
    expect(buf.subarray(-6, -2).toString()).toBe('buff')
    expect(buf.subarray(-5, -2).toString()).toBe('uff')
  })
})

test('Buffer#reverse()', () => {
  const buf1 = Buffer.from('123')
  const buf2 = buf1.reverse()
  expect(buf1.toString()).toEqual('123')
  expect(buf2.toString()).toEqual('321')
})
