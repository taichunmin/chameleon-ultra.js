/**
 * @example
 * import Crypto1 from 'chameleon-ultra.js/Crypto1'
 */
import _ from 'lodash'
import { Buffer } from '@taichunmin/buffer'
import { Mf1KeyType } from './enums'

const LF_POLY_ODD = 0x29CE5C
const LF_POLY_EVEN = 0x870804

const S1 = [
  0x62141, 0x310A0, 0x18850, 0x0C428, 0x06214,
  0x0310A, 0x85E30, 0xC69AD, 0x634D6, 0xB5CDE,
  0xDE8DA, 0x6F46D, 0xB3C83, 0x59E41, 0xA8995,
  0xD027F, 0x6813F, 0x3409F, 0x9E6FA,
]

const S2 = [
  0x3A557B00, 0x5D2ABD80, 0x2E955EC0, 0x174AAF60, 0x0BA557B0,
  0x05D2ABD8, 0x0449DE68, 0x048464B0, 0x42423258, 0x278192A8,
  0x156042D0, 0x0AB02168, 0x43F89B30, 0x61FC4D98, 0x765EAD48,
  0x7D8FDD20, 0x7EC7EE90, 0x7F63F748, 0x79117020,
]

const T1 = [
  0x4F37D, 0x279BE, 0x97A6A, 0x4BD35, 0x25E9A,
  0x12F4D, 0x097A6, 0x80D66, 0xC4006, 0x62003,
  0xB56B4, 0x5AB5A, 0xA9318, 0xD0F39, 0x6879C,
  0xB057B, 0x582BD, 0x2C15E, 0x160AF, 0x8F6E2,
  0xC3DC4, 0xE5857, 0x72C2B, 0x39615, 0x98DBF,
  0xC806A, 0xE0680, 0x70340, 0x381A0, 0x98665,
  0x4C332, 0xA272C,
]

const T2 = [
  0x3C88B810, 0x5E445C08, 0x2982A580, 0x14C152C0, 0x4A60A960,
  0x253054B0, 0x52982A58, 0x2FEC9EA8, 0x1156C4D0, 0x08AB6268,
  0x42F53AB0, 0x217A9D58, 0x161DC528, 0x0DAE6910, 0x46D73488,
  0x25CB11C0, 0x52E588E0, 0x6972C470, 0x34B96238, 0x5CFC3A98,
  0x28DE96C8, 0x12CFC0E0, 0x4967E070, 0x64B3F038, 0x74F97398,
  0x7CDC3248, 0x38CE92A0, 0x1C674950, 0x0E33A4A8, 0x01B959D0,
  0x40DCACE8, 0x26CEDDF0,
]

const C1 = [0x00846B5, 0x0004235A, 0x000211AD]
const C2 = [0x1A822E0, 0x21A822E0, 0x21A822E0]

const fastfwd = [
  0, 0x4BC53, 0xECB1, 0x450E2, 0x25E29, 0x6E27A, 0x2B298, 0x60ECB,
  0, 0x1D962, 0x4BC53, 0x56531, 0xECB1, 0x135D3, 0x450E2, 0x58980,
]

/**
 * JavaScript implementation of the Crypto1 cipher.
 */
export default class Crypto1 {
  /**
   * @group Internal
   * @internal
   */
  static evenParityCache: number[] = []

  /**
   * @group Internal
   * @internal
   */
  static lfsrBuf = new Buffer(6)

  /**
   * @group Internal
   * @internal
   */
  even: number = 0

  /**
   * @group Internal
   * @internal
   */
  odd: number = 0

  /**
   * @param opts -
   * @param opts.even - The even bits of lfsr.
   * @param opts.odd - The odd bits of lfsr.
   * @see [mfkey source code from RfidResearchGroup/proxmark3](https://github.com/RfidResearchGroup/proxmark3/tree/master/tools/mfkey)
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * const state1 = new Crypto1()
   * const state2 = new Crypto1({ even: 0, odd: 0 })
   * ```
   */
  constructor ({ even = 0, odd = 0 }: { even?: number, odd?: number } = {}) {
    if (!_.isNil(even) && !_.isNil(odd)) {
      ;[this.even, this.odd] = [even, odd]
    }
  }

  /**
   * Reset the internal lfsr.
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * const state1 = new Crypto1({ even: 1, odd: 1 })
   * state1.reset()
   * ```
   */
  reset (): this {
    ;[this.odd, this.even] = [0, 0]
    return this
  }

  /**
   * Set the internal lfsr with the key.
   * @param key - The key to set the internal lfsr.
   * @example
   * ```js
   * const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * const state1 = new Crypto1()
   * state1.setLfsr(new Buffer('FFFFFFFFFFFF'))
   * ```
   */
  setLfsr (key: number): this {
    const { lfsrBuf } = Crypto1
    this.reset()
    lfsrBuf.writeUIntBE(key, 0, 6)
    for (let i = 47; i > 0; i -= 2) {
      ;[this.odd, this.even] = [
        (this.odd << 1) | lfsrBuf.readBitLSB((i - 1) ^ 7),
        (this.even << 1) | lfsrBuf.readBitLSB(i ^ 7),
      ]
    }
    return this
  }

  /**
   * Get the value of lfsr.
   * @returns lfsr.
   * @example
   * ```js
   * const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * const state1 = new Crypto1()
   * console.log(state1.setLfsr(new Buffer('FFFFFFFFFFFF')).getLfsr().toString(16)) // 'FFFFFFFFFFFF'
   * ```
   */
  getLfsr (): number {
    const { bit } = Crypto1
    let lfsr = 0
    for (let i = 23, j = (i ^ 3); i >= 0; i--, j = (i ^ 3)) {
      lfsr = lfsr * 4 + (bit(this.odd, j) > 0 ? 2 : 0) + bit(this.even, j)
    }
    return lfsr
  }

