import _ from 'lodash'
import { createIsEnum } from './helper'
import { type Class } from 'utility-types'

const BASE64_CHAR = _.transform('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split(''), (m, v, k) => {
  m.set(k, v).set(v, k)
}, new Map()).set('-', 62).set('_', 63)

const BASE64URL_CHAR = _.transform('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split(''), (m, v, k) => {
  m.set(k, v).set(v, k)
}, new Map()).set('+', 62).set('/', 63)

const HEX_CHAR = _.transform('0123456789abcdef'.split(''), (m, v, k) => {
  m.set(k, v).set(v, k).set(_.toUpper(v), k)
}, new Map())

const K_MAX_LENGTH = 0x7FFFFFFF
const SIGNED_MAX_VALUE = [0, 0x7F, 0x7FFF, 0x7FFFFF, 0x7FFFFFFF, 0x7FFFFFFFFF, 0x7FFFFFFFFFFF]
const SIGNED_OFFSET = [0, 0x100, 0x10000, 0x1000000, 0x100000000, 0x10000000000, 0x1000000000000]

function isInstance<T> (obj: any, type: Class<T>): obj is T {
  return obj instanceof type || obj?.constructor?.name === type?.name
}

function isSharedArrayBuffer (val: any): val is SharedArrayBuffer {
  return typeof SharedArrayBuffer !== 'undefined' && (isInstance(val, SharedArrayBuffer) || isInstance(val?.buffer, SharedArrayBuffer))
}

function floatU32ToU16 (u32: number): number {
  // Float32: 1 + 8 + 23, bits = 1 xxxxxxxx 11111111110000000000000
  //                  0x7FFFFF = 0 00000000 11111111111111111111111
  // Float16: 1 + 5 + 10, bits = 1    xxxxx 1111111111
  //                    0x0200 = 0    00000 1000000000
  //                    0x03FF = 0    00000 1111111111
  //                    0x7C00 = 0    11111 0000000000
  //                    0x8000 = 1    00000 0000000000
  const exp = (u32 >>> 23) & 0xFF
  if (exp === 0xFF) return ((u32 >>> 16) & 0x8000) + 0x7C00 + ((u32 & 0x7FFFFF) !== 0 ? 0x200 : 0) // +-inf / NaN
  if (exp === 0) return ((u32 >>> 16) & 0x8000) + ((u32 >>> 13) & 0x3FF)
  return ((u32 >>> 16) & 0x8000) + (((exp - 112) << 10) & 0x7C00) + ((u32 >>> 13) & 0x3FF)
}

function floatU16ToU32 (u16: number): number {
  // Float32: 1 + 8 + 23, bits = 1 xxxxxxxx 11111111110000000000000
  //                0x00400000 = 0 00000000 10000000000000000000000
  //                0x007FE000 = 0 00000000 11111111110000000000000
  //                0x7F800000 = 0 11111111 00000000000000000000000
  //                0x80000000 = 1 00000000 00000000000000000000000
  // Float16: 1 + 5 + 10, bits = 1    xxxxx 1111111111
  //                    0x03FF = 0    00000 1111111111
  const exp = (u16 >>> 10) & 0x1F
  if (exp === 0x1F) return ((u16 << 16) & 0x80000000) + 0x7F800000 + ((u16 & 0x3FF) !== 0 ? 0x400000 : 0) // +-inf / NaN
  if (exp === 0) return ((u16 << 16) & 0x80000000) + ((u16 << 13) & 0x7FE000)
  return ((u16 << 16) & 0x80000000) + (((exp + 112) << 23) & 0x7F800000) + ((u16 << 13) & 0x7FE000)
}

const float16Buf = new DataView(new ArrayBuffer(4))

/**
 * @enum
 */
const EncodingConst = {
  'ucs-2': 'ucs-2',
  'utf-16le': 'utf-16le',
  'utf-8': 'utf-8',
  ascii: 'ascii',
  base64: 'base64',
  base64url: 'base64url',
  binary: 'binary',
  hex: 'hex',
  latin1: 'latin1',
  ucs2: 'ucs2',
  utf16le: 'utf16le',
  utf8: 'utf8',
} as const

export type Encoding = keyof typeof EncodingConst

const isEncoding = createIsEnum(EncodingConst)

const isNativeLittleEndian = new Uint8Array(new Uint16Array([0x1234]).buffer)[0] === 0x12

/**
 * @see [Format Characters](https://docs.python.org/3/library/struct.html#format-characters)
 */
const packFromFns = new Map<string, (ctx: PackFromContext) => void>([
  ['x', packFromPad],
  ['c', packFromChar],
  ['b', packFromInt8],
  ['B', packFromInt8],
  ['?', packFromBool],
  ['h', packFromInt16],
  ['H', packFromInt16],
  ['i', packFromInt32],
  ['I', packFromInt32],
  ['l', packFromInt32],
  ['L', packFromInt32],
  ['q', packFromBigInt64],
  ['Q', packFromBigInt64],
  ['e', packFromFloat16],
  ['f', packFromFloat],
  ['d', packFromDouble],
  ['s', packFromString],
  ['p', packFromPascal],
])

/**
 * @see [Format Characters](https://docs.python.org/3/library/struct.html#format-characters)
 */
const unpackToFns = new Map<string, (ctx: PackFromContext) => void>([
  ['x', unpackToPad],
  ['c', unpackToChar],
  ['b', unpackToInt8],
  ['B', unpackToInt8],
  ['?', unpackToBool],
  ['h', unpackToInt16],
  ['H', unpackToInt16],
  ['i', unpackToInt32],
  ['I', unpackToInt32],
  ['l', unpackToInt32],
  ['L', unpackToInt32],
  ['q', unpackToBigInt64],
  ['Q', unpackToBigInt64],
  ['e', unpackToFloat16],
  ['f', unpackToFloat],
  ['d', unpackToDouble],
  ['s', unpackToString],
  ['p', unpackToPascal],
])

