/**
 * @module pn532.js/Crypto1
 * @example
 * import Crypto1 from 'pn532.js/Crypto1'
 */
import _ from 'lodash'
import { Buffer } from './buffer'

const LF_POLY_ODD = 0x29CE5C
const LF_POLY_EVEN = 0x870804
const swapEndianTmp = new DataView(new ArrayBuffer(4))

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

/**
 * JavaScript implementation of the Crypto1 cipher. This script should be load after the PN532 Core script.
 * @param {object} [args={}] args
 * @param {number} args.even The even bits of lfsr.
 * @param {number} args.odd The odd bits of lfsr.
 * @see {@link https://github.com/RfidResearchGroup/proxmark3/tree/master/tools/mfkey|mfkey source code from RfidResearchGroup/proxmark3}
 * @example
 * const { Crypto1 } = window
 *
 * const state1 = new Crypto1()
 * const state2 = new Crypto1({ even: 0, odd: 0 })
 */
export default class Crypto1 {
  even: number = 0
  odd: number = 0

  constructor ({ even = 0, odd = 0 }: { even?: number, odd?: number } = {}) {
    if (!_.isNil(even) && !_.isNil(odd)) {
      ;[this.even, this.odd] = [even, odd]
    }
  }

  /**
   * Reset the internal lfsr.
   * @returns {this} `this`
   * @example
   * const { Crypto1 } = window
   *
   * const state1 = new Crypto1({ even: 1, odd: 1 })
   * state1.reset()
   */
  reset (): this {
    ;[this.odd, this.even] = [0, 0]
    return this
  }

  /**
   * Set the internal lfsr with the key.
   * @param {Buffer} key The key to set the internal lfsr.
   * @returns {this} `this`
   * @example
   * const { Crypto1, Pn532: { Buffer } } = window
   *
   * const state1 = new Crypto1()
   * state1.setLfsr(new Buffer('FFFFFFFFFFFF'))
   */
  setLfsr (key: Buffer): this {
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key must be 6 bytes')
    this.reset()
    for (let i = 47; i > 0; i -= 2) {
      ;[this.odd, this.even] = [
        (this.odd << 1) | key.readBitLSB((i - 1) ^ 7),
        (this.even << 1) | key.readBitLSB(i ^ 7),
      ]
    }
    return this
  }

  /**
   * Get the internal lfsr.
   * @returns {Buffer} The internal lfsr.
   * @example
   * const { Crypto1, Pn532: { Buffer } } = window
   *
   * const state1 = new Crypto1()
   * console.log(state1.setLfsr(new Buffer('FFFFFFFFFFFF')).getLfsr().hex) // 'FFFFFFFFFFFF'
   */
  getLfsr (): Buffer {
    const { bit } = Crypto1
    const lfsr = new Buffer(6)
    for (let i = 23; i >= 0; i--) {
      lfsr.writeBitMSB(46 - 2 * i, bit(this.odd, i ^ 3))
      lfsr.writeBitMSB(47 - 2 * i, bit(this.even, i ^ 3))
    }
    return lfsr
  }

  /**
   * Get the lfsr output bit and update lfsr by input bit.
   * @param {number} input The input bit.
   * @param {number} isEncrypted Indicates whether the input bit is encrypted or not.
   * @returns {number} The lfsr output bit.
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
   * @param {number} input The input byte.
   * @param {number} isEncrypted Indicates whether the input byte is encrypted or not.
   * @returns {number} The lfsr output byte.
   */
  lfsrByte (input: number, isEncrypted: number): number {
    const { bit } = Crypto1
    let ret = 0
    for (let i = 0; i < 8; i++) ret |= this.lfsrBit(bit(input, i), isEncrypted) << i
    return ret
  }

  /**
   * Get the lfsr 32-bit output word and update lfsr by 32-bit input word.
   * @param {number} input The 32-bit input word.
   * @param {number} isEncrypted Indicates whether the 32-bit input word is encrypted or not.
   * @returns {number} The lfsr 32-bit output word.
   */
  lfsrWord (input: number, isEncrypted: number): number {
    const { beBit } = Crypto1
    const u32 = new Uint32Array([0])
    for (let i = 0; i < 32; i++) u32[0] |= this.lfsrBit(beBit(input, i), isEncrypted) << (i ^ 24)
    return u32[0]
  }