  /**
   * Get the lfsr output bit and update lfsr by input bit.
   * @param input - The input bit.
   * @param isEncrypted - Indicates whether the input bit is encrypted or not.
   * @returns The lfsr output bit.
   */
  lfsrBit (input: number, isEncrypted: number): number {
    const { evenParity32, filter, toBool, toUint32 } = Crypto1
    const output = filter(this.odd)

    const feedin = (output & toBool(isEncrypted)) ^
      toBool(input) ^
      (LF_POLY_ODD & this.odd) ^
      (LF_POLY_EVEN & this.even)

    ;[this.odd, this.even] = [
      toUint32(this.even << 1 | evenParity32(feedin)),
      this.odd,
    ]

    return output
  }

  /**
   * Get the lfsr output byte and update lfsr by input byte.
   * @param input - The input byte.
   * @param isEncrypted - Indicates whether the input byte is encrypted or not.
   * @returns The lfsr output byte.
   */
  lfsrByte (input: number, isEncrypted: number): number {
    const { bit } = Crypto1
    let ret = 0
    for (let i = 0; i < 8; i++) ret |= this.lfsrBit(bit(input, i), isEncrypted) << i
    return ret
  }

  /**
   * Get the lfsr 32-bit output word and update lfsr by 32-bit input word.
   * @param input - The 32-bit input word.
   * @param isEncrypted - Indicates whether the 32-bit input word is encrypted or not.
   * @returns The lfsr 32-bit output word.
   */
  lfsrWord (input: number, isEncrypted: number): number {
    const { beBit } = Crypto1
    const u32 = new Uint32Array([0])
    for (let i = 0; i < 32; i++) u32[0] |= this.lfsrBit(beBit(input, i), isEncrypted) << (i ^ 24)
    return u32[0]
  }

  /**
   * Rollback the lfsr in order to get previous states
   * @param input - The input bit.
   * @param isEncrypted - Indicates whether the input bit is encrypted or not.
   * @returns The lfsr output bit.
   */
  lfsrRollbackBit (input: number, isEncrypted: number): number {
    const { evenParity32, filter, toBit, toBool, toUint24, toUint32 } = Crypto1
    ;[this.even, this.odd] = [toUint24(this.odd), this.even]
    const ret = filter(this.odd)

    let out = toBit(this.even)
    out ^= LF_POLY_EVEN & (this.even >>>= 1)
    out ^= LF_POLY_ODD & this.odd
    out ^= toBool(input) ^ (ret & toBool(isEncrypted))

    this.even = toUint32(this.even | evenParity32(out) << 23)
    return ret
  }

  /**
   * Rollback the lfsr in order to get previous states
   * @param input - The input byte.
   * @param isEncrypted - Indicates whether the input byte is encrypted or not.
   * @returns The lfsr output byte.
   */
  lfsrRollbackByte (input: number, isEncrypted: number): number {
    const { bit } = Crypto1
    let ret = 0
    for (let i = 7; i >= 0; i--) ret |= this.lfsrRollbackBit(bit(input, i), isEncrypted) << i
    return ret
  }

  /**
   * Rollback the lfsr in order to get previous states
   * @param input - The 32-bit input word.
   * @param isEncrypted - Indicates whether the 32-bit input word is encrypted or not.
   * @returns The lfsr 32-bit output word.
   */
  lfsrRollbackWord (input: number, isEncrypted: number): number {
    const { beBit } = Crypto1
    const u32 = new Uint32Array(1)
    for (let i = 31; i >= 0; i--) u32[0] |= this.lfsrRollbackBit(beBit(input, i), isEncrypted) << (i ^ 24)
    return u32[0]
  }

  /**
   * Get bit of the unsigned reversed endian 32-bit integer `x` at position `n`.
   * @param x - The reversed endian unsigned 32-bit integer.
   * @param n - The bit position.
   * @returns The bit at position `n`.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.beBit(0x01000000, 0)) // 1
   * ```
   */
  static beBit (x: number, n: number): number { return Crypto1.bit(x, n ^ 24) }

  /**
   * Get bit of the unsigned 32-bit integer `x` at position `n`.
   * @param x - The unsigned 32-bit integer.
   * @param n - The bit position.
   * @returns The bit at position `n`.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.bit(0x1, 0)) // 1
   * ```
   */
  static bit (x: number, n: number): number { return Crypto1.toBit(x >>> n) }

  /**
   * Cast the number `x` to bit.
   * @param x - The number.
   * @returns The casted bit.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.toBit(1)) // 1
   * console.log(Crypto1.toBit(2)) // 0
   * ```
   */
  static toBit (x: number): number { return x & 1 }

  /**
   * Indicates whether the number is truly or not.
   * @param x - The number.
   * @returns Return `1` if the number is not falsey, otherwise return `0`.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.toBool(1)) // 1
   * console.log(Crypto1.toBool(2)) // 1
   * ```
   */
  static toBool (x: number): number { return x !== 0 ? 1 : 0 }

  /**
   * Cast the number `x` to unsigned 24-bit integer.
   * @param x - The number.
   * @returns The casted unsigned 24-bit integer.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.toUint24(-1).toString(16)) // 'ffffff'
   * ```
   */
  static toUint24 (x: number): number { return x & 0xFFFFFF }

  /**
   * Cast the number `x` to unsigned 32-bit integer.
   * @param x - The number.
   * @returns The casted unsigned 32-bit integer.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.toUint32(-1).toString(16)) // 'ffffffff'
   * ```
   */
  static toUint32 (x: number): number { return x >>> 0 }