export class Buffer extends Uint8Array {
  protected readonly dv: DataView

  constructor ()
  constructor (length: number)
  constructor (arrayLike: ArrayLike<number>)
  constructor (arrayBuffer: ArrayBufferLike, byteOffset?: number, length?: number)

  constructor (val?: any, offset?: any, length?: any) {
    if (_.isNil(val)) super()
    else if (_.isNil(offset)) super(val)
    else if (_.isNil(length)) super(val, offset)
    else super(val, offset, length)
    this.dv = new DataView(this.buffer, this.byteOffset, this.byteLength)
  }

  static alloc (size: number, fill: string, encoding?: Encoding): Buffer
  static alloc (size: number, fill?: Buffer | Uint8Array | number): Buffer

  static alloc (size: number, fill?: any, encoding: Encoding = 'utf8'): Buffer {
    if (!_.isSafeInteger(size) || size >= K_MAX_LENGTH) throw new RangeError(`Invalid size: ${size}`)
    const buf = new Buffer(size)
    if (_.isNil(fill)) return buf
    return _.isNil(encoding) ? buf.fill(fill) : buf.fill(fill, encoding)
  }

  static allocUnsafe (size: number): Buffer {
    return new Buffer(size)
  }

  static allocUnsafeSlow (size: number): Buffer {
    return new Buffer(size)
  }

  static byteLength (string: ArrayBufferView | ArrayBufferLike): number
  static byteLength (string: string, encoding?: Encoding): number

  static byteLength (string: any, encoding: Encoding = 'utf8'): number {
    if (Buffer.isBuffer(string) || isInstance(string, ArrayBuffer) || isSharedArrayBuffer(string) || ArrayBuffer.isView(string)) return string.byteLength
    if (!_.isString(string)) throw new TypeError(`Invalid type of string: ${typeof string}`)

    if (_.includes(['ascii', 'latin1', 'binary'], encoding)) return string.length
    if (_.includes(['ucs2', 'ucs-2', 'utf16le', 'utf-16le'], encoding)) return string.length * 2
    if (encoding === 'hex') return string.length >>> 1
    if (_.includes(['base64', 'base64url'], encoding)) return (string.replace(/[^A-Za-z0-9/_+-]/g, '').length * 3) >>> 2
    return new TextEncoder().encode(string).length // default utf8
  }

  static compare (buf1: any, buf2: any): number {
    if (!Buffer.isBuffer(buf1) && !isInstance(buf1, Uint8Array)) throw new TypeError('Invalid type of buf1')
    if (!Buffer.isBuffer(buf2) && !isInstance(buf2, Uint8Array)) throw new TypeError('Invalid type of buf2')
    const len = Math.max(buf1.length, buf2.length)
    for (let i = 0; i < len; i++) {
      if (i >= buf1.length) return -1
      if (i >= buf2.length) return 1
      if (buf1[i] !== buf2[i]) return buf1[i] < buf2[i] ? -1 : 1
    }
    return 0
  }

  static equals (buf1: any, buf2: any): boolean {
    if (!Buffer.isBuffer(buf1) || !Buffer.isBuffer(buf2)) return false
    if (buf1.length !== buf2.length) return false
    for (let i = 0; i < buf1.length; i++) if (buf1[i] !== buf2[i]) return false
    return true
  }

  static concat (list: Buffer[], totalLength?: number): Buffer {
    if (_.isNil(totalLength)) totalLength = _.sumBy(list, 'length')
    if (totalLength < 0) totalLength = 0
    const buf = new Buffer(totalLength)
    let start = 0
    for (let i = 0; i < list.length; i++) {
      if (start + list[i].length > totalLength) list[i] = list[i].subarray(0, totalLength - start)
      buf.set(list[i], start)
      start += list[i].length
    }
    return buf
  }

  static fromView (view: ArrayBufferView, offset?: number, length?: number): Buffer
  static fromView (view: any, offset: number = 0, length?: number): Buffer {
    if (!ArrayBuffer.isView(view)) throw new TypeError('invalid view')
    const bytesPerElement = (view as any)?.BYTES_PER_ELEMENT ?? 1
    const viewLength = view.byteLength / bytesPerElement
    if (_.isNil(length)) length = viewLength - offset
    return new Buffer(view.buffer, view.byteOffset + offset * bytesPerElement, length * bytesPerElement)
  }

  static copyBytesFrom (view: ArrayBufferView, offset: number = 0, length?: number): Buffer {
    return new Buffer(Buffer.fromView(view, offset, length))
  }

  static from (data: WithImplicitCoercion<Uint8Array | Buffer | ArrayLike<number> | Iterable<number>>): Buffer
  static from (arrayBuffer: WithImplicitCoercion<ArrayBufferLike>, byteOffset?: number, length?: number): Buffer
  static from (object: WithImplicitCoercion<string> | { [Symbol.toPrimitive]: (hint: 'string') => string }, encoding?: Encoding): Buffer

  static from (val: any, encodingOrOffset?: any, length?: number): Buffer {
    const valueOfObj = val?.[Symbol.toPrimitive]?.('string') ?? val?.valueOf?.()
    if (!_.isNil(valueOfObj) && valueOfObj !== val) val = valueOfObj

    if (Buffer.isBuffer(val)) return new Buffer(val)
    if (ArrayBuffer.isView(val)) return Buffer.fromView(val as ArrayBufferView)
    if (isInstance(val, ArrayBuffer) || isSharedArrayBuffer(val)) return new Buffer(val, encodingOrOffset, length)
    if (_.isString(val)) return Buffer.fromString(val, encodingOrOffset)
    if (_.isArray(val)) return Buffer.fromArray(val)
    if (typeof val[Symbol.iterator] === 'function') return Buffer.fromArray([...val])

    throw new TypeError(`Invalid type of value: ${typeof val}`)
  }

