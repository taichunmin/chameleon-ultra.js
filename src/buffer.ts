import _ from 'lodash'

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
if (typeof SharedArrayBuffer === 'undefined') (globalThis as any).SharedArrayBuffer = ArrayBuffer

export class Buffer extends Uint8Array {
  static readonly poolSize = 8192
  dv: DataView

  constructor ()
  constructor (arrayLike: ArrayLike<number>)
  constructor (length: number)
  constructor (object: BufferFromObjectArg)
  constructor (typedArray: TypedArray)
  constructor (buffer: ArrayBuffer, byteOffset?: number, length?: number)

  constructor (val?: any, offset?: any, length?: any) {
    if (_.isNil(val)) super()
    else if (_.isNil(offset)) super(val)
    else if (_.isNil(length)) super(val, offset)
    else super(val, offset, length)
    this.dv = new DataView(this.buffer, this.byteOffset, this.byteLength)
  }

  static alloc (size: number, fill?: string | Buffer | Uint8Array | number, encoding: Encoding = 'utf8'): Buffer {
    if (size >= K_MAX_LENGTH) throw new RangeError(`Invalid size: ${size}`)
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

  static byteLength (string: TypedArray | DataView | ArrayBuffer | SharedArrayBuffer): number
  static byteLength (string: string, encoding?: Encoding): number

  static byteLength (string: any, encoding: Encoding = 'utf8'): number {
    if (Buffer.isBuffer(string) || string instanceof ArrayBuffer || string instanceof SharedArrayBuffer || ArrayBuffer.isView(string)) return string.byteLength
    if (!_.isString(string)) throw new TypeError(`Invalid type of string: ${typeof string}`)
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return string.length

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return string.length * 2

      case 'hex':
        return string.length >>> 1

      case 'base64':
      case 'base64url':
        return (string.length * 3) >>> 2

      default:
        return new TextEncoder().encode(string).length // default utf8
    }
  }

