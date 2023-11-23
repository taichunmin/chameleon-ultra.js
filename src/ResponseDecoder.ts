import _ from 'lodash'
import { Buffer } from './buffer'
import { type AnimationMode, type ButtonAction, type DarksideStatus, type Mf1EmuWriteMode, type Mf1PrngType, type TagType } from './ChameleonUltra'
import { type Class } from 'utility-types'

function bufUnpackToClass <T> (buf: Buffer, format: string, Type: Class<T>): T {
  return new Type(...buf.unpack<ConstructorParameters<typeof Type>>(format))
}

export class SlotInfo {
  hfTagType: TagType
  lfTagType: TagType

  constructor (hf: TagType, lf: TagType) {
    this.hfTagType = hf
    this.lfTagType = lf
  }

  static fromCmd1019 (buf: Buffer): SlotInfo[] {
    if (!Buffer.isBuffer(buf) || buf.length < 16) throw new TypeError('buf should be a Buffer with length 16')
    return _.times(8, i => bufUnpackToClass(buf.subarray(i * 4), '!HH', SlotInfo))
  }
}

export class SlotFreqIsEnable {
  hf: boolean
  lf: boolean

  constructor (hf: boolean, lf: boolean) {
    ;[this.hf, this.lf] = _.map([hf, lf], Boolean)
  }

  static fromCmd1023 (buf: Buffer): SlotFreqIsEnable[] {
    if (!Buffer.isBuffer(buf) || buf.length < 16) throw new TypeError('buf should be a Buffer with length 16')
    return _.times(8, i => bufUnpackToClass(buf.subarray(i * 2), '!??', SlotFreqIsEnable))
  }
}

export class BatteryInfo {
  voltage: number
  level: number

  constructor (voltage: number, level: number) {
    ;[this.voltage, this.level] = [voltage, level]
  }

  static fromCmd1025 (buf: Buffer): BatteryInfo {
    if (!Buffer.isBuffer(buf) || buf.length !== 3) throw new TypeError('buf should be a Buffer with length 3')
    return bufUnpackToClass(buf, '!HB', BatteryInfo)
  }
}

export class DeviceSettings {
  version: number // version of setting
  animation: AnimationMode
  buttonPressAction: ButtonAction[]
  buttonLongPressAction: ButtonAction[]
  blePairingMode: boolean
  blePairingKey: string

  constructor (
    version: number,
    animation: AnimationMode,
    btnPressA: ButtonAction,
    btnPressB: ButtonAction,
    btnLongPressA: ButtonAction,
    btnLongPressB: ButtonAction,
    blePairingMode: boolean,
    blePairingKey: string
  ) {
    this.version = version
    this.animation = animation
    this.buttonPressAction = [btnPressA, btnPressB]
    this.buttonLongPressAction = [btnLongPressA, btnLongPressB]
    this.blePairingMode = Boolean(blePairingMode)
    this.blePairingKey = blePairingKey
  }

  static fromCmd1034 (buf: Buffer): DeviceSettings {
    if (!Buffer.isBuffer(buf) || buf.length !== 13) throw new TypeError('buf should be a Buffer with length 13')
    return bufUnpackToClass(buf, '!6B?6s', DeviceSettings)
  }
}

/**
 * Class for Hf14aAntiColl Decoding.
 */
export class Hf14aAntiColl {
  uid: Buffer
  atqa: Buffer
  sak: Buffer
  ats: Buffer

  constructor (uid: Buffer, atqa: Buffer, sak: Buffer, ats: Buffer = new Buffer()) {
    ;[this.uid, this.atqa, this.sak, this.ats] = [uid, atqa, sak, ats]
  }

  static fromBuffer (buf: Buffer): Hf14aAntiColl {
    // uidlen[1]|uid[uidlen]|atqa[2]|sak[1]|atslen[1]|ats[atslen]
    const uidLen = buf[0]
    if (buf.length < uidLen + 4) throw new Error('invalid length of uid')
    const atsLen = buf[uidLen + 4]
    if (buf.length < uidLen + atsLen + 5) throw new Error('invalid invalid length of ats')
    return bufUnpackToClass(buf, `!${uidLen + 1}p2ss${atsLen + 1}p`, Hf14aAntiColl)
  }

  static fromCmd2000 (buf: Buffer): Hf14aAntiColl[] {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf should be a Buffer')
    const tags: Hf14aAntiColl[] = []
    while (buf.length > 0) {
      const tag = Hf14aAntiColl.fromBuffer(buf)
      buf = buf.subarray(tag.uid.length + tag.ats.length + 5)
      tags.push(tag)
    }
    return tags
  }
}

export class Mf1AcquireStaticNestedRes {
  uid: Buffer
  atks: Array<{ nt1: Buffer, nt2: Buffer }>

  constructor (uid: Buffer, atks: Array<{ nt1: Buffer, nt2: Buffer }>) {
    ;[this.uid, this.atks] = [uid, atks]
  }