  static fromString (str: string, encoding: Encoding = 'utf8'): Buffer {
    encoding = _.toLower(encoding) as Encoding
    if (!Buffer.isEncoding(encoding)) throw new TypeError(`Unknown encoding: ${encoding as string}`)
    const fromStringFns = {
      'ucs-2': Buffer.fromUcs2String,
      'utf-16le': Buffer.fromUcs2String,
      'utf-8': Buffer.fromUtf8String,
      ascii: Buffer.fromAsciiString,
      base64: Buffer.fromBase64String,
      base64url: Buffer.fromBase64urlString,
      binary: Buffer.fromAsciiString,
      hex: Buffer.fromHexString,
      latin1: Buffer.fromAsciiString,
      ucs2: Buffer.fromUcs2String,
      utf16le: Buffer.fromUcs2String,
      utf8: Buffer.fromUtf8String,
    }
    return fromStringFns[encoding](str)
  }

  static fromUcs2String (this: void, ucs2: string): Buffer {
    const buf = new Buffer(ucs2.length * 2)
    for (let i = 0; i < ucs2.length; i++) buf.writeUInt16LE(ucs2.charCodeAt(i), i * 2)
    return buf
  }

  static fromUtf8String (this: void, utf8: string): Buffer {
    return Buffer.fromView(new TextEncoder().encode(utf8))
  }

  static fromAsciiString (this: void, ascii: string): Buffer {
    const buf = new Buffer(ascii.length)
    for (let i = 0; i < ascii.length; i++) buf[i] = ascii.charCodeAt(i) & 0xFF
    return buf
  }

  static fromBase64String (this: void, base64: string): Buffer {
    base64 = base64.replace(/[^A-Za-z0-9/_+-]/g, '')
    const tmp1 = base64.length
    const tmp2 = base64.length + 3
    base64 = `${base64}AAA`.slice(0, tmp2 - tmp2 % 4)
    const buf = new Buffer(base64.length * 3 >>> 2)
    let parsedLen = 0
    for (let i = 0; i < base64.length; i += 4) {
      const u24 = (BASE64_CHAR.get(base64[i]) << 18) +
        (BASE64_CHAR.get(base64[i + 1]) << 12) +
        (BASE64_CHAR.get(base64[i + 2]) << 6) +
        BASE64_CHAR.get(base64[i + 3])
      buf[parsedLen++] = (u24 >>> 16) & 0xFF
      buf[parsedLen++] = (u24 >>> 8) & 0xFF
      buf[parsedLen++] = (u24 >>> 0) & 0xFF
    }
    return tmp1 < base64.length ? buf.subarray(0, tmp1 - base64.length) : buf
  }

  static fromBase64urlString (this: void, base64: string): Buffer {
    base64 = base64.replace(/[^A-Za-z0-9/_+-]/g, '')
    const tmp1 = base64.length
    const tmp2 = base64.length + 3
    base64 = `${base64}AAA`.slice(0, tmp2 - tmp2 % 4)
    const buf = new Buffer(base64.length * 3 >>> 2)
    let parsedLen = 0
    for (let i = 0; i < base64.length; i += 4) {
      const u24 = (BASE64URL_CHAR.get(base64[i]) << 18) +
        (BASE64URL_CHAR.get(base64[i + 1]) << 12) +
        (BASE64URL_CHAR.get(base64[i + 2]) << 6) +
        BASE64URL_CHAR.get(base64[i + 3])
      buf[parsedLen++] = (u24 >>> 16) & 0xFF
      buf[parsedLen++] = (u24 >>> 8) & 0xFF
      buf[parsedLen++] = (u24 >>> 0) & 0xFF
    }
    return tmp1 < base64.length ? buf.subarray(0, tmp1 - base64.length) : buf
  }

  static fromHexString (this: void, hex: string): Buffer {
    hex = hex.replace(/[^0-9A-Fa-f]/g, '')
    const buf = new Buffer(hex.length >>> 1)
    for (let i = 0; i < buf.length; i++) buf[i] = HEX_CHAR.get(hex[i * 2]) << 4 | HEX_CHAR.get(hex[i * 2 + 1])
    return buf
  }

  static fromArray (arr: ArrayLike<any>): Buffer {
    if (!_.isArray(arr)) throw new TypeError('arr must be an array')
    const buf = new Buffer(arr.length)
    for (let i = 0; i < buf.length; i++) buf[i] = _.toSafeInteger(arr[i]) & 0xFF
    return buf
  }

  static isBuffer (obj: any): obj is Buffer {
    return isInstance(obj, Buffer)
  }

  static isEncoding (encoding: any): encoding is Encoding {
    return isEncoding(encoding)
  }

  static packParseFormat (format: string): PackFormat {
    if (!_.isString(format)) throw new TypeError('Invalid type of format')
    const matched = /^([@=<>!]?)((?:\d*[xcbB?hHiIlLqQefdsp])+)$/.exec(format)
    if (_.isNil(matched)) throw new TypeError(`Invalid format: ${format}`)
    const littleEndian = _.includes(['', '@', '='], matched[1]) ? isNativeLittleEndian : (matched[1] === '<')
    return {
      littleEndian,
      items: _.map([...matched[2].matchAll(/\d*[xcbB?hHiIlLqQefdsp]/g)], ([s]) => {
        const type = s[s.length - 1]
        const repeat = s.length > 1 ? _.parseInt(s.slice(0, -1)) : 1
        return [(type === 'p' && repeat > 255) ? 255 : repeat, type]
      }),
    }
  }

  static packCalcSize (format: string): number
  static packCalcSize (items: PackFormat['items']): number

  static packCalcSize (formatOrItems: string | PackFormat['items']): number {
    if (_.isString(formatOrItems)) formatOrItems = Buffer.packParseFormat(formatOrItems)?.items
    return _.sumBy(formatOrItems, item => {
      const [repeat, type] = item
      if ('hHe'.includes(type)) return repeat * 2
      if ('iIlLf'.includes(type)) return repeat * 4
      if ('qQd'.includes(type)) return repeat * 8
      return repeat // xcbB?sp
    })
  }