  /**
   * Rollback the lfsr in order to get previous states
   * @param {number} input The input bit.
   * @param {number} isEncrypted Indicates whether the input bit is encrypted or not.
   * @returns {number} The lfsr output bit.
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
   * @param {number} input The input byte.
   * @param {number} isEncrypted Indicates whether the input byte is encrypted or not.
   * @returns {number} The lfsr output byte.
   */
  lfsrRollbackByte (input: number, isEncrypted: number): number {
    const { bit } = Crypto1
    let ret = 0
    for (let i = 7; i >= 0; i--) ret |= this.lfsrRollbackBit(bit(input, i), isEncrypted) << i
    return ret
  }

  /**
   * Rollback the lfsr in order to get previous states
   * @param {number} input The 32-bit input word.
   * @param {number} isEncrypted Indicates whether the 32-bit input word is encrypted or not.
   * @returns {number} The lfsr 32-bit output word.
   */
  lfsrRollbackWord (input: number, isEncrypted: number): number {
    const { beBit } = Crypto1
    const u32 = new Uint32Array(1)
    for (let i = 31; i >= 0; i--) u32[0] |= this.lfsrRollbackBit(beBit(input, i), isEncrypted) << (i ^ 24)
    return u32[0]
  }

  /**
   * Get bit of the unsigned reversed endian 32-bit integer `x` at position `n`.
   * @param {number} x The reversed endian unsigned 32-bit integer.
   * @param {number} n The bit position.
   * @returns {number} The bit at position `n`.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.beBit(0x01000000, 0)) // 1
   */
  static beBit (x: number, n: number): number { return Crypto1.bit(x, n ^ 24) }

  /**
   * Get bit of the unsigned 32-bit integer `x` at position `n`.
   * @param {number} x The unsigned 32-bit integer.
   * @param {number} n The bit position.
   * @returns {number} The bit at position `n`.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.bit(0x1, 0)) // 1
   */
  static bit (x: number, n: number): number { return Crypto1.toBit(x >>> n) }

  /**
   * Cast the number `x` to bit.
   * @param {number} x The number.
   * @returns {number} The casted bit.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.toBit(1)) // 1
   * console.log(Crypto1.toBit(2)) // 0
   */
  static toBit (x: number): number { return x & 1 }

  /**
   * Indicates whether the number is truly or not.
   * @param {number} x The number.
   * @returns {number} Return `1` if the number is not falsey, otherwise return `0`.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.toBool(1)) // 1
   * console.log(Crypto1.toBool(2)) // 1
   */
  static toBool (x: number): number { return x !== 0 ? 1 : 0 }

  /**
   * Cast the number `x` to unsigned 24-bit integer.
   * @param {number} x The number.
   * @returns {number} The casted unsigned 24-bit integer.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.toUint24(-1).toString(16)) // 'ffffff'
   */
  static toUint24 (x: number): number { return x & 0xFFFFFF }

  /**
   * Cast the number `x` to unsigned 32-bit integer.
   * @param {number} x The number.
   * @returns {number} The casted unsigned 32-bit integer.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.toUint32(-1).toString(16)) // 'ffffffff'
   */
  static toUint32 (x: number): number { return x >>> 0 }

  /**
   * Cast the number `x` to unsigned 8-bit integer.
   * @param {number} x The number.
   * @returns {number} The casted unsigned 8-bit integer.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.toUint8(-1).toString(16)) // 'ff'
   */
  static toUint8 (x: number): number { return x & 0xFF }

  /**
   * The filter function of Crypto1.
   * @param {number} x The unsigned 32-bit integer.
   * @returns {number} The filtered bit.
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
   * @param {number} x The unsigned 8-bit integer.
   * @returns {number} The even parity of `x`.
   */
  static evenParity8 (x: number): number {
    x ^= x >>> 4
    x ^= x >>> 2
    return Crypto1.toBit(x ^ (x >>> 1))
  }