  /**
   * Cast Buffer, hex string or number to UInt32
   * @param x - Buffer, string or number
   * @returns UInt32
   * @internal
   * @group Internal
   */
  static castToUint32 (x: UInt32Like): number {
    const { toUint32 } = Crypto1
    if (_.isSafeInteger(x)) return toUint32(x as number)
    if (_.isString(x)) return Buffer.from(x, 'hex').readUInt32BE(0)
    return Buffer.from(x as any).readUInt32BE(0)
  }

  /**
   * Cast the number `x` to unsigned 8-bit integer.
   * @param x - The number.
   * @returns The casted unsigned 8-bit integer.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.toUint8(-1).toString(16)) // 'ff'
   * ```
   */
  static toUint8 (x: number): number { return x & 0xFF }

  /**
   * The filter function of Crypto1.
   * @param x - The unsigned 32-bit integer.
   * @returns The filtered bit.
   * @internal
   * @group Internal
   */
  static filter (x: number): number {
    let f = 0
    f |= 0xF22C0 >>> (x & 0xF) & 16
    f |= 0x6C9C0 >>> (x >>> 4 & 0xF) & 8
    f |= 0x3C8B0 >>> (x >>> 8 & 0xF) & 4
    f |= 0x1E458 >>> (x >>> 12 & 0xF) & 2
    f |= 0x0D938 >>> (x >>> 16 & 0xF) & 1
    return Crypto1.bit(0xEC57E80A, f)
  }

  /**
   * Return the even parity of the unsigned 8-bit integer `x`.
   * @param x - The unsigned 8-bit integer.
   * @returns The even parity of `x`.
   * @internal
   * @group Internal
   */
  static evenParity8 (x: number): number {
    const { evenParityCache, toBit } = Crypto1
    if (evenParityCache.length !== 256) {
      for (let i = 0; i < 256; i++) {
        let tmp = i
        tmp ^= tmp >>> 4
        tmp ^= tmp >>> 2
        Crypto1.evenParityCache[i] = toBit(tmp ^ (tmp >>> 1))
      }
    }
    return evenParityCache[x & 0xFF]
  }

  /**
   * Return the odd parity of the unsigned 8-bit integer `x`.
   * @param x - The unsigned 8-bit integer.
   * @returns The odd parity of `x`.
   * @internal
   * @group Internal
   */
  static oddParity8 (x: number): number {
    return 1 - Crypto1.evenParity8(x)
  }

  /**
   * Return the even parity of the unsigned 32-bit integer `x`.
   * @param x - The unsigned 32-bit integer.
   * @returns The even parity of `x`.
   * @internal
   * @group Internal
   */
  static evenParity32 (x: number): number {
    x ^= x >>> 16
    return Crypto1.evenParity8(x ^ (x >>> 8))
  }

  /**
   * Swap endian of the unsigned 32-bit integer `x`.
   * @param x - The unsigned 32-bit integer.
   * @returns The unsigned 32-bit integer after swap endian.
   * @internal
   * @group Internal
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.swapEndian(0x12345678).toString(16)) // '78563412'
   * ```
   */
  static swapEndian (x: number): number {
    return Crypto1.lfsrBuf.writeUInt32BE(x, 0).readUInt32LE(0)
  }

  /**
   * Generate the new prng state from the current prng state `x` by `n` times.
   * @param x - The current prng state.
   * @param n - The number of times to generate the new prng state.
   * @returns The new prng state.
   */
  static prngSuccessor (x: number, n: number): number {
    const { swapEndian } = Crypto1
    x = swapEndian(x)
    while ((n--) !== 0) x = x >>> 1 | (x >>> 16 ^ x >>> 18 ^ x >>> 19 ^ x >>> 21) << 31
    return swapEndian(x)
  }

  /**
   * A helper function to calculates the partial linear feedback contributions and puts in MSB (Most Significant Bit).
   * @param item - The input number.
   * @param mask1 -
   * @param mask2 -
   * @internal
   * @group Internal
   */
  static updateContribution (item: number, mask1: number, mask2: number): number {
    const { evenParity32, toUint32 } = Crypto1
    let p = item >>> 25
    p = p << 2 | (evenParity32(item & mask1) > 0 ? 2 : 0) | evenParity32(item & mask2)
    return toUint32(p << 24 | item & 0xFFFFFF)
  }

  /**
   * Using a bit of the keystream extend the table of possible lfsr states. (complex version)
   * @param tbl - An array of the even/odd bits of lfsr.
   * @param size - Size of array.
   * @param bit - The bit of the keystream.
   * @param m1 - mask1
   * @param m2 - mask2
   * @param input - The value that was fed into the lfsr at the time the keystream was generated.
   * @returns The new size of array.
   * @internal
   * @group Internal
   */
  static extendTable (tbl: Uint32Array, size: number, bit: number, m1: number, m2: number, input: number): number {
    const { filter, toUint32, updateContribution } = Crypto1
    input = toUint32(input << 24)
    for (let i = 0; i < size; i++) {
      const iFilter = filter(tbl[i] *= 2)
      if ((iFilter ^ filter(tbl[i] | 1)) !== 0) { // replace
        tbl[i] = updateContribution(tbl[i] + (iFilter ^ bit), m1, m2) ^ input
      } else if (iFilter === bit) { // insert
        tbl[size++] = tbl[++i]
        tbl[i] = updateContribution(tbl[i - 1] + 1, m1, m2) ^ input
        tbl[i - 1] = updateContribution(tbl[i - 1], m1, m2) ^ input
      } else tbl[i--] = tbl[--size] // remove
    }
    return size
  }

