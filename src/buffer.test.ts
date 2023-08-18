import { Buffer } from './buffer'

describe('Buffer.fromArrayBufferView()', () => {
  test('with TypedArray', async () => {
    const view = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)
    const actual = Buffer.fromArrayBufferView(view).toString('hex')
    expect(actual).toEqual('010203')
  })

  test('with DataView', async () => {
    const view = new DataView(new Uint8Array([0, 1, 2, 3, 4]).buffer, 1, 3)
    const actual = Buffer.fromArrayBufferView(view).toString('hex')
    expect(actual).toEqual('010203')
  })
})

test.each([
  ['0123456789ABCDEF', '0123456789abcdef'],
  ['0123456789abcdef', '0123456789abcdef'],
  ['01 23 45 67 89 AB CD EF', '0123456789abcdef'],
  ['0 1 2 3 4 5 6 7 8 9 A B C D E F', '0123456789abcdef'],
  ['01\n23\n45\n67\n89\nAB\nCD\nEF', '0123456789abcdef'],
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