  /**
   * Return the even parity of the unsigned 32-bit integer `x`.
   * @param {number} x The unsigned 32-bit integer.
   * @returns {number} The even parity of `x`.
   */
  static evenParity32 (x: number): number {
    x ^= x >>> 16
    return Crypto1.evenParity8(x ^ (x >>> 8))
  }

  /**
   * Swap endian of the unsigned 32-bit integer `x`.
   * @param {number} x The unsigned 32-bit integer.
   * @returns {number} The unsigned 32-bit integer after swap endian.
   * @example
   * const { Crypto1 } = window
   *
   * console.log(Crypto1.swapEndian(0x12345678).toString(16)) // '78563412'
   */
  static swapEndian (x: number): number {
    swapEndianTmp.setUint32(0, x, false)
    return swapEndianTmp.getUint32(0, true)
  }

  /**
   * Generate the new prng state from the current prng state `x` by `n` times.
   * @param {number} x The current prng state.
   * @param {number} n The number of times to generate the new prng state.
   * @returns {number} The new prng state.
   */
  static prngSuccessor (x: number, n: number): number {
    const { swapEndian } = Crypto1
    x = swapEndian(x)
    while ((n--) !== 0) x = x >>> 1 | (x >>> 16 ^ x >>> 18 ^ x >>> 19 ^ x >>> 21) << 31
    return swapEndian(x)
  }

  /**
   * A helper function to calculates the partial linear feedback contributions and puts in MSB (Most Significant Bit).
   * @param {number} item The input number.
   * @param {number} mask1
   * @param {number} mask2
   * @returns {number}
   */
  static updateContribution (item: number, mask1: number, mask2: number): number {
    const { evenParity32, toUint32 } = Crypto1
    let p = item >>> 25
    p = p << 1 | evenParity32(item & mask1)
    p = p << 1 | evenParity32(item & mask2)
    return toUint32(p << 24 | item & 0xFFFFFF)
  }