  /**
   * Using a bit of the keystream extend the table of possible lfsr states. (simple version)
   * @param tbl - An array of the even/odd bits of lfsr.
   * @param size - Size of array.
   * @param bit - The bit of the keystream.
   * @returns The new size of array.
   * @internal
   * @group Internal
   */
  static extendTableSimple (tbl: Uint32Array, size: number, bit: number): number {
    const { filter } = Crypto1
    for (let i = 0; i < size; i++) {
      const iFilter = filter(tbl[i] *= 2)
      if ((iFilter ^ filter(tbl[i] | 1)) !== 0) { // replace
        tbl[i] += iFilter ^ bit
      } else if (iFilter === bit) { // insert
        tbl[size++] = tbl[++i]
        tbl[i] = tbl[i - 1] + 1
      } else tbl[i--] = tbl[--size] // remove
    }
    return size
  }

  /**
   * Recursively narrow down the search space, 4 bits of keystream at a time.
   * @param ctx -
   * @param ctx.evens - The array of even bits of possible lfsr states.
   * @param ctx.odds - The array of odd bits of possible lfsr states.
   * @param ctx.states - The array of recovered lfsr states.
   * @internal
   * @group Internal
   */
  static mfkeyRecoverState (ctx: {
    eks: number
    evens: RecoverContextUint32Array
    input: number
    odds: RecoverContextUint32Array
    oks: number
    rem: number
    states: Crypto1[]
  }): void {
    const { evenParity32, extendTable, mfkeyRecoverState, toBit, toBool, toUint32 } = Crypto1
    const { evens, odds, states } = ctx
    if (ctx.rem < 0) {
      for (let i = 0; i < evens.s; i++) {
        evens.d[i] = (evens.d[i] << 1) ^ evenParity32(evens.d[i] & LF_POLY_EVEN) ^ toBool(ctx.input & 4)
        for (let j = 0; j < odds.s; j++) {
          states.push(new Crypto1({
            even: odds.d[j],
            odd: toUint32(evens.d[i] ^ evenParity32(odds.d[j] & LF_POLY_ODD)),
          }))
        }
      }
      return
    }

    for (let i = 0; i < 4 && (ctx.rem--) !== 0; i++) {
      ;[ctx.oks, ctx.eks, ctx.input] = [ctx.oks >>> 1, ctx.eks >>> 1, ctx.input >>> 2]
      odds.s = extendTable(odds.d, odds.s, toBit(ctx.oks), LF_POLY_EVEN << 1 | 1, LF_POLY_ODD << 1, 0)
      if (odds.s === 0) return
      evens.s = extendTable(evens.d, evens.s, toBit(ctx.eks), LF_POLY_ODD, LF_POLY_EVEN << 1 | 1, ctx.input & 3)
      if (evens.s === 0) return
    }

    evens.d.subarray(0, evens.s).sort()
    odds.d.subarray(0, odds.s).sort()

    while ((odds.s + evens.s) !== 0) {
      const [oddBucket, evenBucket] = _.map([odds.d[odds.s - 1], evens.d[evens.s - 1]], num => toUint32(num & 0xFF000000))
      if (oddBucket !== evenBucket) {
        if (oddBucket > evenBucket) odds.s = _.sortedIndex(odds.d.subarray(0, odds.s), oddBucket)
        else evens.s = _.sortedIndex(evens.d.subarray(0, evens.s), evenBucket)
        continue
      }
      const [evenStart, oddStart] = [
        _.sortedIndex(evens.d.subarray(0, evens.s), oddBucket),
        _.sortedIndex(odds.d.subarray(0, odds.s), evenBucket),
      ]
      mfkeyRecoverState({
        ...ctx,
        evens: { d: evens.d.subarray(evenStart), s: evens.s - evenStart },
        odds: { d: odds.d.subarray(oddStart), s: odds.s - oddStart },
      })
      ;[evens.s, odds.s] = [evenStart, oddStart]
    }
  }

  /**
   * Recover the state of the lfsr given 32 bits of the keystream.
   * Additionally you can use the in parameter to specify the value that was fed into the lfsr at the time the keystream was generated
   * @param ks2 -
   * @param input -
   * @returns The array of recovered lfsr states.
   * @internal
   * @group Internal
   */
  static lfsrRecovery32 (ks2: number, input: number): Crypto1[] {
    const { beBit, extendTableSimple, filter, mfkeyRecoverState, toBit, toUint32 } = Crypto1
    const evens = { s: 0, d: new Uint32Array(1 << 21) } // possible evens for ks2
    const odds = { s: 0, d: new Uint32Array(1 << 21) } // possible odds for ks2
    const states: Crypto1[] = [] // possible states for ks2
    // split the keystream into an odd and even part
    let [oks, eks] = [0, 0]
    for (let i = 31; i > 0; i -= 2) {
      oks = toUint32((oks << 1) | beBit(ks2, i))
      eks = toUint32((eks << 1) | beBit(ks2, i - 1))
    }

    for (let [i, eksBit, oksBit] = [1 << 20, toBit(eks), toBit(oks)]; i >= 0; i--) {
      if (filter(i) === oksBit) odds.d[odds.s++] = i
      if (filter(i) === eksBit) evens.d[evens.s++] = i
    }

    for (let i = 0; i < 4; i++) {
      ;[eks, oks] = [eks >>> 1, oks >>> 1]
      evens.s = extendTableSimple(evens.d, evens.s, toBit(eks))
      odds.s = extendTableSimple(odds.d, odds.s, toBit(oks))
    }

    input = (input << 16) | (input >>> 16 & 0xff) | (input & 0xff00) // Byte swapping
    mfkeyRecoverState({ eks, evens, odds, oks, states, rem: 11, input: input << 1 })
    return states
  }

