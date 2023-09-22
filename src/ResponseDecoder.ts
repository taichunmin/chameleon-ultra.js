import _ from 'lodash'
import { Buffer } from './buffer'
import { DarksideStatus, type AnimationMode, type ButtonAction, type EmuMf1WriteMode, type Mf1PrngType, type TagType } from './ChameleonUltra'

export class SlotInfo {
  hfTagType: TagType
  lfTagType: TagType

  constructor (hf: TagType, lf: TagType) {
    this.hfTagType = hf
    this.lfTagType = lf
  }

  static fromCmd1019 (buf: Buffer): SlotInfo[] {
    if (!Buffer.isBuffer(buf) || buf.length < 8) throw new TypeError('buf should be a Buffer with length 8')
    return _.times(8, i => new SlotInfo(
      buf[i * 2], // hfTagType
      buf[i * 2 + 1], // lfTagType
    ))
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

  static fromCmd2000 (buf: Buffer): Hf14aAntiColl {
    if (!Buffer.isBuffer(buf) || buf.length !== 15) throw new TypeError('buf should be a Buffer with length 15')
    return new Hf14aAntiColl(
      buf.subarray(0, buf[10]), // uid
      buf.subarray(13, 15), // atqa
      buf.subarray(12, 13), // sak
    )
  }

  static fromCmd4018 (buf: Buffer): Hf14aAntiColl {
    if (!Buffer.isBuffer(buf) || buf.length !== 16) throw new TypeError('buf should be a Buffer with length 16')
    return new Hf14aAntiColl(
      buf.subarray(0, buf[10]), // uid
      buf.subarray(13, 15), // atqa
      buf.subarray(12, 13), // sak
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
    if (!Buffer.isBuffer(buf) || buf.length !== 32) throw new TypeError('buf should be a Buffer with length 32')
    return new Mf1DarksideArgs(
      DarksideStatus.OK, // status
      buf.subarray(0, 4), // uid
      buf.subarray(4, 8), // nt1
      buf.subarray(8, 16), // par
      buf.subarray(16, 24), // ks1
      buf.subarray(24, 28), // nr
      buf.subarray(28, 32), // ar
    )
  }
}

export class Mf1NtDistanceArgs {
  uid: Buffer
  distance: Buffer

  constructor (uid: Buffer, distance: Buffer) {
    ;[this.uid, this.distance] = [uid, distance]
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
export class Mf1NestedArgs {
  nt1: Buffer // Unblocked explicitly random number
  nt2: Buffer // Random number of nested verification encryption
  par: number // The puppet test of the communication process of nested verification encryption, only the 'low 3 digits', that is, the right 3

  constructor (nt1: Buffer, nt2: Buffer, par: number) {
    ;[this.nt1, this.nt2, this.par] = [nt1, nt2, par]
  }

  static fromCmd2006 (buf: Buffer): Mf1NestedArgs[] {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf should be a Buffer')
    return _.map(buf.chunk(9), chunk => new Mf1NestedArgs(
      chunk.subarray(0, 4), // nt1
      chunk.subarray(4, 8), // nt2
      chunk[8], // par
    ))
  }
}

export interface Hf14aTagInfo {
  nxpTypeBySak?: string
  prngType?: Mf1PrngType
  tag: Hf14aAntiColl
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
  blockAntiColl: boolean
  write: EmuMf1WriteMode

  constructor (detection: boolean, gen1a: boolean, gen2: boolean, blockAntiColl: boolean, write: EmuMf1WriteMode) {
    this.detection = detection
    this.gen1a = gen1a
    this.gen2 = gen2
    this.blockAntiColl = blockAntiColl
    this.write = write
  }

  static fromCmd4009 (buf: Buffer): Mf1EmuSettings {
    if (!Buffer.isBuffer(buf) || buf.length !== 5) throw new TypeError('buf should be a Buffer with length 5')
    return new Mf1EmuSettings(
      buf[0] === 1, // detection
      buf[1] === 1, // gen1a
      buf[2] === 1, // gen2
      buf[3] === 1, // blockAntiColl
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
    enable: boolean
    hfTagType: TagType
    lfTagType: TagType
  }>
}