  /**
   * Return a bytes object containing the values packed according to the format string format. The arguments must match the values required by the format exactly.
   */
  static pack (format: string, ...vals: any[]): Buffer
  static pack (buf: Buffer, format: string, ...vals: any[]): Buffer

  static pack (buf: any, format: any, ...vals: any[]): Buffer {
    if (_.isString(buf)) { // shift arguments
      vals.unshift(format)
      ;[buf, format] = [undefined, buf]
    }

    const { littleEndian, items } = Buffer.packParseFormat(format)
    const lenRequired = Buffer.packCalcSize(items)
    if (_.isNil(buf)) buf = new Buffer(lenRequired)
    if (!Buffer.isBuffer(buf)) throw new TypeError('Invalid type of buf')
    if (buf.length < lenRequired) throw new RangeError(`buf.length = ${buf.length}, lenRequired = ${lenRequired}`)

    const ctx = { buf, littleEndian, offset: 0, vals }
    for (const [repeat, type] of items) {
      const packFromFn = packFromFns.get(type)
      if (_.isNil(packFromFn)) throw new Error(`Unknown format: ${repeat}${type}`)
      packFromFn(_.merge(ctx, { repeat, type }))
    }

    return buf
  }

  static unpack <T extends any[]> (buf: Buffer, format: string): T {
    const { littleEndian, items } = Buffer.packParseFormat(format)
    const lenRequired = Buffer.packCalcSize(items)
    if (!Buffer.isBuffer(buf)) throw new TypeError('Invalid type of buf')
    if (buf.length < lenRequired) throw new RangeError(`buf.length = ${buf.length}, lenRequired = ${lenRequired}`)

    const ctx = { buf, littleEndian, offset: 0, vals: [] }
    for (const [repeat, type] of items) {
      const unpackToFn = unpackToFns.get(type)
      if (_.isNil(unpackToFn)) throw new Error(`Unknown format: ${repeat}${type}`)
      unpackToFn(_.merge(ctx, { repeat, type }))
    }

    return ctx.vals as unknown as T
  }

  compare (target: any, targetStart: number = 0, targetEnd: number = target.length, sourceStart: number = 0, sourceEnd: number = this.length): number {
    if (!Buffer.isBuffer(target) && !isInstance(target, Uint8Array)) throw new TypeError('Invalid type of target')
    return Buffer.compare(this.subarray(sourceStart, sourceEnd), target.subarray(targetStart, targetEnd))
  }

  copy (target: Buffer, targetStart: number = 0, sourceStart: number = 0, sourceEnd: number = this.length): number {
    let buf = this.subarray(sourceStart, sourceEnd)
    if (buf.length > target.length - targetStart) buf = buf.subarray(0, target.length - targetStart)
    target.set(buf, targetStart)
    return buf.length
  }

  equals (other: any): boolean {
    return Buffer.equals(this, other)
  }

  fill (val: string, encoding?: Encoding): this
  fill (val: string, offset?: number, encoding?: Encoding): this
  fill (val: string, offset?: number, end?: number, encoding?: Encoding): this
  fill (val: Buffer, offset?: number, end?: number): this
  fill (val: Uint8Array, offset?: number, end?: number): this
  fill (val: number, offset?: number, end?: number): this
  fill (val: string | Buffer | Uint8Array | number, offset?: number | Encoding, end?: number | Encoding, encoding?: Encoding): this

  fill (val: any, offset: any = 0, end: any = this.length, encoding: Encoding = 'utf8'): this {
    if (Buffer.isEncoding(offset)) [offset, encoding] = [0, offset]
    if (Buffer.isEncoding(end)) [end, encoding] = [this.length, end]
    if (!_.isSafeInteger(offset) || !_.isSafeInteger(end)) throw new RangeError('Invalid type of offset or end')

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (isInstance(val, Uint8Array)) val = Buffer.fromView(val)

    if (Buffer.isBuffer(val) && val.length < 2) val = val.length > 0 ? val[0] : 0 // try to convert Buffer to number
    if (_.isNumber(val)) {
      val = _.toSafeInteger(val) & 0xFF
      for (let i = offset; i < end; i++) this[i] = val
      return this
    }
    let tmp = 0
    for (let i = offset; i < end; i++) {
      this[i] = val[tmp++]
      if (tmp >= val.length) tmp = 0
    }
    return this
  }

  includes (val: string, encoding?: Encoding): boolean
  includes (val: string, offset?: number, encoding?: Encoding): boolean
  includes (val: Buffer, offset?: number): boolean
  includes (val: Uint8Array, offset?: number): boolean
  includes (val: number, offset?: number): boolean
  includes (val: string | Buffer | Uint8Array | number, offset?: number | Encoding, encoding?: Encoding): boolean

  includes (val: any, offset: any = 0, encoding: Encoding = 'utf8'): boolean {
    if (Buffer.isEncoding(offset)) [offset, encoding] = [0, offset]
    offset = _.toSafeInteger(offset)
    if (offset < 0) offset = this.length + offset

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (isInstance(val, Uint8Array)) val = Buffer.fromView(val)

    if (Buffer.isBuffer(val)) { // try to convert Buffer to number
      if (val.length === 0) return false
      else if (val.length === 1) val = val[0]
    }
    if (_.isNumber(val)) {
      val = _.toSafeInteger(val) & 0xFF
      for (let i = offset; i < this.length; i++) if (this[i] === val) return true
      return false
    }
    const equalsAtOffset = (i: number): boolean => {
      for (let j = 0; j < (val as Buffer).length; j++) if (this[i + j] !== (val as Buffer)[j]) return false
      return true
    }
    const len = this.length - val.length + 1
    for (let i = offset; i < len; i++) if (equalsAtOffset(i)) return true
    return false
  }