  /**
   * Reverse 64 bits of keystream into possible lfsr states.
   * Variation mentioned in the paper. Somewhat optimized version
   * @param ks2 - keystream 2
   * @param ks3 - keystream 3
   * @returns The recovered lfsr state.
   * @internal
   * @group Internal
   */
  static lfsrRecovery64 (ks2: number, ks3: number): Crypto1 {
    const { beBit, evenParity32, extendTableSimple, filter } = Crypto1
    const oks = new Uint8Array(32)
    const eks = new Uint8Array(32)
    const hi = new Uint8Array(32)
    let [low, win] = [0, 0]
    const tbl = { d: new Uint32Array(1 << 16), s: 0 }

    for (let i = 30; i >= 0; i -= 2) {
      oks[i >>> 1] = beBit(ks2, i)
      oks[16 + (i >>> 1)] = beBit(ks3, i)
    }
    for (let i = 31; i >= 0; i -= 2) {
      eks[i >>> 1] = beBit(ks2, i)
      eks[16 + (i >>> 1)] = beBit(ks3, i)
    }

    for (let i = 0xFFFFF; i >= 0; i--) {
      if (filter(i) !== oks[0]) continue
      tbl.s = 0 // reset
      tbl.d[tbl.s++] = i
      for (let j = 1; tbl.s !== 0 && j < 29; j++) tbl.s = extendTableSimple(tbl.d, tbl.s, oks[j])
      if (tbl.s === 0) continue

      for (let j = 0; j < 19; j++) low = low << 1 | evenParity32(i & S1[j])
      for (let j = 0; j < 32; j++) hi[j] = evenParity32(i & T1[j])

      for (let k = tbl.s - 1; k >= 0; k--) {
        try {
          for (let j = 0; j < 3; j++) {
            tbl.d[k] <<= 1
            tbl.d[k] |= evenParity32((i & C1[j]) ^ (tbl.d[k] & C2[j]))
            if (filter(tbl.d[k]) !== oks[29 + j]) throw new Error('cont2')
          }
          for (let j = 0; j < 19; j++) win = win << 1 | evenParity32(tbl.d[k] & S2[j])
          win ^= low
          for (let j = 0; j < 32; j++) {
            win = (win << 1) ^ hi[j] ^ evenParity32(tbl.d[k] & T2[j])
            if (filter(win) !== eks[j]) throw new Error('cont2')
          }

          tbl.d[k] = tbl.d[k] << 1 | evenParity32(LF_POLY_EVEN & tbl.d[k])
          return new Crypto1({ even: win, odd: tbl.d[k] ^ evenParity32(LF_POLY_ODD & win) })
        } catch (err) {
          if (err.message !== 'cont2') throw err
        }
      }
    }
    throw new Error('failed to recover lfsr')
  }

  /**
   * Recover the key with the two authentication attempts from reader.
   * @param opts -
   * @param opts.uid - The 4-bytes uid in the authentication attempt.
   * @param opts.nt0 - The nonce from tag in the first authentication attempt.
   * @param opts.nr0 - The calculated nonce response from reader in the first authentication attempt.
   * @param opts.ar0 - The random challenge from reader in the first authentication attempt.
   * @param opts.nt1 - The nonce from tag in the second authentication attempt.
   * @param opts.nr1 - The calculated nonce response from reader in the second authentication attempt.
   * @param opts.ar1 - The random challenge from reader in the second authentication attempt.
   * @returns The recovered key.
   * @example
   * ```js
   * const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.mfkey32v2({
   *   uid: 0x65535D33,
   *   nt0: 0xCB7B9ED9,
   *   nr0: 0x5A8FFEC6,
   *   ar0: 0x5C7C6F89,
   *   nt1: 0x1E6D9228,
   *   nr1: 0x6FB8B4A8,
   *   ar1: 0xEF4039FB,
   * }).toString('hex')) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: Buffer.fromHex('65535D33'),
   *   nt0: Buffer.fromHex('CB7B9ED9'),
   *   nr0: Buffer.fromHex('5A8FFEC6'),
   *   ar0: Buffer.fromHex('5C7C6F89'),
   *   nt1: Buffer.fromHex('1E6D9228'),
   *   nr1: Buffer.fromHex('6FB8B4A8'),
   *   ar1: Buffer.fromHex('EF4039FB'),
   * }).toString('hex')) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: '65535D33',
   *   nt0: 'CB7B9ED9',
   *   nr0: '5A8FFEC6',
   *   ar0: '5C7C6F89',
   *   nt1: '1E6D9228',
   *   nr1: '6FB8B4A8',
   *   ar1: 'EF4039FB',
   * }).toString('hex')) // A9AC67832330
   * ```
   */
  static mfkey32v2 (opts: {
    uid: UInt32Like
    nt0: UInt32Like
    nr0: UInt32Like
    ar0: UInt32Like
    nt1: UInt32Like
    nr1: UInt32Like
    ar1: UInt32Like
  }): Buffer {
    const { castToUint32, lfsrRecovery32, prngSuccessor, toUint32 } = Crypto1
    const [uid, nt0, nr0, ar0, nt1, nr1, ar1] = _.map(['uid', 'nt0', 'nr0', 'ar0', 'nt1', 'nr1', 'ar1'] as const, k => castToUint32(opts[k]))
    const p640 = prngSuccessor(nt0, 64)
    const p641 = prngSuccessor(nt1, 64)

    const states = lfsrRecovery32(ar0 ^ p640, 0)
    for (const state of states) {
      state.lfsrRollbackWord(0, 0)
      state.lfsrRollbackWord(nr0, 1)
      state.lfsrRollbackWord(uid ^ nt0, 0)
      const key = state.getLfsr()
      state.lfsrWord(uid ^ nt1, 0)
      state.lfsrWord(nr1, 1)
      if (toUint32(state.lfsrWord(0, 0) ^ p641) === ar1) return new Buffer(6).writeUIntBE(key, 0, 6)
    }
    throw new Error('failed to recover key')
  }

