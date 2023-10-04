import _ from 'lodash'
import { Buffer } from './buffer'
import { type AnimationMode, type ButtonAction, type DarksideStatus, type EmuMf1WriteMode, type Mf1PrngType, type TagType } from './ChameleonUltra'

export class SlotInfo {
  hfTagType: TagType
  lfTagType: TagType

  constructor (hf: TagType, lf: TagType) {
    this.hfTagType = hf
    this.lfTagType = lf
  }

  static fromCmd1019 (buf: Buffer): SlotInfo[] {
    if (!Buffer.isBuffer(buf) || buf.length < 16) throw new TypeError('buf should be a Buffer with length 16')
    return _.times(8, i => new SlotInfo(
      buf.readUInt16BE(i * 4), // hfTagType
      buf.readUInt16BE(i * 4 + 2), // lfTagType
    ))
  }
}

export class SlotFreqIsEnable {
  hf: boolean
  lf: boolean

  constructor (hf: boolean, lf: boolean) {
    ;[this.hf, this.lf] = [hf, lf]
  }

  static fromCmd1023 (buf: Buffer): SlotFreqIsEnable[] {
    if (!Buffer.isBuffer(buf) || buf.length < 16) throw new TypeError('buf should be a Buffer with length 16')
    return _.times(8, i => new SlotFreqIsEnable(buf[i << 1] === 1, buf[(i << 1) + 1] === 1))
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
    return new BatteryInfo(
      buf.readUInt16BE(0), // voltage
      buf[2], // level
    )
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
    buttonPressAction: ButtonAction[],
    buttonLongPressAction: ButtonAction[],
    blePairingMode: boolean,
    blePairingKey: string
  ) {
    this.version = version
    this.animation = animation
    this.buttonPressAction = buttonPressAction
    this.buttonLongPressAction = buttonLongPressAction
    this.blePairingMode = blePairingMode
    this.blePairingKey = blePairingKey
  }

  static fromCmd1034 (buf: Buffer): DeviceSettings {
    if (!Buffer.isBuffer(buf) || buf.length !== 12) throw new TypeError('buf should be a Buffer with length 12')
    return new DeviceSettings(
      buf[0], // version
      buf[1], // animation
      [...buf.subarray(2, 4).values()], // buttonPressAction
      [...buf.subarray(4, 6).values()], // buttonLongPressAction
      buf[6] === 1, // blePairingMode
      buf.subarray(7, 13).toString('utf8'), // blePairingKey
    )
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
    return new Hf14aAntiColl(
      buf.subarray(1, uidLen + 1),
      buf.subarray(uidLen + 1, uidLen + 3),
      buf.subarray(uidLen + 3, uidLen + 4),
      buf.subarray(uidLen + 5, uidLen + atsLen + 5),
    )
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
  nts: Array<{ nt1: Buffer, nt2: Buffer }>

  constructor (uid: Buffer, nts: Array<{ nt1: Buffer, nt2: Buffer }>) {
    ;[this.uid, this.nts] = [uid, nts]
  }

  static fromCmd2003 (buf: Buffer): Mf1AcquireStaticNestedRes {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf should be a Buffer')
    return new Mf1AcquireStaticNestedRes(
      buf.subarray(0, 4), // uid
      _.map(buf.subarray(4).chunk(8), chunk => ({
        nt1: chunk.subarray(0, 4),
        nt2: chunk.subarray(4, 8),
      })), // nts
    )
  }
}

export class Mf1DarksideArgs {
  status: DarksideStatus
  uid?: Buffer
  nt1?: Buffer
  par?: Buffer
  ks1?: Buffer
  nr?: Buffer
  ar?: Buffer

  constructor (
    status: DarksideStatus,
    uid?: Buffer,
    nt1?: Buffer,
    par?: Buffer,
    ks1?: Buffer,
    nr?: Buffer,
    ar?: Buffer
  ) {
    this.status = status
    this.uid = uid
    this.nt1 = nt1
    this.par = par
    this.ks1 = ks1
    this.nr = nr
    this.ar = ar
  }

  static fromCmd2004 (buf: Buffer): Mf1DarksideArgs {
    if (!Buffer.isBuffer(buf) || !_.includes([1, 33], buf.length)) throw new TypeError('buf should be a Buffer with length 1 or 33')
    if (buf.length === 1) return new Mf1DarksideArgs(buf[0])
    return new Mf1DarksideArgs(
      buf[0], // status
      buf.subarray(1, 5), // uid
      buf.subarray(5, 9), // nt1
      buf.subarray(9, 17), // par
      buf.subarray(17, 25), // ks1
      buf.subarray(25, 29), // nr
      buf.subarray(29, 33), // ar
    )
  }
}

export class Mf1NtDistanceArgs {
  uid: Buffer
  dist: Buffer

  constructor (uid: Buffer, dist: Buffer) {
    ;[this.uid, this.dist] = [uid, dist]
  }

  static fromCmd2005 (buf: Buffer): Mf1NtDistanceArgs {
    if (!Buffer.isBuffer(buf) || buf.length !== 8) throw new TypeError('buf should be a Buffer with length 8')
    return new Mf1NtDistanceArgs(
      buf.subarray(0, 4), // uid
      buf.subarray(4, 8), // distance
    )
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
    return _.map(buf.chunk(9), chunk => new Mf1NestedRes(
      chunk.subarray(0, 4), // nt1
      chunk.subarray(4, 8), // nt2
      chunk[8], // par
    ))
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
    isKeyB: boolean,
    isNested: boolean,
    uid: Buffer,
    nt: Buffer,
    nr: Buffer,
    ar: Buffer
  ) {
    this.block = block
    this.isKeyB = isKeyB
    this.isNested = isNested
    this.uid = uid
    this.nt = nt
    this.nr = nr
    this.ar = ar
  }

  static fromBuffer (buf: Buffer): Mf1DetectionLog {
    if (!Buffer.isBuffer(buf) || buf.length < 18) throw new TypeError('buf should be a Buffer with length 18')
    const flag = buf.subarray(1, 2)
    return new Mf1DetectionLog(
      buf[0], // block
      flag.readBitLSB(0) === 1, // isKeyB
      flag.readBitLSB(1) === 1, // isNested
      buf.subarray(2, 6), // uid
      buf.subarray(6, 10), // nt
      buf.subarray(10, 14), // nr
      buf.subarray(14, 18), // ar
    )
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
  write: EmuMf1WriteMode

  constructor (detection: boolean, gen1a: boolean, gen2: boolean, antiColl: boolean, write: EmuMf1WriteMode) {
    this.detection = detection
    this.gen1a = gen1a
    this.gen2 = gen2
    this.antiColl = antiColl
    this.write = write
  }

  static fromCmd4009 (buf: Buffer): Mf1EmuSettings {
    if (!Buffer.isBuffer(buf) || buf.length !== 5) throw new TypeError('buf should be a Buffer with length 5')
    return new Mf1EmuSettings(
      buf[0] === 1, // detection
      buf[1] === 1, // gen1a
      buf[2] === 1, // gen2
      buf[3] === 1, // antiColl
      buf[4], // write
    )
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
