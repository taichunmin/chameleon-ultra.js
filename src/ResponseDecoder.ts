import _ from 'lodash'
import { Buffer } from './buffer'
import { type ButtonAction, type TagType, type EmuMf1WriteMode, type Mf1NtLevel } from './ChameleonUltra'

/**
 * Decode the response from Chameleon Ultra.
 * @internal
 * @group Internal
 */
export class ResponseDecoder { // eslint-disable-line @typescript-eslint/no-extraneous-class
  static parsePicc14aTag (buf: Buffer): Picc14aTag {
    if (!Buffer.isBuffer(buf) || buf.length !== 15) throw new TypeError('buf should be a Buffer with length 15')
    return {
      uid: buf.subarray(0, buf[10]),
      cascade: buf[11],
      sak: buf.subarray(12, 13),
      atqa: buf.subarray(13, 15),
    }
  }

  static parseMf1Detection (buf: Buffer): Mf1Detection {
    if (!Buffer.isBuffer(buf) || buf.length !== 18) throw new TypeError('buf should be a Buffer with length 18')
    return {
      block: buf[0],
      isKeyB: buf.subarray(1, 2).readBitLSB(0) === 1,
      isNested: buf.subarray(1, 2).readBitLSB(1) === 1,
      uid: buf.subarray(2, 6),
      nt: buf.subarray(6, 10),
      nr: buf.subarray(10, 14),
      ar: buf.subarray(14, 18),
    }
  }

  static parseEmuMf1AntiColl (buf: Buffer): EmuMf1AntiColl {
    if (!Buffer.isBuffer(buf) || buf.length !== 16) throw new TypeError('buf should be a Buffer with length 16')
    return {
      atqa: buf.subarray(13, 15),
      sak: buf.subarray(12, 13),
      uid: buf.subarray(0, buf[10]),
    }
  }

  static parseEmuMf1Config (buf: Buffer): EmuMf1Config {
    if (!Buffer.isBuffer(buf) || buf.length !== 5) throw new TypeError('buf should be a Buffer with length 5')
    return {
      detection: buf[0] === 1,
      gen1a: buf[1] === 1,
      gen2: buf[2] === 1,
      block0AntiColl: buf[3] === 1,
      write: buf[4],
    }
  }

  static parseBatteryInfo (buf: Buffer): BatteryInfo {
    if (!Buffer.isBuffer(buf) || buf.length !== 3) throw new TypeError('buf should be a Buffer with length 3')
    return {
      voltage: buf.readUInt16BE(0),
      level: buf[2],
    }
  }

  static parseSlotInfo (buf: Buffer): SlotInfo[] {
    if (!Buffer.isBuffer(buf) || buf.length !== 16) throw new TypeError('buf should be a Buffer with length 16')
    return _.times(8, i => ({
      hfTagType: buf[2 * i],
      lfTagType: buf[2 * i + 1],
    }))
  }

  static parseMf1NtDistance (buf: Buffer): Mf1NtDistance {
    if (!Buffer.isBuffer(buf) || buf.length !== 8) throw new TypeError('buf should be a Buffer with length 8')
    return {
      uid: buf.subarray(0, 4),
      distance: buf.subarray(4, 8),
    }
  }

  static parseMf1NestedCore (buf: Buffer): Mf1NestedCore {
    if (!Buffer.isBuffer(buf) || buf.length !== 9) throw new TypeError('buf should be a Buffer with length 9')
    return {
      nt1: buf.subarray(0, 4),
      nt2: buf.subarray(4, 8),
      par: buf.subarray(8, 9),
    }
  }

  static parseMf1DarksideCore (buf: Buffer): Mf1DarksideCore {
    if (!Buffer.isBuffer(buf) || buf.length !== 32) throw new TypeError('buf should be a Buffer with length 32')
    return {
      uid: buf.subarray(0, 4),
      nt: buf.subarray(4, 8),
      pars: buf.subarray(8, 16),
      kses: buf.subarray(16, 24),
      nr: buf.subarray(24, 28),
      ar: buf.subarray(28, 32),
    }
  }

  static parseDeviceSettings (buf: Buffer): DeviceSettings {
    if (!Buffer.isBuffer(buf) || buf.length !== 12) throw new TypeError('buf should be a Buffer with length 12')
    return {
      version: buf[0], // version of setting
      animation: buf[1],
      buttonPressAction: [...buf.subarray(2, 4).values()],
      buttonLongPressAction: [...buf.subarray(4, 6).values()],
      blePairingMode: buf[6] === 1,
      blePairingKey: buf.subarray(7, 13).toString('utf8'),
    }
  }
}

export interface Hf14aInfoResp {
  tag: Picc14aTag
  mifare?: {
    prngAttack: Mf1NtLevel
  }
}

export interface Picc14aTag {
  uid: Buffer
  cascade: number
  sak: Buffer
  atqa: Buffer
}

export interface Mf1Detection {
  block: number
  isKeyB: boolean
  isNested: boolean
  uid: Buffer
  nt: Buffer
  nr: Buffer
  ar: Buffer
}

export interface EmuMf1AntiColl {
  /** The sak of emulator. */
  sak: Buffer
  /** The atqa of emulator. */
  atqa: Buffer
  /** The uid of emulator. */
  uid: Buffer
}

export interface EmuMf1Config {
  detection: boolean
  gen1a: boolean
  gen2: boolean
  block0AntiColl: boolean
  write: EmuMf1WriteMode
}

export interface EmuMf1Data {
  antiColl: EmuMf1AntiColl
  config: EmuMf1Config
  body: Buffer
}

export interface SlotConfig {
  config: { activated: number }
  group: Array<{
    enable: boolean
    hfTagType: TagType
    lfTagType: TagType
  }>
}

export interface BatteryInfo {
  voltage: number
  level: number
}

export interface SlotInfo {
  hfTagType: TagType
  lfTagType: TagType
}

export interface Mf1NtDistance {
  uid: Buffer
  distance: Buffer
}

// Answer the random number parameters required for Nested attack
export interface Mf1NestedCore {
  nt1: Buffer // Unblocked explicitly random number
  nt2: Buffer // Random number of nested verification encryption
  par: Buffer // The puppet test of the communication process of nested verification encryption, only the "low 3 digits', that is, the right 3
}

export interface Mf1DarksideCore {
  uid: Buffer
  nt: Buffer
  pars: Buffer
  kses: Buffer
  nr: Buffer
  ar: Buffer
}

export interface DeviceSettingsV5 {
  version: number
  animation: number
  buttonPressAction: ButtonAction[]
  buttonLongPressAction: ButtonAction[]
  blePairingMode: boolean
  blePairingKey: string
}

export type DeviceSettings = DeviceSettingsV5
