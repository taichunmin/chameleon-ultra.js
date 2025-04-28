import { Buffer } from '@taichunmin/buffer'
import _ from 'lodash'
import Crypto1 from './Crypto1'

test('#reset()', async () => {
  const crypto = new Crypto1()
  crypto.setLfsr(Buffer.from('FFFFFFFFFFFF', 'hex').readUIntBE(0, 6))
  crypto.reset()
  expect(crypto.odd).toEqual(0)
  expect(crypto.even).toEqual(0)
})

test.each([
  { key: 'ffffffffffff', odd: 0xFFFFFF, even: 0xFFFFFF },
  { key: 'aaaaaaaaaaaa', odd: 0xFFFFFF, even: 0 },
  { key: '555555555555', odd: 0, even: 0xFFFFFF },
])('#setLfsr(Buffer.from($key, \'hex\')) = { odd: $odd, even: $even }', async ({ key, odd, even }) => {
  const crypto = new Crypto1()
  crypto.setLfsr(Buffer.from(key, 'hex').readUIntBE(0, 6))
  expect(crypto.odd).toEqual(odd)
  expect(crypto.even).toEqual(even)
})

test.each([
  { key: 'ffffffffffff' },
  { key: '000000000000' },
  { key: '123456789012' },
  { key: '112233445566' },
  { key: 'abcdefabcdef' },
])('#setLfsr(Buffer.from($key, \'hex\'))#getLfsr() = $key', async ({ key }) => {
  const crypto1 = new Crypto1()
  crypto1.setLfsr(Buffer.from(key, 'hex').readUIntBE(0, 6))
  expect(crypto1.getLfsr()).toEqual(_.parseInt(key, 16))
})

test.each([
  { input: -1, expected: 0xFFFFFFFF },
  { input: 0x00000001 << 8, expected: 0x00000100 },
  { input: 0x12345678 << 4, expected: 0x23456780 },
  { input: 0x80000000 << 1, expected: 0x0 },
])('.toUint32($input) = $expected', async ({ input, expected }) => {
  const actual = Crypto1.toUint32(input)
  expect(actual).toEqual(expected)
})

test.each([
  { input: -1, expected: 0xFF },
  { input: 0x1 << 8, expected: 0x0 },
  { input: 0xFF, expected: 0xFF },
])('.toUint8($input) = $expected', async ({ input, expected }) => {
  const actual = Crypto1.toUint8(input)
  expect(actual).toEqual(expected)
})

test.each([
  { input: -1, expected: 1 },
  { input: 0, expected: 0 },
  { input: 1, expected: 1 },
  { input: 2, expected: 0 },
])('.toBit($input) = $expected', async ({ input, expected }) => {
  const actual = Crypto1.toBit(input)
  expect(actual).toEqual(expected)
})

test.each([
  { input: -1, expected: 1 },
  { input: 0, expected: 0 },
  { input: 1, expected: 1 },
  { input: 2, expected: 1 },
])('.toBool($input) = $expected', async ({ input, expected }) => {
  const actual = Crypto1.toBool(input)
  expect(actual).toEqual(expected)
})

test.each([
  { x: -1, n: 0, expected: 1 },
  // 0xA5 = 0b10100101
  { x: 0xA5, n: 0, expected: 1 },
  { x: 0xA5, n: 1, expected: 0 },
  { x: 0xA5, n: 2, expected: 1 },
  { x: 0xA5, n: 3, expected: 0 },
  { x: 0xA5, n: 4, expected: 0 },
  { x: 0xA5, n: 5, expected: 1 },
  { x: 0xA5, n: 6, expected: 0 },
  { x: 0xA5, n: 7, expected: 1 },
])('.bit($x, $n) = $expected', async ({ x, n, expected }) => {
  const actual = Crypto1.bit(x, n)
  expect(actual).toEqual(expected)
})

test.each([
  { x: -1, n: 0, expected: 1 },
  // 0xA5 = 0b10100101
  { x: 0xA5, n: 0, expected: 0 },
  { x: 0xA5, n: 1, expected: 0 },
  { x: 0xA5, n: 2, expected: 0 },
  { x: 0xA5, n: 3, expected: 0 },
  { x: 0xA5, n: 4, expected: 0 },
  { x: 0xA5, n: 5, expected: 0 },
  { x: 0xA5, n: 6, expected: 0 },
  { x: 0xA5, n: 7, expected: 0 },
])('.beBit($x, $n) = $expected', async ({ x, n, expected }) => {
  const actual = Crypto1.beBit(x, n)
  expect(actual).toEqual(expected)
})