  /**
   * Recover the key with the successfully authentication between the reader and the tag.
   * @param opts -
   * @param opts.uid - The 4-bytes uid in the authentication.
   * @param opts.nt - The nonce from tag in the authentication.
   * @param opts.nr - The calculated response of `args.nt` from reader in the authentication.
   * @param opts.ar - The random challenge from reader in the authentication.
   * @param opts.at - The calculated response of `args.ar` from tag in the authentication.
   * @returns The recovered key.
   * @example
   * ```js
   * const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *
   * console.log(Crypto1.mfkey32v2({
   *   uid: 0x65535D33,
   *   nt: 0x2C198BE4,
   *   nr: 0xFEDAC6D2,
   *   ar: 0xCF0A3C7E,
   *   at: 0xF4A81AF8,
   * }).toString('hex')) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: Buffer.fromHex('65535D33'),
   *   nt: Buffer.fromHex('2C198BE4'),
   *   nr: Buffer.fromHex('FEDAC6D2'),
   *   ar: Buffer.fromHex('CF0A3C7E'),
   *   at: Buffer.fromHex('F4A81AF8'),
   * }).toString('hex')) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: '65535D33',
   *   nt: '2C198BE4',
   *   nr: 'FEDAC6D2',
   *   ar: 'CF0A3C7E',
   *   at: 'F4A81AF8',
   * }).toString('hex')) // A9AC67832330
   * ```
   */
  static mfkey64 (opts: {
    uid: UInt32Like
    nt: UInt32Like
    nr: UInt32Like
    ar: UInt32Like
    at: UInt32Like
  }): Buffer {
    const { castToUint32, lfsrRecovery64, prngSuccessor } = Crypto1
    const [uid, nt, nr, ar, at] = _.map(['uid', 'nt', 'nr', 'ar', 'at'] as const, k => castToUint32(opts[k]))
    const p64 = prngSuccessor(nt, 64)
    const [ks2, ks3] = [ar ^ p64, at ^ prngSuccessor(p64, 32)]
    const state = lfsrRecovery64(ks2, ks3)
    state.lfsrRollbackWord(0, 0)
    state.lfsrRollbackWord(0, 0)
    state.lfsrRollbackWord(nr, 1)
    state.lfsrRollbackWord(uid ^ nt, 0)
    return new Buffer(6).writeUIntBE(state.getLfsr(), 0, 6)
  }

  /**
   * Decrypt the data.
   * @param opts -
   * @param opts.uid - The 4-bytes uid in the authentication.
   * @param opts.nt - The nonce from tag in the authentication.
   * @param opts.nr - The calculated response of `args.nt` from reader in the authentication.
   * @param opts.data - The encrypted data.
   * @param opts.key - The 6-bytes key to decrypt the data.
   * @returns The decrypted data.
   */
  static decrypt (opts: {
    uid: UInt32Like
    nt: UInt32Like
    nr: UInt32Like
    data: Buffer
    key: Buffer
  }): Buffer {
    const { castToUint32 } = Crypto1
    if (!Buffer.isBuffer(opts.key) || opts.key.length !== 6) throw new TypeError('invalid opts.key')
    if (!Buffer.isBuffer(opts.data)) throw new TypeError('invalid opts.data')
    const [uid, nt, nr] = _.map(['uid', 'nt', 'nr'] as const, k => castToUint32(opts[k]))
    const data = opts.data.slice() // clone data

    const state = new Crypto1()
    state.setLfsr(opts.key.readUIntBE(0, 6))
    state.lfsrWord(uid ^ nt, 0)
    state.lfsrWord(nr, 1)
    for (let i = 0; i < 2; i++) state.lfsrWord(0, 0)

    for (let i = 0; i < data.length; i++) data[i] ^= state.lfsrByte(0, 0)
    return data
  }

  /**
   * @group Internal
   * @internal
   */
  static nestedRecoverState (opts: {
    uid: number
    atks: Array<{
      ntp: number
      ks1: number
    }>
  }): Buffer[] {
    const { lfsrRecovery32, toUint32 } = Crypto1
    const keyCnt = new Map<number, number>()
    for (const { ntp, ks1 } of opts.atks) {
      const tmp = toUint32(ntp ^ opts.uid)
      const states = lfsrRecovery32(ks1, tmp)
      for (const state of states) {
        state.lfsrRollbackWord(tmp, 0)
        const key = state.getLfsr()
        keyCnt.set(key, (keyCnt.get(key) ?? 0) + 1)
      }
    }
    return _.chain([...keyCnt.entries()])
      .orderBy([1], ['desc'])
      .take(50)
      .map(key => new Buffer(6).writeUIntBE(key[0], 0, 6))
      .value()
  }