  /**
   * Using a bit of the keystream extend the table of possible lfsr states. (complex version)
   * @param {Uint32Array} tbl An array of the even/odd bits of lfsr.
   * @param {number} size Size of array.
   * @param {number} bit The bit of the keystream.
   * @param {number} m1 mask1
   * @param {number} m2 mask2
   * @param {number} input The value that was fed into the lfsr at the time the keystream was generated.
   * @returns {number} The new size of array.
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
   * @param {Uint32Array} tbl An array of the even/odd bits of lfsr.
   * @param {number} size Size of array.
   * @param {number} bit The bit of the keystream.
   * @returns {number} The new size of array.
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
   * @param {object} ctx
   * @param {object} ctx.evens The array of even bits of possible lfsr states.
   * @param {object} ctx.odds The array of odd bits of possible lfsr states.
   * @param {Crypto1[]} ctx.states The array of recovered lfsr states.
   */
  static recover (ctx: RecoverContext): void {
    const { evenParity32, extendTable, recover, toBit, toBool, toUint32 } = Crypto1
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
      if (oddBucket === evenBucket) {
        const [evenStart, oddStart] = [
          _.sortedIndex(evens.d.subarray(0, evens.s), oddBucket),
          _.sortedIndex(odds.d.subarray(0, odds.s), evenBucket),
        ]
        recover({
          ...ctx,
          evens: {
            d: new Uint32Array(evens.d.buffer, evens.d.byteOffset + evenStart * 4),
            s: evens.s - evenStart,
          },
          odds: {
            d: new Uint32Array(odds.d.buffer, odds.d.byteOffset + oddStart * 4),
            s: odds.s - oddStart,
          },
        })
        ;[evens.s, odds.s] = [evenStart, oddStart]
      } else if (oddBucket > evenBucket) {
        odds.s = _.sortedIndex(odds.d.subarray(0, odds.s), oddBucket)
      } else {
        evens.s = _.sortedIndex(evens.d.subarray(0, evens.s), evenBucket)
      }
    }
  }

  /**
   * Recover the state of the lfsr given 32 bits of the keystream.
   * Additionally you can use the in parameter to specify the value that was fed into the lfsr at the time the keystream was generated
   * @param {number} ks2
   * @param {number} input
   * @returns {Crypto1[]} The array of recovered lfsr states.
   */
  static lfsrRecovery32 (ks2: number, input: number): Crypto1[] {
    const { beBit, extendTableSimple, filter, recover, swapEndian, toBit, toUint32 } = Crypto1
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

    input = swapEndian(input) // swap endian
    recover({ eks, evens, odds, oks, states, rem: 11, input: input << 1 })
    return states
  }

  /**
   * Reverse 64 bits of keystream into possible lfsr states.
   * Variation mentioned in the paper. Somewhat optimized version
   * @param {number} ks2 keystream 2
   * @param {number} ks3 keystream 3
   * @returns {Crypto1} The recovered lfsr state.
   */
  static lfsrRecovery64 (ks2: number, ks3: number): Crypto1 | undefined {
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
  }

  /**
   * Recover the key with the two authentication attempts from reader.
   * @param {object} args
   * @param {number|Buffer|string} args.uid The 4-bytes uid in the authentication attempt.
   * @param {number|Buffer|string} args.nt0 The nonce from tag in the first authentication attempt.
   * @param {number|Buffer|string} args.nr0 The calculated nonce response from reader in the first authentication attempt.
   * @param {number|Buffer|string} args.ar0 The random challenge from reader in the first authentication attempt.
   * @param {number|Buffer|string} args.nt1 The nonce from tag in the second authentication attempt.
   * @param {number|Buffer|string} args.nr1 The calculated nonce response from reader in the second authentication attempt.
   * @param {number|Buffer|string} args.ar1 The random challenge from reader in the second authentication attempt.
   * @returns {Buffer} The recovered key.
   * @example
   * const { Crypto1, Pn532: { Buffer } } = window
   *
   * console.log(Crypto1.mfkey32v2({
   *   uid: 0x65535D33,
   *   nt0: 0xCB7B9ED9,
   *   nr0: 0x5A8FFEC6,
   *   ar0: 0x5C7C6F89,
   *   nt1: 0x1E6D9228,
   *   nr1: 0x6FB8B4A8,
   *   ar1: 0xEF4039FB,
   * }).hex) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: Buffer.fromHex('65535D33'),
   *   nt0: Buffer.fromHex('CB7B9ED9'),
   *   nr0: Buffer.fromHex('5A8FFEC6'),
   *   ar0: Buffer.fromHex('5C7C6F89'),
   *   nt1: Buffer.fromHex('1E6D9228'),
   *   nr1: Buffer.fromHex('6FB8B4A8'),
   *   ar1: Buffer.fromHex('EF4039FB'),
   * }).hex) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: '65535D33',
   *   nt0: 'CB7B9ED9',
   *   nr0: '5A8FFEC6',
   *   ar0: '5C7C6F89',
   *   nt1: '1E6D9228',
   *   nr1: '6FB8B4A8',
   *   ar1: 'EF4039FB',
   * }).hex) // A9AC67832330
   */
  static mfkey32v2 (args: Mfkey32v2Args): Buffer {
    const [uid, nt0, nr0, ar0, nt1, nr1, ar1] = _.map(['uid', 'nt0', 'nr0', 'ar0', 'nt1', 'nr1', 'ar1'] as Array<keyof Mfkey32v2Args>, k => castToInteger(args[k]))
    const { lfsrRecovery32, prngSuccessor, toUint32 } = Crypto1
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
      if (toUint32(state.lfsrWord(0, 0) ^ p641) === ar1) return key
    }
    throw new Error('failed to recover key')
  }

  /**
   * Recover the key with the successfully authentication between the reader and the tag.
   * @param {object} args
   * @param {number|Buffer|string} args.uid The 4-bytes uid in the authentication.
   * @param {number|Buffer|string} args.nt The nonce from tag in the authentication.
   * @param {number|Buffer|string} args.nr The calculated response of `args.nt` from reader in the authentication.
   * @param {number|Buffer|string} args.ar The random challenge from reader in the authentication.
   * @param {number|Buffer|string} args.at The calculated response of `args.ar` from tag in the authentication.
   * @returns {Buffer} The recovered key.
   * @example
   * const { Crypto1, Pn532: { Buffer } } = window
   *
   * console.log(Crypto1.mfkey32v2({
   *   uid: 0x65535D33,
   *   nt: 0x2C198BE4,
   *   nr: 0xFEDAC6D2,
   *   ar: 0xCF0A3C7E,
   *   at: 0xF4A81AF8,
   * }).hex) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: Buffer.fromHex('65535D33'),
   *   nt: Buffer.fromHex('2C198BE4'),
   *   nr: Buffer.fromHex('FEDAC6D2'),
   *   ar: Buffer.fromHex('CF0A3C7E'),
   *   at: Buffer.fromHex('F4A81AF8'),
   * }).hex) // A9AC67832330
   * console.log(Crypto1.mfkey32v2({
   *   uid: '65535D33',
   *   nt: '2C198BE4',
   *   nr: 'FEDAC6D2',
   *   ar: 'CF0A3C7E',
   *   at: 'F4A81AF8',
   * }).hex) // A9AC67832330
   */
  static mfkey64 (args: Mfkey64Args): Buffer {
    const [uid, nt, nr, ar, at] = _.map(['uid', 'nt', 'nr', 'ar', 'at'] as Array<keyof Mfkey64Args>, k => castToInteger(args[k]))
    const { lfsrRecovery64, prngSuccessor } = Crypto1
    const p64 = prngSuccessor(nt, 64)
    const [ks2, ks3] = [ar ^ p64, at ^ prngSuccessor(p64, 32)]
    const state = lfsrRecovery64(ks2, ks3)
    if (_.isNil(state)) throw new Error('failed to recover key')

    state.lfsrRollbackWord(0, 0)
    state.lfsrRollbackWord(0, 0)
    state.lfsrRollbackWord(nr, 1)
    state.lfsrRollbackWord(uid ^ nt, 0)
    return state.getLfsr()
  }

  /**
   * Decrypt the data.
   * @param {object} args
   * @param {number|Buffer|string} args.nr The calculated response of `args.nt` from reader in the authentication.
   * @param {number|Buffer|string} args.nt The nonce from tag in the authentication.
   * @param {number|Buffer|string} args.uid The 4-bytes uid in the authentication.
   * @param {Buffer} args.data The encrypted data.
   * @param {Buffer} args.key The 6-bytes key to decrypt the data.
   * @returns {Buffer} The decrypted data.
   */
  static decrypt (args: DecryptArgs): Buffer {
    if (!Buffer.isBuffer(args.key) || args.key.length !== 6) throw new TypeError('invalid args.key')
    if (!Buffer.isBuffer(args.data)) throw new TypeError('invalid args.data')
    const [uid, nt, nr] = _.map(['uid', 'nt', 'nr'] as Array<'uid' | 'nt' | 'nr'>, k => castToInteger(args[k]))
    const data = args.data.slice() // clone data

    const state = new Crypto1()
    state.setLfsr(args.key)
    state.lfsrWord(uid ^ nt, 0)
    state.lfsrWord(nr, 1)
    for (let i = 0; i < 2; i++) state.lfsrWord(0, 0)

    for (let i = 0; i < data.length; i++) data[i] ^= state.lfsrByte(0, 0)
    return data
  }
}

function castToInteger (x: number | Buffer | string): number {
  if (_.isSafeInteger(x)) return x as number
  if (_.isString(x)) return Buffer.from(x, 'hex').readUInt32BE(0)
  return Buffer.from(x as any).readUInt32BE(0)
}

export interface RecoverContext {
  eks: number
  evens: RecoverContextUint32Array
  input: number
  odds: RecoverContextUint32Array
  oks: number
  rem: number
  states: Crypto1[]
}

export interface RecoverContextUint32Array {
  s: number
  d: Uint32Array
}

export interface Mfkey32v2Args {
  uid: Buffer | number | string
  nt0: Buffer | number | string
  nr0: Buffer | number | string
  ar0: Buffer | number | string
  nt1: Buffer | number | string
  nr1: Buffer | number | string
  ar1: Buffer | number | string
}

export interface Mfkey64Args {
  uid: Buffer | number | string
  nt: Buffer | number | string
  nr: Buffer | number | string
  ar: Buffer | number | string
  at: Buffer | number | string
}

export interface DecryptArgs {
  uid: Buffer | number | string
  nt: Buffer | number | string
  nr: Buffer | number | string
  data: Buffer
  key: Buffer
}