  static compare (buf1: Buffer, buf2: Buffer): number {
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
      if (start + list[i].length > totalLength) {
        buf.set(list[i].subarray(0, totalLength - start), start)
        break
      }
      buf.set(list[i], start)
      start += list[i].length
    }
    return buf
  }

  static copyBytesFrom (view: TypedArray, offset: number = 0, length?: number): Buffer {
    if (_.isNil(length)) length = view.length - offset
    return new Buffer(view.buffer, offset * view.BYTES_PER_ELEMENT, (offset + length) * view.BYTES_PER_ELEMENT)
  }

  static from (array: number[]): Buffer
  static from (arrayBuffer: ArrayBuffer | SharedArrayBuffer, byteOffset?: number, length?: number): Buffer
  static from (buffer: Buffer | Uint8Array): Buffer
  static from (object: BufferFromObjectArg, offset?: number, length?: number): Buffer
  static from (object: BufferFromObjectArg, encoding?: Encoding): Buffer
  static from (string: string, encoding?: Encoding): Buffer

  static from (val: any, encodingOrOffset?: any, length?: number): Buffer {
    const valFromObject = val?.valueOf?.() ?? val?.[Symbol.toPrimitive]?.('string')
    if (!_.isNil(valFromObject) && valFromObject !== val) val = valFromObject

    if (_.isString(val)) return Buffer.fromString(val, encodingOrOffset)
    if (ArrayBuffer.isView(val) || Buffer.isBuffer(val)) return Buffer.fromArrayBufferView(val)

    if (_.isNil(val) || _.isNumber(val)) throw new TypeError(`Invalid type of value: ${typeof val}`)

    if (val instanceof ArrayBuffer || val instanceof SharedArrayBuffer) return new Buffer(val, encodingOrOffset, length)
    if (_.isArrayLike(val)) return Buffer.fromArray(val)

    throw new TypeError(`Invalid type of value: ${typeof val}`)
  }

  static fromString (string: string, encoding: Encoding = 'utf8'): Buffer {
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
    return fromStringFns[encoding](string)
  }

  static fromUcs2String (ucs2: string): Buffer {
    const buf = new Buffer(ucs2.length * 2)
    for (let i = 0; i < ucs2.length; i++) buf.writeUInt16LE(ucs2.charCodeAt(i), i * 2)
    return buf
  }

  static fromUtf8String (utf8: string): Buffer {
    return Buffer.fromArrayBufferView(new TextEncoder().encode(utf8))
  }

  static fromAsciiString (ascii: string): Buffer {
    const buf = new Buffer(ascii.length)
    for (let i = 0; i < ascii.length; i++) buf[i] = ascii.charCodeAt(i) & 0xFF
    return buf
  }

  static fromBase64String (base64: string): Buffer {
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

  static fromBase64urlString (base64: string): Buffer {
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

  static fromHexString (hex: string): Buffer {
    hex = hex.replace(/[^0-9A-Fa-f]/g, '')
    if ((hex.length & 1) > 0) throw new TypeError('invalid hex string')
    const buf = new Buffer(hex.length >>> 1)
    for (let i = 0; i < buf.length; i++) buf[i] = HEX_CHAR.get(hex[i * 2]) << 4 | HEX_CHAR.get(hex[i * 2 + 1])
    return buf
  }

  static fromArrayBufferView (view: ArrayBufferView): Buffer {
    if (!ArrayBuffer.isView(view)) throw new TypeError('invalid view')
    return new Buffer(view.buffer, view.byteOffset, view.byteLength)
  }

  static fromArray (arr: ArrayLike<number>): Buffer {
    const buf = new Buffer(arr.length)
    for (let i = 0; i < buf.length; i++) buf[i] = arr[i] & 0xFF
    return buf
  }

  static isBuffer (obj: any): obj is Buffer {
    return obj instanceof Buffer
  }

  static isEncoding (encoding: any): encoding is Encoding {
    return _.isString(encoding) && _.has(EncodingConst, encoding)
  }

  compare (target: Buffer, targetStart: number = 0, targetEnd: number = target.length, sourceStart: number = 0, sourceEnd: number = this.length): number {
    return Buffer.compare(this.subarray(sourceStart, sourceEnd), target.subarray(targetStart, targetEnd))
  }

  copy (target: Buffer, targetStart: number = 0, sourceStart: number = 0, sourceEnd: number = this.length): number {
    const buf = this.subarray(sourceStart, sourceEnd)
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
    else if (val instanceof Uint8Array) val = Buffer.fromArrayBufferView(val)

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
    if (!_.isSafeInteger(offset)) throw new RangeError('Invalid type of offset')

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (val instanceof Uint8Array) val = Buffer.fromArrayBufferView(val)

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
    if (!_.isSafeInteger(offset)) throw new RangeError('Invalid type of offset')

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (val instanceof Uint8Array) val = Buffer.fromArrayBufferView(val)

    if (Buffer.isBuffer(val)) { // try to convert Buffer to number
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
    if (Buffer.isEncoding(offset)) [offset, encoding] = [0, offset]
    if (!_.isSafeInteger(offset)) throw new RangeError('Invalid type of offset')

    if (_.isString(val)) val = Buffer.fromString(val, encoding)
    else if (val instanceof Uint8Array) val = Buffer.fromArrayBufferView(val)

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

  subarray (start: number = 0, end: number = this.length): Buffer {
    return Buffer.fromArrayBufferView(super.subarray(start, end))
  }

  slice (start: number = 0, end: number = this.length): Buffer {
    return Buffer.fromArrayBufferView(super.slice(start, end))
  }

  swap16 (): this {
    if ((this.length & 0x1) > 0) throw new RangeError('Buffer size must be a multiple of 16-bits')
    for (let i = 0; i < this.length; i += 2) [this[i], this[i + 1]] = [this[i + 1], this[i]]
    return this
  }

  swap32 (): this {
    if ((this.length & 0x3) > 0) throw new RangeError('Buffer size must be a multiple of 32-bits')
    for (let i = 0; i < this.length; i += 4) {
      ;[this[i], this[i + 3]] = [this[i + 3], this[i]]
      ;[this[i + 1], this[i + 2]] = [this[i + 2], this[i + 1]]
    }
    return this
  }

  swap64 (): this {
    if ((this.length & 0x7) > 0) throw new RangeError('Buffer size must be a multiple of 64-bits')
    for (let i = 0; i < this.length; i += 8) {
      ;[this[i], this[i + 7]] = [this[i + 7], this[i]]
      ;[this[i + 1], this[i + 6]] = [this[i + 6], this[i + 1]]
      ;[this[i + 2], this[i + 5]] = [this[i + 5], this[i + 2]]
      ;[this[i + 3], this[i + 4]] = [this[i + 4], this[i + 3]]
    }
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

  static toUcs2String (buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i += 2) arr.push(String.fromCharCode(buf.readUInt16LE(i)))
    return arr.join('')
  }

  static toUtf8String (buf: Buffer): string {
    return new TextDecoder().decode(buf)
  }

  static toAsciiString (buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i++) arr.push(String.fromCharCode(buf[i]))
    return arr.join('')
  }

  static toBase64String (buf: Buffer): string {
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

  static toBase64urlString (buf: Buffer): string {
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
    console.log(`tmp = ${tmp}`)
    return (tmp !== 0 ? arr.slice(0, tmp) : arr).join('')
  }

  static toHexString (buf: Buffer): string {
    const arr = []
    for (let i = 0; i < buf.length; i++) arr.push(HEX_CHAR.get(buf[i] >>> 4), HEX_CHAR.get(buf[i] & 0xF))
    return arr.join('')
  }

  write (val: string, encoding?: Encoding): number
  write (val: string, offset?: number, encoding?: Encoding): number
  write (val: string, offset?: number, end?: number, encoding?: Encoding): number

  write (val: any, offset: any = 0, length: any = this.length - offset, encoding: Encoding = 'utf8'): number {
    const buf = Buffer.fromString(val, encoding)
    length = Math.min(buf.length, length, this.length - offset)
    this.set(buf.subarray(0, length), offset)
    return length
  }

  writeBigInt64BE (val: bigint, offset: number = 0): number {
    this.dv.setBigInt64(offset, val)
    return offset + 8
  }

  writeBigInt64LE (val: bigint, offset: number = 0): number {
    this.dv.setBigInt64(offset, val, true)
    return offset + 8
  }

  writeBigUInt64BE (val: bigint, offset: number = 0): number {
    this.dv.setBigUint64(offset, val)
    return offset + 8
  }

  writeBigUInt64LE (val: bigint, offset: number = 0): number {
    this.dv.setBigUint64(offset, val, true)
    return offset + 8
  }

  writeDoubleBE (val: number, offset: number = 0): number {
    this.dv.setFloat64(offset, val)
    return offset + 8
  }

  writeDoubleLE (val: number, offset: number = 0): number {
    this.dv.setFloat64(offset, val, true)
    return offset + 8
  }

  writeFloatBE (val: number, offset: number = 0): number {
    this.dv.setFloat32(offset, val)
    return offset + 4
  }

  writeFloatLE (val: number, offset: number = 0): number {
    this.dv.setFloat32(offset, val, true)
    return offset + 4
  }

  writeInt8 (val: number, offset: number = 0): number {
    this.dv.setInt8(offset, val)
    return offset + 1
  }

  writeInt16BE (val: number, offset: number = 0): number {
    this.dv.setInt16(offset, val)
    return offset + 2
  }

  writeInt16LE (val: number, offset: number = 0): number {
    this.dv.setInt16(offset, val, true)
    return offset + 2
  }

  writeInt32BE (val: number, offset: number = 0): number {
    this.dv.setInt32(offset, val)
    return offset + 4
  }

  writeInt32LE (val: number, offset: number = 0): number {
    this.dv.setInt32(offset, val, true)
    return offset + 4
  }

  writeIntBE (val: number, offset: number = 0, byteLength: number = 6): number {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (val < 0) val += SIGNED_OFFSET[byteLength]
    this.writeUIntBE(val, offset, byteLength)
    return offset + byteLength
  }

  writeIntLE (val: number, offset: number = 0, byteLength: number = 6): number {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (val < 0) val += SIGNED_OFFSET[byteLength]
    this.writeUIntLE(val, offset, byteLength)
    return offset + byteLength
  }

  writeUInt8 (val: number, offset: number = 0): number {
    this.dv.setUint8(offset, val)
    return offset + 1
  }

  writeUInt16BE (val: number, offset: number = 0): number {
    this.dv.setUint16(offset, val)
    return offset + 2
  }

  writeUInt16LE (val: number, offset: number = 0): number {
    this.dv.setUint16(offset, val, true)
    return offset + 2
  }

  writeUInt32BE (val: number, offset: number = 0): number {
    this.dv.setUint32(offset, val)
    return offset + 4
  }

  writeUInt32LE (val: number, offset: number = 0): number {
    this.dv.setUint32(offset, val, true)
    return offset + 4
  }

  writeUIntBE (val: number, offset: number = 0, byteLength: number = 6): number {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (offset + byteLength > this.length) throw new RangeError(`Invalid offset: ${offset}`)
    for (let i = byteLength - 1; i >= 0; i--) {
      this[offset + i] = val & 0xFF
      val /= 0x100
    }
    return offset + byteLength
  }

  writeUIntLE (val: number, offset: number = 0, byteLength: number = 6): number {
    if (byteLength < 1 || byteLength > 6) throw new RangeError(`Invalid byteLength: ${byteLength}`)
    if (offset + byteLength > this.length) throw new RangeError(`Invalid offset: ${offset}`)
    for (let i = 0; i < byteLength; i++) {
      this[offset + i] = val & 0xFF
      val /= 0x100
    }
    return offset + byteLength
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
}

export const EncodingConst = {
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

export type TypedArray = NodeJS.TypedArray | Buffer

export type BufferFromObjectArg = { [Symbol.toPrimitive]: (hint: string) => string } | { valueOf: () => string }

export interface ArrayLike<T> {
  readonly length: number
  readonly [n: number]: T
}