  indexOf (val: string, encoding?: Encoding): number
  indexOf (val: string, offset?: number, encoding?: Encoding): number
  indexOf (val: Buffer, offset?: number): number
  indexOf (val: Uint8Array, offset?: number): number
  indexOf (val: number, offset?: number): number
  indexOf (val: string | Buffer | Uint8Array | number, offset?: number | Encoding, encoding?: Encoding): number

  indexOf (val: any, offset: any = 0, encoding: Encoding = 'utf8'): number {
    if (Buffer.isEncoding(offset)) [offset, encoding] = [0, offset]
    offset = _.toSafeInteger(offset)
    if (offset < 0) offset = this.length + offset

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (isInstance(val, Uint8Array)) val = Buffer.fromView(val)

    if (Buffer.isBuffer(val)) { // try to convert Buffer which length < 2 to number
      if (val.length === 0) return -1
      else if (val.length === 1) val = val[0]
    }
    if (_.isNumber(val)) {
      val = _.toSafeInteger(val) & 0xFF
      for (let i = offset; i < this.length; i++) if (this[i] === val) return i
      return -1
    }
    const equalsAtOffset = (i: number): boolean => {
      for (let j = 0; j < (val as Buffer).length; j++) if (this[i + j] !== (val as Buffer)[j]) return false
      return true
    }
    const len = this.length - val.length + 1
    for (let i = offset; i < len; i++) if (equalsAtOffset(i)) return i
    return -1
  }

  lastIndexOf (val: string, encoding?: Encoding): number
  lastIndexOf (val: string, offset?: number, encoding?: Encoding): number
  lastIndexOf (val: Buffer, offset?: number): number
  lastIndexOf (val: Uint8Array, offset?: number): number
  lastIndexOf (val: number, offset?: number): number
  lastIndexOf (val: string | Buffer | Uint8Array | number, offset?: number | Encoding, encoding?: Encoding): number

  lastIndexOf (val: any, offset: any = this.length - 1, encoding: Encoding = 'utf8'): number {
    if (Buffer.isEncoding(offset)) [offset, encoding] = [this.length - 1, offset]
    offset = _.toSafeInteger(offset)
    if (offset < 0) offset = this.length + offset

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (isInstance(val, Uint8Array)) val = Buffer.fromView(val)

    if (Buffer.isBuffer(val)) { // try to convert Buffer to number
      if (val.length === 0) return -1
      else if (val.length === 1) val = val[0]
    }
    if (_.isNumber(val)) {
      val = _.toSafeInteger(val) & 0xFF
      for (let i = Math.min(offset, this.length - 1); i >= 0; i--) if (this[i] === val) return i
      return -1
    }
    const equalsAtOffset = (i: number): boolean => {
      for (let j = 0; j < (val as Buffer).length; j++) if (this[i + j] !== (val as Buffer)[j]) return false
      return true
    }
    for (let i = Math.min(offset, this.length - val.length); i >= 0; i--) if (equalsAtOffset(i)) return i
    return -1
  }

  readBigInt64BE (offset: number = 0): bigint {
    return this.dv.getBigInt64(offset)
  }

  readBigInt64LE (offset: number = 0): bigint {
    return this.dv.getBigInt64(offset, true)
  }

  readBigUInt64BE (offset: number = 0): bigint {
    return this.dv.getBigUint64(offset)
  }

  readBigUInt64LE (offset: number = 0): bigint {
    return this.dv.getBigUint64(offset, true)
  }

  readDoubleBE (offset: number = 0): number {
    return this.dv.getFloat64(offset)
  }

  readDoubleLE (offset: number = 0): number {
    return this.dv.getFloat64(offset, true)
  }

  readFloatBE (offset: number = 0): number {
    return this.dv.getFloat32(offset)
  }

  readFloatLE (offset: number = 0): number {
    return this.dv.getFloat32(offset, true)
  }

  readFloat16BE (offset: number = 0): number {
    const u32 = floatU16ToU32(this.readUInt16BE(offset))
    float16Buf.setUint32(0, u32)
    return float16Buf.getFloat32(0)
  }

  readFloat16LE (offset: number = 0): number {
    const u32 = floatU16ToU32(this.readUInt16LE(offset))
    float16Buf.setUint32(0, u32)
    return float16Buf.getFloat32(0)
  }

  readInt8 (offset: number = 0): number {
    return this.dv.getInt8(offset)
  }

  readInt16BE (offset: number = 0): number {
    return this.dv.getInt16(offset)
  }

  readInt16LE (offset: number = 0): number {
    return this.dv.getInt16(offset, true)
  }

  readInt32BE (offset: number = 0): number {
    return this.dv.getInt32(offset)
  }

  readInt32LE (offset: number = 0): number {
    return this.dv.getInt32(offset, true)
  }

  readIntBE (offset: number = 0, byteLength: number = 6): number {
    const tmp = this.readUIntBE(offset, byteLength)
    return tmp > SIGNED_MAX_VALUE[byteLength] ? tmp - SIGNED_OFFSET[byteLength] : tmp
  }

  readIntLE (offset: number = 0, byteLength: number = 6): number {
    const tmp = this.readUIntLE(offset, byteLength)
    return tmp > SIGNED_MAX_VALUE[byteLength] ? tmp - SIGNED_OFFSET[byteLength] : tmp
  }

  readUInt8 (offset: number = 0): number {
    return this.dv.getUint8(offset)
  }

  readUInt16BE (offset: number = 0): number {
    return this.dv.getUint16(offset)
  }

  readUInt16LE (offset: number = 0): number {
    return this.dv.getUint16(offset, true)
  }

  readUInt32BE (offset: number = 0): number {
    return this.dv.getUint32(offset)
  }

  readUInt32LE (offset: number = 0): number {
    return this.dv.getUint32(offset, true)
  }

  readUIntBE (offset: number = 0, byteLength: number = 6): number {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (offset + byteLength > this.length) throw new RangeError(`Invalid offset: ${offset}`)
    let tmp = 0
    for (let i = 0; i < byteLength; i++) tmp = tmp * 0x100 + this[offset + i]
    return tmp
  }