test.each([
  { x: -1, expected: 0 },
  { x: 0, expected: 0 },
  { x: 1, expected: 1 },
  { x: 0x87, expected: 0 },
])('.evenParity8($x) = $expected', async ({ x, expected }) => {
  const actual = Crypto1.evenParity8(x)
  expect(actual).toEqual(expected)
})

test.each([
  { x: -1, expected: 0 },
  { x: 0, expected: 0 },
  { x: 1, expected: 1 },
  { x: 87654321, expected: 1 },
])('.evenParity32($x) = $expected', async ({ x, expected }) => {
  const actual = Crypto1.evenParity32(x)
  expect(actual).toEqual(expected)
})

test.each([
  { x: 0x12345678, expected: 0x78563412 },
  { x: -1, expected: 0xFFFFFFFF },
  { x: 0x100000000, expected: 0x0 },
])('.swapEndian($x) = $expected', async ({ x, expected }) => {
  const actual = Crypto1.swapEndian(x)
  expect(actual).toEqual(expected)
})

test.each([
  { nt: 'CB7B9ED9', expected: 'CE110A87' },
  { nt: '1E6D9228', expected: 'DC74D694' },
])('.prngSuccessor(0x$nt, 64) = 0x$expected', async ({ nt, expected }) => {
  const actual = Crypto1.prngSuccessor(_.parseInt(nt, 16), 64)
  expect(`0000000${actual.toString(16).toUpperCase()}`.slice(-8)).toEqual(expected)
})

test.each([
  { even: 3921859194, odd: 3552613021, input: 0, isEncrypted: 0, expected: { even: 10883010, odd: 4791744 } },
  { even: 10883010, odd: 4791744, input: 0x5A8FFEC6, isEncrypted: 1, expected: { even: 12006054, odd: 9214537 } },
  { even: 12006054, odd: 9214537, input: 0x65535D33 ^ 0xCB7B9ED9, isEncrypted: 0, expected: { even: 10131127, odd: 3091084 } },
])('new Crypto1({ even: $even, odd: $odd }).lfsrRollbackWord($input, $isEncrypted)', async ({ even, odd, input, isEncrypted, expected }) => {
  const state = new Crypto1()
  ;[state.even, state.odd] = [even, odd]
  state.lfsrRollbackWord(input, isEncrypted)
  expect(_.pick(state, ['even', 'odd'])).toEqual(expected)
})

test.each([
  { even: 10131127, odd: 3091084, expected: '61bb6136535e' },
])('new Crypto1({ even: $even, odd: $odd }).getLfsr() = "$expected"', async ({ even, odd, expected }) => {
  const state = new Crypto1()
  ;[state.even, state.odd] = [even, odd]
  const actual = state.getLfsr()
  expect(actual).toEqual(_.parseInt(expected, 16))
})

test.each([
  {
    uid: '65535d33',
    nt0: 'cb7b9ed9',
    nr0: '5a8ffec6',
    ar0: '5c7c6f89',
    nt1: '1e6d9228',
    nr1: '6fb8b4a8',
    ar1: 'ef4039fb',
    expected: 'a9ac67832330',
  },
])('.mfkey32v2()', async ({ uid, nt0, nr0, ar0, nt1, nr1, ar1, expected }) => {
  const actual = Crypto1.mfkey32v2({ uid, nt0, nr0, ar0, nt1, nr1, ar1 })
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  {
    uid: '65535d33',
    nt: '2c198be4',
    nr: 'fedac6d2',
    ar: 'cf0a3c7e',
    at: 'f4a81af8',
    expected: 'a9ac67832330',
  },
])('.mfkey64()', async ({ uid, nt, nr, ar, at, expected }) => {
  const actual = Crypto1.mfkey64({ uid, nt, nr, ar, at })
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  {
    uid: '65535d33',
    nt: '2c198be4',
    nr: 'fedac6d2',
    key: 'a9ac67832330',
    data: 'fb07ea8f31c89b3b36f54da1e9784e85eb8f530c391f9383191c',
    expected: '30084a2446000000b9ffffff4600000000ff00ffa601500057cd',
  },
  {
    uid: '65535d33',
    nt: 'f73e638f',
    nr: '4f4f867a',
    key: 'a9ac67832330',
    data: 'b334670f0686e45aa7d74b69d3b47cadb68013f52a92535b2888',
    expected: '30084a2446000000b9ffffff4600000000ff00ffa601500057cd',
  },
  { uid: 'de7752ac', nt: 'a95a83fd', nr: '47ed9eb7', key: '000000000000', data: 'b8500c47', expected: 'a8009f7f' },
  { uid: 'f235061b', nt: '39264142', nr: 'b8f4a737', key: '000000000000', data: 'b2af219b', expected: 'a83c7084' },
])('.decrypt()', async ({ uid, nt, nr, key, data, expected }) => {
  const actual = Crypto1.decrypt({
    data: Buffer.from(data, 'hex'),
    key: Buffer.from(key, 'hex'),
    nr: Buffer.from(nr, 'hex'),
    nt: Buffer.from(nt, 'hex'),
    uid: Buffer.from(uid, 'hex'),
  })
  expect(actual.toString('hex')).toEqual(expected)
})