  static fromCmd2003 (buf: Buffer): Mf1AcquireStaticNestedRes {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf should be a Buffer')
    return new Mf1AcquireStaticNestedRes(
      buf.subarray(0, 4), // uid
      _.map(buf.subarray(4).chunk(8), chunk => ({
        nt1: chunk.subarray(0, 4),
        nt2: chunk.subarray(4, 8),
      })), // atks
    )
  }
}

export class Mf1DarksideRes {
  status: DarksideStatus
  uid?: Buffer
  nt?: Buffer
  par?: Buffer
  ks?: Buffer
  nr?: Buffer
  ar?: Buffer

  constructor (
    status: DarksideStatus,
    uid?: Buffer,
    nt?: Buffer,
    par?: Buffer,
    ks?: Buffer,
    nr?: Buffer,
    ar?: Buffer
  ) {
    this.status = status
    this.uid = uid
    this.nt = nt
    this.par = par
    this.ks = ks
    this.nr = nr
    this.ar = ar
  }

  static fromCmd2004 (buf: Buffer): Mf1DarksideRes {
    if (!Buffer.isBuffer(buf) || !_.includes([1, 33], buf.length)) throw new TypeError('buf should be a Buffer with length 1 or 33')
    return bufUnpackToClass(buf, buf.length === 1 ? '!B' : '!B4s4s8s8s4s4s', Mf1DarksideRes)
  }
}

export class Mf1NtDistanceRes {
  uid: Buffer
  dist: Buffer

  constructor (uid: Buffer, dist: Buffer) {
    ;[this.uid, this.dist] = [uid, dist]
  }

  static fromCmd2005 (buf: Buffer): Mf1NtDistanceRes {
    if (!Buffer.isBuffer(buf) || buf.length !== 8) throw new TypeError('buf should be a Buffer with length 8')
    return bufUnpackToClass(buf, '!4s4s', Mf1NtDistanceRes)
  }
}

/** Answer the random number parameters required for Nested attack */
export class Mf1NestedRes {
  nt1: Buffer // Unblocked explicitly random number
  nt2: Buffer // Random number of nested verification encryption
  par: number // The puppet test of the communication process of nested verification encryption, only the 'low 3 digits', that is, the right 3

  constructor (nt1: Buffer, nt2: Buffer, par: number) {
    ;[this.nt1, this.nt2, this.par] = [nt1, nt2, par]
  }

  static fromCmd2006 (buf: Buffer): Mf1NestedRes[] {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf should be a Buffer')
    return _.map(buf.chunk(9), chunk => bufUnpackToClass(chunk, '!4s4sB', Mf1NestedRes))
  }
}

export interface Hf14aTagInfo {
  antiColl: Hf14aAntiColl
  nxpTypeBySak?: string
  prngType?: Mf1PrngType
}

export class Mf1DetectionLog {
  block: number
  isKeyB: boolean
  isNested: boolean
  uid: Buffer
  nt: Buffer
  nr: Buffer
  ar: Buffer

  constructor (
    block: number,
    flags: Buffer,
    uid: Buffer,
    nt: Buffer,
    nr: Buffer,
    ar: Buffer
  ) {
    this.block = block
    this.isKeyB = flags.readBitLSB(0) === 1
    this.isNested = flags.readBitLSB(1) === 1
    this.uid = uid
    this.nt = nt
    this.nr = nr
    this.ar = ar
  }

  static fromBuffer (buf: Buffer): Mf1DetectionLog {
    if (!Buffer.isBuffer(buf) || buf.length < 18) throw new TypeError('buf should be a Buffer with length 18')
    return bufUnpackToClass(buf, '!Bs4s4s4s4s', Mf1DetectionLog)
  }

  static fromCmd4006 (buf: Buffer): Mf1DetectionLog[] {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf should be a Buffer')
    return _.map(buf.chunk(18), Mf1DetectionLog.fromBuffer)
  }
}

export class Mf1EmuSettings {
  detection: boolean
  gen1a: boolean
  gen2: boolean
  antiColl: boolean
  write: Mf1EmuWriteMode

  constructor (detection: boolean, gen1a: boolean, gen2: boolean, antiColl: boolean, write: Mf1EmuWriteMode) {
    this.detection = detection
    this.gen1a = gen1a
    this.gen2 = gen2
    this.antiColl = antiColl
    this.write = write
  }

  static fromCmd4009 (buf: Buffer): Mf1EmuSettings {
    if (!Buffer.isBuffer(buf) || buf.length !== 5) throw new TypeError('buf should be a Buffer with length 5')
    return bufUnpackToClass(buf, '!4?B', Mf1EmuSettings)
  }
}

export interface Mf1EmuData {
  antiColl: Hf14aAntiColl
  settings: Mf1EmuSettings
  body: Buffer
}

export interface SlotSettings {
  config: { activated: number }
  group: Array<{
    hfIsEnable: boolean
    hfTagType: TagType
    lfIsEnable: boolean
    lfTagType: TagType
  }>
}