  readUIntLE (offset: number = 0, byteLength: number = 6): number {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (offset + byteLength > this.length) throw new RangeError(`Invalid offset: ${offset}`)
    let tmp = 0
    for (let i = byteLength - 1; i >= 0; i--) tmp = tmp * 0x100 + this[offset + i]
    return tmp
  }

  readBitMSB (bitOffset: number): number {
    const tmp = [bitOffset >>> 3, (bitOffset & 7) ^ 7]
    return (this[tmp[0]] >>> tmp[1]) & 1
  }

  readBitLSB (bitOffset: number): number {
    const tmp = [this.length - (bitOffset >>> 3) - 1, bitOffset & 7]
    return (this[tmp[0]] >>> tmp[1]) & 1
  }

  subarray (start: number = 0, end: number = this.length): Buffer {
    const buf = super.subarray(start, end)
    return new Buffer(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  slice (start: number = 0, end: number = this.length): Buffer {
    return new Buffer(super.slice(start, end).buffer)
  }

  reverse (): Buffer {
    const buf = new Buffer(this.length)
    for (let i = buf.length - 1; i >= 0; i--) buf[i] = this[this.length - i - 1]
    return buf
  }

  swap16 (): this {
    if ((this.length & 0x1) > 0) throw new RangeError('Buffer size must be a multiple of 16-bits')
    for (let i = 0; i < this.length; i += 2) this.writeUInt16LE(this.readUInt16BE(i), i)
    return this
  }

  swap32 (): this {
    if ((this.length & 0x3) > 0) throw new RangeError('Buffer size must be a multiple of 32-bits')
    for (let i = 0; i < this.length; i += 4) this.writeUInt32LE(this.readUInt32BE(i), i)
    return this
  }

  swap64 (): this {
    if ((this.length & 0x7) > 0) throw new RangeError('Buffer size must be a multiple of 64-bits')
    for (let i = 0; i < this.length; i += 8) this.writeBigUInt64LE(this.readBigUInt64BE(i), i)
    return this
  }

  toJSON (): { type: 'Buffer', data: number[] } {
    return { type: 'Buffer', data: [...this] }
  }

  toString (encoding: Encoding = 'utf8', start: number = 0, end: number = this.length): string {
    encoding = _.toLower(encoding) as Encoding
    if (!Buffer.isEncoding(encoding)) throw new TypeError(`Unknown encoding: ${encoding as string}`)
    const toStringFns = {
      'ucs-2': Buffer.toUcs2String,
      'utf-16le': Buffer.toUcs2String,
      'utf-8': Buffer.toUtf8String,
      ascii: Buffer.toAsciiString,
      base64: Buffer.toBase64String,
      base64url: Buffer.toBase64urlString,
      binary: Buffer.toAsciiString,
      hex: Buffer.toHexString,
      latin1: Buffer.toAsciiString,
      ucs2: Buffer.toUcs2String,
      utf16le: Buffer.toUcs2String,
      utf8: Buffer.toUtf8String,
    }
    return toStringFns[encoding](this.subarray(start, end))
  }

  static toUcs2String (this: void, buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i += 2) arr.push(String.fromCharCode(buf.readUInt16LE(i)))
    return arr.join('')
  }

  static toUtf8String (this: void, buf: Buffer): string {
    return new TextDecoder().decode(buf)
  }

  static toAsciiString (this: void, buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i++) arr.push(String.fromCharCode(buf[i]))
    return arr.join('')
  }