  /**
   * Recover key from mifare tags with static nonce
   * @param opts -
   * @param opts.uid - The 4-bytes uid in the authentication.
   * @param opts.keyType - The key type of target block.
   * @param opts.atks - The nonce logs of the authentication.
   * @returns candidates keys
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   * const { Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   * const args = {
   *   uid: 'b908a16d',
   *   keyType: Mf1KeyType.KEY_A,
   *   atks: [
   *     { nt1: '01200145', nt2: '81901975' },
   *     { nt1: '01200145', nt2: 'cdd400f3' },
   *   ],
   * }
   * const keys = Crypto1.staticnested(args)
   * console.log(`keys = ${JSON.stringify(_.map(keys, key => key.toString('hex')))}`)
   * ```
   */
  static staticnested (opts: {
    uid: UInt32Like
    keyType: Mf1KeyType
    atks: Array<{
      nt1: UInt32Like
      nt2: UInt32Like
    }>
  }): Buffer[] {
    const { castToUint32, nestedRecoverState, prngSuccessor, toUint32 } = Crypto1

    // dist
    const firstNt = castToUint32(opts.atks[0].nt1)
    let dist = 0
    // st gen1: There is no loophole in this generation. This tag can be decrypted with the default parameter value 160!
    if (firstNt === 0x01200145) dist = 160
    // st gen2: tag is vulnerable too but parameter must be adapted depending on the attacked key type
    else if (firstNt === 0x009080A2) dist = opts.keyType === Mf1KeyType.KEY_A ? 160 : 161
    if (dist === 0) throw new Error('unknown static nonce')

    return nestedRecoverState({
      uid: castToUint32(opts.uid),
      atks: _.map(opts.atks, tmp => {
        const [nt1, nt2] = _.map([tmp.nt1, tmp.nt2], castToUint32)
        const ntp = prngSuccessor(nt1, dist)
        const ks1 = toUint32(nt2 ^ ntp)
        dist += 160
        return { ntp, ks1 }
      }),
    })
  }

  /**
   * Recover key from mifare tags with weak prng
   * @param opts -
   * @param opts.uid - The 4-bytes uid in the authentication.
   * @param opts.dist - The nonce distance between two authentication.
   * @param opts.atks - The logs of the nested attack.
   * @returns candidates keys
   * @example
   * ```js
   * const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   * const args = {
   *   uid: '877209e1',
   *   dist: '00000080',
   *   atks: [
   *     { nt1: 'b4a08a09', nt2: '8a15bbf2', par: 5 },
   *     { nt1: '1613293d', nt2: '912e6760', par: 7 }
   *   ]
   * }
   * const keys = Crypto1.nested(args)
   * console.log(`keys = ${JSON.stringify(_.map(keys, key => key.toString('hex')))}`)
   * ```
   */
  static nested (opts: {
    uid: UInt32Like
    dist: UInt32Like
    atks: Array<{ nt1: UInt32Like, nt2: UInt32Like, par: UInt32Like }>
  }): Buffer[] {
    const { castToUint32, nestedIsValidNonce, nestedRecoverState, prngSuccessor, toUint32 } = Crypto1

    const dist = castToUint32(opts.dist)
    const atks: Array<{ ntp: number, ks1: number }> = []

    for (let i = 0; i < opts.atks.length; i++) {
      const tmp = opts.atks[i]
      const [nt1, nt2, par] = _.map([tmp.nt1, tmp.nt2, tmp.par], castToUint32)
      let ntp = prngSuccessor(nt1, dist - 14)
      for (let j = 0; j < 29; j++, ntp = prngSuccessor(ntp, 1)) {
        const ks1 = toUint32(nt2 ^ ntp)
        if (nestedIsValidNonce(ntp, nt2, ks1, par)) atks.push({ ntp, ks1 })
      }
    }

    return nestedRecoverState({ uid: castToUint32(opts.uid), atks })
  }

  /**
   * @group Internal
   * @internal
   */
  static nestedIsValidNonce (nt1: number, nt2: number, ks1: number, par: number): boolean {
    const { evenParity8, bit } = Crypto1
    if (evenParity8((nt1 >>> 24) & 0xFF) !== (bit(par, 0) ^ evenParity8((nt2 >>> 24) & 0xFF) ^ bit(ks1, 16))) return false
    if (evenParity8((nt1 >>> 16) & 0xFF) !== (bit(par, 1) ^ evenParity8((nt2 >>> 16) & 0xFF) ^ bit(ks1, 8))) return false
    if (evenParity8((nt1 >>> 8) & 0xFF) !== (bit(par, 2) ^ evenParity8((nt2 >>> 8) & 0xFF) ^ bit(ks1, 0))) return false
    return true
  }

  /**
   * @group Internal
   * @internal
   */
  static lfsrPrefixKs (ks: Buffer, isOdd: boolean): number[] {
    const { bit, filter, toUint32 } = Crypto1
    const candidates: number[] = []
    for (let i = 0; i < 2097152; i++) { // 2**21 = 2097152
      let isCandidate = true
      for (let j = 0; isCandidate && j < 8; j++) {
        const tmp = toUint32(i ^ fastfwd[isOdd ? (8 + j) : j])
        isCandidate = bit(ks[j], isOdd ? 1 : 0) === filter(tmp >>> 1) && bit(ks[j], isOdd ? 3 : 2) === filter(tmp)
      }
      if (isCandidate) candidates.push(i)
    }
    return candidates
  }

  /**
   * helper function which eliminates possible secret states using parity bits
   * @internal
   * @group Internal
   */
  static checkPfxParity (pfx: number, ar: number, par: number[][], odd: number, even: number, isZeroPar: boolean): Crypto1 | undefined {
    const { evenParity32, bit, toUint32 } = Crypto1
    const state = new Crypto1()
    for (let i = 0; i < 8; i++) {
      ;[state.odd, state.even] = [toUint32(odd ^ fastfwd[8 + i]), toUint32(even ^ fastfwd[i])]
      state.lfsrRollbackBit(0, 0)
      state.lfsrRollbackBit(0, 0)
      const ks3 = state.lfsrRollbackBit(0, 0)
      const ks2 = state.lfsrRollbackWord(0, 0)
      const ks1 = state.lfsrRollbackWord(pfx | (i << 5), 1)
      if (isZeroPar) return state

      const nr = toUint32(ks1 ^ (pfx | (i << 5)))
      const arEnc = toUint32(ks2 ^ ar)

      if ((evenParity32(nr & 0x000000FF) ^ par[i][3] ^ bit(ks2, 24)) < 1) return
      if ((evenParity32(arEnc & 0xFF000000) ^ par[i][4] ^ bit(ks2, 16)) < 1) return
      if ((evenParity32(arEnc & 0x00FF0000) ^ par[i][5] ^ bit(ks2, 8)) < 1) return
      if ((evenParity32(arEnc & 0x0000FF00) ^ par[i][6] ^ bit(ks2, 0)) < 1) return
      if ((evenParity32(arEnc & 0x000000FF) ^ par[i][7] ^ ks3) < 1) return
    }
    return state
  }