test.each([
  {
    expected: 'ffffffffffff',
    isKeyB: false,
    atks: [{ nt1: '01200145', nt2: '81901975' }, { nt1: '01200145', nt2: 'cdd400f3' }],
    uid: 'b908a16d',
  },
  {
    expected: 'ffffffffffff',
    isKeyB: false,
    atks: [{ nt1: '009080a2', nt2: '40d0d735' }, { nt1: '009080a2', nt2: '664a1da0' }],
    uid: '03bb67a0',
  },
])('.staticnested()', async ({ uid, atks, isKeyB, expected }) => {
  const keys = Crypto1.staticnested({ uid, atks, keyType: isKeyB ? 97 : 96 })
  expect(_.map(keys, key => key.toString('hex'))).toContain(expected)
})

test.each([
  {
    dist: '00000080',
    expected: 'ffffffffffff',
    uid: '877209e1',
    atks: [
      { nt1: 0xB4A08A09, nt2: 0x8A15BBF2, par: 5 },
      { nt1: 0x1613293D, nt2: 0x912E6760, par: 7 },
    ],
  },
])('.nested()', async ({ uid, atks, dist, expected }) => {
  const keys = Crypto1.nested({ uid, atks, dist })
  expect(_.map(keys, key => key.toString('hex'))).toContain(expected)
})

test.each([
  {
    expected: 'ffffffffffff',
    acquires: [
      { uid: 'd3efed0c', nt: 'b346fc3d', ks: '0c0508080f04050a', par: '0000000000000000', nr: '00000000', ar: '00000000' },
      { uid: 'd3efed0c', nt: 'a932c381', ks: '060907020c0b0e00', par: '0000000000000000', nr: '00000000', ar: '00000000' },
    ],
  },
])('.darkside()', async opts => {
  const fnAcquire = jest.fn().mockRejectedValue(new Error('No record can be acqured'))
  for (const acquired of opts.acquires) fnAcquire.mockResolvedValueOnce(_.mapValues(acquired, Buffer.fromHexString))
  const expected = Buffer.from(opts.expected, 'hex')
  const fnCheckKey = async (key: Buffer): Promise<boolean> => { return key.equals(expected) }
  const actual = await Crypto1.darkside(fnAcquire, fnCheckKey)
  expect(actual.toString('hex')).toEqual(opts.expected)
})

test.each([
  { uid: '65535D33', key: '974C262B9278', nt: 'BE2B7B5D', nrEnc: 'B1E1B891', arEnc: '2CF7A248' },
  { uid: '65535D33', key: 'A9AC67832330', nt: '2C198BE4', nrEnc: 'FEDAC6D2', arEnc: 'CF0A3C7E' },
  { uid: '65535D33', key: 'A9AC67832330', nt: 'F73E638F', nrEnc: '4F4F867A', arEnc: '18CCB40B' },
] as const)('.mfkey32IsReaderHasKey()', async ({ uid, key, nt, nrEnc, arEnc }) => {
  const actual = Crypto1.mfkey32IsReaderHasKey({ uid, nt, nr: nrEnc, ar: arEnc, key: Buffer.from(key, 'hex') })
  expect(actual).toEqual(true)
})