  static toBase64String (this: void, buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i += 3) {
      const u24 = (buf[i] << 16) +
        ((i + 1 < buf.length ? buf[i + 1] : 0) << 8) +
        (i + 2 < buf.length ? buf[i + 2] : 0)
      arr.push(...[
        BASE64_CHAR.get(u24 >>> 18 & 0x3F),
        BASE64_CHAR.get(u24 >>> 12 & 0x3F),
        BASE64_CHAR.get(u24 >>> 6 & 0x3F),
        BASE64_CHAR.get(u24 >>> 0 & 0x3F),
      ])
    }
    const tmp = arr.length + (buf.length + 2) % 3 - 2
    for (let i = tmp; i < arr.length; i++) arr[i] = '='
    return arr.join('')
  }

  static toBase64urlString (this: void, buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i += 3) {
      const u24 = (buf[i] << 16) +
        ((i + 1 < buf.length ? buf[i + 1] : 0) << 8) +
        (i + 2 < buf.length ? buf[i + 2] : 0)
      arr.push(...[
        BASE64URL_CHAR.get(u24 >>> 18 & 0x3F),
        BASE64URL_CHAR.get(u24 >>> 12 & 0x3F),
        BASE64URL_CHAR.get(u24 >>> 6 & 0x3F),
        BASE64URL_CHAR.get(u24 >>> 0 & 0x3F),
      ])
    }
    const tmp = (buf.length + 2) % 3 - 2
    return (tmp !== 0 ? arr.slice(0, tmp) : arr).join('')
  }

  static toHexString (this: void, buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i++) arr.push(HEX_CHAR.get(buf[i] >>> 4), HEX_CHAR.get(buf[i] & 0xF))
    return arr.join('')
  }

  write (val: string, encoding?: Encoding): number
  write (val: string, offset?: number, encoding?: Encoding): number
  write (val: string, offset?: number, end?: number, encoding?: Encoding): number

  write (val: any, offset: any = 0, length: any = this.length - offset, encoding: any = 'utf8'): number {
    if (_.isString(offset)) [offset, length, encoding] = [0, this.length, offset]
    else if (_.isString(length)) [length, encoding] = [this.length - offset, length]

    if (!_.isString(val)) throw new TypeError('Invalid type of val')
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid type of offset')
    if (!_.isSafeInteger(length)) throw new TypeError('Invalid type of length')
    if (!Buffer.isEncoding(encoding)) throw new TypeError(`Unknown encoding: ${encoding as string}`)

    const buf = Buffer.fromString(val, encoding)
    length = Math.min(buf.length, length, this.length - offset)
    this.set(buf.subarray(0, length), offset)
    return length
  }

  writeBigInt64BE (val: bigint, offset: number = 0): this {
    this.dv.setBigInt64(offset, val)
    return this
  }

  writeBigInt64LE (val: bigint, offset: number = 0): this {
    this.dv.setBigInt64(offset, val, true)
    return this
  }

  writeBigUInt64BE (val: bigint, offset: number = 0): this {
    this.dv.setBigUint64(offset, val)
    return this
  }

  writeBigUInt64LE (val: bigint, offset: number = 0): this {
    this.dv.setBigUint64(offset, val, true)
    return this
  }

  writeDoubleBE (val: number, offset: number = 0): this {
    this.dv.setFloat64(offset, val)
    return this
  }

  writeDoubleLE (val: number, offset: number = 0): this {
    this.dv.setFloat64(offset, val, true)
    return this
  }

  writeFloatBE (val: number, offset: number = 0): this {
    this.dv.setFloat32(offset, val)
    return this
  }

  writeFloatLE (val: number, offset: number = 0): this {
    this.dv.setFloat32(offset, val, true)
    return this
  }

  writeFloat16BE (val: number, offset: number = 0): this {
    float16Buf.setFloat32(0, val)
    const u32 = float16Buf.getUint32(0)
    return this.writeUInt16BE(floatU32ToU16(u32), offset)
  }

  writeFloat16LE (val: number, offset: number = 0): this {
    float16Buf.setFloat32(0, val)
    const u32 = float16Buf.getUint32(0)
    return this.writeUInt16LE(floatU32ToU16(u32), offset)
  }

  writeInt8 (val: number, offset: number = 0): this {
    this.dv.setInt8(offset, val)
    return this
  }

  writeInt16BE (val: number, offset: number = 0): this {
    this.dv.setInt16(offset, val)
    return this
  }

  writeInt16LE (val: number, offset: number = 0): this {
    this.dv.setInt16(offset, val, true)
    return this
  }

  writeInt32BE (val: number, offset: number = 0): this {
    this.dv.setInt32(offset, val)
    return this
  }

  writeInt32LE (val: number, offset: number = 0): this {
    this.dv.setInt32(offset, val, true)
    return this
  }

  writeIntBE (val: number, offset: number = 0, byteLength: number = 6): this {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (val < 0) val += SIGNED_OFFSET[byteLength]
    this.writeUIntBE(val, offset, byteLength)
    return this
  }

  writeIntLE (val: number, offset: number = 0, byteLength: number = 6): this {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (val < 0) val += SIGNED_OFFSET[byteLength]
    this.writeUIntLE(val, offset, byteLength)
    return this
  }

  writeUInt8 (val: number, offset: number = 0): this {
    this.dv.setUint8(offset, val)
    return this
  }

  writeUInt16BE (val: number, offset: number = 0): this {
    this.dv.setUint16(offset, val)
    return this
  }

  writeUInt16LE (val: number, offset: number = 0): this {
    this.dv.setUint16(offset, val, true)
    return this
  }

  writeUInt32BE (val: number, offset: number = 0): this {
    this.dv.setUint32(offset, val)
    return this
  }

  writeUInt32LE (val: number, offset: number = 0): this {
    this.dv.setUint32(offset, val, true)
    return this
  }

  writeUIntBE (val: number, offset: number = 0, byteLength: number = 6): this {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (offset + byteLength > this.length) throw new RangeError(`Invalid offset: ${offset}`)
    for (let i = byteLength - 1; i >= 0; i--) {
      this[offset + i] = val & 0xFF
      val /= 0x100
    }
    return this
  }

  writeUIntLE (val: number, offset: number = 0, byteLength: number = 6): this {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (offset + byteLength > this.length) throw new RangeError(`Invalid offset: ${offset}`)
    for (let i = 0; i < byteLength; i++) {
      this[offset + i] = val & 0xFF
      val /= 0x100
    }
    return this
  }

  writeBitMSB (val: number | boolean, bitOffset: number): this {
    const tmp = [bitOffset >>> 3, (bitOffset & 7) ^ 7]
    if (Boolean(val)) this[tmp[0]] |= 1 << tmp[1]
    else this[tmp[0]] &= ~(1 << tmp[1])
    return this
  }

  writeBitLSB (val: number | boolean, bitOffset: number): this {
    const tmp = [this.length - (bitOffset >>> 3) - 1, bitOffset & 7]
    if (Boolean(val)) this[tmp[0]] |= 1 << tmp[1]
    else this[tmp[0]] &= ~(1 << tmp[1])
    return this
  }

  chunk (bytesPerChunk: number): Buffer[] {
    if (bytesPerChunk < 1) throw new TypeError('invalid bytesPerChunk')
    const chunks = []
    for (let i = 0; i < this.length; i += bytesPerChunk) chunks.push(this.subarray(i, i + bytesPerChunk))
    return chunks
  }

  xor (): number {
    return _.reduce(this, (xor, v) => xor ^ v, 0)
  }

  pack (format: string, ...vals: any[]): this {
    Buffer.pack(this, format, ...vals)
    return this
  }

  unpack <T extends any[]> (format: string): T {
    return Buffer.unpack<T>(this, format)
  }
}

interface PackFromContext {
  buf: Buffer
  littleEndian: boolean
  offset: number
  repeat: number
  type: string
  vals: any[]
}

function packFromPad (ctx: PackFromContext): void {
  const { buf, repeat } = ctx
  for (let i = 0; i < repeat; i++) buf[ctx.offset] = 0
  ctx.offset += repeat
}

function unpackToPad (ctx: PackFromContext): void {
  const { repeat } = ctx
  ctx.offset += repeat
}

function packFromChar (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[ctx.offset] = Buffer.from(vals.shift())?.[0] ?? 0
    ctx.offset += 1
  }
}