  /**
   * @group Internal
   * @internal
   */
  static lfsrCommonPrefix (pfx: number, ar: number, ks: Buffer, par: number[][], isZeroPar: boolean): Crypto1[] {
    const { lfsrPrefixKs, checkPfxParity } = Crypto1
    const odds = lfsrPrefixKs(ks, true)
    const evens = lfsrPrefixKs(ks, false)

    const states: Crypto1[] = []
    for (let odd of odds) {
      for (let even of evens) {
        for (let i = 0; i < 64; i++) {
          odd += 2097152
          even += (i & 0x7) > 0 ? 2097152 : 4194304
          const tmp = checkPfxParity(pfx, ar, par, odd, even, isZeroPar)
          if (!_.isNil(tmp)) states.push(tmp)
        }
      }
    }
    return states
  }

  /**
   * Recover the key from the tag with the darkside attack.
   * @param fnAcquire - An async function to acquire the darkside attack data.
   * @param fnCheckKey - An async function to check the key.
   * @param attempts - The maximum number of attempts to try.
   * @returns The recovered key.
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, DarksideStatus, DeviceMode, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const { default: Crypto1 } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.mjs/+esm')
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const block = 0
   *   const keyType = Mf1KeyType.KEY_A
   *   const key = await Crypto1.darkside(
   *     async attempt => {
   *       const accquired = await ultra.cmdMf1AcquireDarkside(block, keyType, attempt === 0)
   *       console.log(_.mapValues(accquired, buf => Buffer.isBuffer(buf) ? buf.toString('hex') : buf))
   *       if (acquired.status === DarksideStatus.LUCKY_AUTH_OK) throw new Error('LUCKY_AUTH_OK')
   *       if (acquired.status !== DarksideStatus.OK) throw new Error('card is not vulnerable to Darkside attack')
   *       return accquired
   *     },
   *     async key => {
   *       return await ultra.cmdMf1CheckBlockKey({ block, keyType, key })
   *     },
   *   )
   *   console.log(`key founded: ${key.toString('hex')}`)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  static async darkside (
    fnAcquire: (attempt: number) => Promise<{ uid: Buffer, nt: Buffer, nr: Buffer, ar: Buffer, par: Buffer, ks: Buffer }>,
    fnCheckKey: (key: Buffer) => Promise<boolean>,
    attempts: number = 256,
  ): Promise<Buffer> {
    const { bit, lfsrCommonPrefix, toUint32 } = Crypto1
    const checkedKeys = new Set<number>()
    let prevKeys = new Set<number>()
    for (let i = 0; i < attempts; i++) {
      const acquired = await fnAcquire(i)

      const [uid, nt, ar] = _.map(['uid', 'nt', 'ar'] as const, k => {
        if (!Buffer.isBuffer(acquired[k]) || acquired[k].length !== 4) throw new TypeError(`Failed to acquire darkside result: invalid ${k}`)
        return acquired[k].readUInt32BE(0)
      })
      if (!Buffer.isBuffer(acquired.nr) || acquired.nr.length !== 4) throw new TypeError('Failed to acquire darkside result: invalid nr')
      const nr = acquired.nr.readUInt32BE(0) & 0xFFFFFF1F
      if (!Buffer.isBuffer(acquired.ks) || acquired.ks.length !== 8) throw new TypeError('Failed to acquire darkside result: invalid ks')
      const ks = new Buffer(_.map(acquired.ks, u8 => u8 & 0x0F))
      if (!Buffer.isBuffer(acquired.par) || acquired.par.length !== 8) throw new TypeError('Failed to acquire darkside result: invalid par')
      const par = _.map(acquired.par, u8 => _.times(8, j => bit(u8, j)))
      const isZeroPar = acquired.par.readBigUInt64BE(0) === 0n
      let keys = new Set<number>()
      const tmp = toUint32(uid ^ nt)

      const states = lfsrCommonPrefix(nr, ar, ks, par, isZeroPar)
      for (const state of states) {
        state.lfsrRollbackWord(tmp, 0)
        keys.add(state.getLfsr())
      }
      if (keys.size === 0) continue // no candidates, need to try with a different reader nonce
      if (isZeroPar) { // no parity bits
        ;[prevKeys, keys] = [keys, prevKeys] // swap
        keys.forEach(key => { if (!prevKeys.has(key)) keys.delete(key) }) // keys intersection
      }
      for (const keyUint32 of [...keys]) {
        if (checkedKeys.has(keyUint32)) continue
        checkedKeys.add(keyUint32)
        const key = new Buffer(6).writeUIntBE(keyUint32, 0, 6)
        if (await fnCheckKey(key)) return key
      }
    }
    throw new Error(`failed to find key, darkside attempts = ${attempts}, keys checked = ${checkedKeys.size}`)
  }
}

;(globalThis as any ?? {}).Crypto1 = Crypto1 // eslint-disable-line @typescript-eslint/prefer-optional-chain

type UInt32Like = Buffer | number | string

interface RecoverContextUint32Array {
  s: number
  d: Uint32Array
}