function unpackToChar (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  for (let i = 0; i < repeat; i++) {
    vals.push(buf.subarray(ctx.offset, ctx.offset + 1))
    ctx.offset += 1
  }
}

function packFromInt8 (ctx: PackFromContext): void {
  const { buf, repeat, type, vals } = ctx
  const fnName = type === 'b' ? 'writeInt8' : 'writeUInt8'
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](_.toSafeInteger(vals.shift()), ctx.offset)
    ctx.offset += 1
  }
}

function unpackToInt8 (ctx: PackFromContext): void {
  const { buf, repeat, type, vals } = ctx
  const fnName = type === 'b' ? 'readInt8' : 'readUInt8'
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 1
  }
}

function packFromBool (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf.writeUInt8(Boolean(vals.shift()) ? 1 : 0, ctx.offset)
    ctx.offset += 1
  }
}

function unpackToBool (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  for (let i = 0; i < repeat; i++) {
    vals.push(buf.readUInt8(ctx.offset) !== 0)
    ctx.offset += 1
  }
}

function packFromInt16 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, type, vals } = ctx
  const fnName = (['writeUInt16BE', 'writeUInt16LE', 'writeInt16BE', 'writeInt16LE'] as const)[(type === 'h' ? 2 : 0) + (littleEndian ? 1 : 0)]
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](_.toSafeInteger(vals.shift()), ctx.offset)
    ctx.offset += 2
  }
}

function unpackToInt16 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, type, vals } = ctx
  const fnName = (['readUInt16BE', 'readUInt16LE', 'readInt16BE', 'readInt16LE'] as const)[(type === 'h' ? 2 : 0) + (littleEndian ? 1 : 0)]
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 2
  }
}

function packFromInt32 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, type, vals } = ctx
  const fnName = (['writeUInt32BE', 'writeUInt32LE', 'writeInt32BE', 'writeInt32LE'] as const)[('il'.includes(type) ? 2 : 0) + (littleEndian ? 1 : 0)]
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](_.toSafeInteger(vals.shift()), ctx.offset)
    ctx.offset += 4
  }
}

function unpackToInt32 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, type, vals } = ctx
  const fnName = (['readUInt32BE', 'readUInt32LE', 'readInt32BE', 'readInt32LE'] as const)[('il'.includes(type) ? 2 : 0) + (littleEndian ? 1 : 0)]
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 4
  }
}

function packFromBigInt64 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, type, vals } = ctx
  const fnName = (['writeBigUInt64BE', 'writeBigUInt64LE', 'writeBigInt64BE', 'writeBigInt64LE'] as const)[(type === 'q' ? 2 : 0) + (littleEndian ? 1 : 0)]
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](BigInt(vals.shift()), ctx.offset)
    ctx.offset += 8
  }
}

function unpackToBigInt64 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, type, vals } = ctx
  const fnName = (['readBigUInt64BE', 'readBigUInt64LE', 'readBigInt64BE', 'readBigInt64LE'] as const)[(type === 'q' ? 2 : 0) + (littleEndian ? 1 : 0)]
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 8
  }
}

function packFromFloat16 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, vals } = ctx
  const fnName = littleEndian ? 'writeFloat16LE' : 'writeFloat16BE'
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](vals.shift(), ctx.offset)
    ctx.offset += 2
  }
}

function unpackToFloat16 (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, vals } = ctx
  const fnName = littleEndian ? 'readFloat16LE' : 'readFloat16BE'
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 2
  }
}

function packFromFloat (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, vals } = ctx
  const fnName = littleEndian ? 'writeFloatLE' : 'writeFloatBE'
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](vals.shift(), ctx.offset)
    ctx.offset += 4
  }
}

function unpackToFloat (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, vals } = ctx
  const fnName = littleEndian ? 'readFloatLE' : 'readFloatBE'
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 4
  }
}

function packFromDouble (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, vals } = ctx
  const fnName = littleEndian ? 'writeDoubleLE' : 'writeDoubleBE'
  for (let i = 0; i < repeat; i++) {
    if (vals.length === 0) throw new TypeError('Not enough vals')
    buf[fnName](vals.shift(), ctx.offset)
    ctx.offset += 8
  }
}

function unpackToDouble (ctx: PackFromContext): void {
  const { buf, littleEndian, repeat, vals } = ctx
  const fnName = littleEndian ? 'readDoubleLE' : 'readDoubleBE'
  for (let i = 0; i < repeat; i++) {
    vals.push(buf[fnName](ctx.offset))
    ctx.offset += 8
  }
}

function packFromString (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  if (vals.length === 0) throw new TypeError('Not enough vals')
  const val = vals.shift()
  const buf1 = new Buffer(repeat)
  Buffer.from(val).copy(buf1, 0, 0, repeat) // padded with null bytes
  buf1.copy(buf, ctx.offset)
  ctx.offset += buf1.length
}

function unpackToString (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  vals.push(buf.subarray(ctx.offset, ctx.offset + repeat))
  ctx.offset += repeat
}

function packFromPascal (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  if (vals.length === 0) throw new TypeError('Not enough vals')
  const val = vals.shift()
  const buf1 = new Buffer(repeat)
  buf1[0] = Buffer.from(val).copy(buf1, 1, 0, repeat - 1) // padded with null bytes
  buf1.copy(buf, ctx.offset)
  ctx.offset += buf1.length
}

function unpackToPascal (ctx: PackFromContext): void {
  const { buf, repeat, vals } = ctx
  const len = Math.min(buf[ctx.offset], repeat - 1)
  vals.push(buf.subarray(ctx.offset + 1, ctx.offset + 1 + len))
  ctx.offset += repeat
}

type ArrayBufferView = NodeJS.ArrayBufferView | Buffer

interface ArrayLike<T> {
  readonly length: number
  readonly [n: number]: T
}

type WithImplicitCoercion<T> = T | { valueOf: () => T }

interface PackFormat {
  littleEndian: boolean
  items: Array<[number, string]>
}
