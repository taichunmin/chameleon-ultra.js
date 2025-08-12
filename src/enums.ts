import * as _ from 'lodash-es'
import { type ValueOf } from 'type-fest'
import { type EnumLike } from './types'

export const BYTES_PER_MF1_KEY = 6

export enum AnimationMode {
  FULL = 0,
  SHORT = 1,
  NONE = 2,
}

export enum ButtonAction {
  /** No Function */
  DISABLE = 0,
  /** Select next slot */
  CYCLE_SLOT_INC = 1,
  /** Select previous slot */
  CYCLE_SLOT_DEC = 2,
  /** Read then simulate the ID/UID card number */
  CLONE_IC_UID = 3,
  /** Show Battery Level */
  BATTERY = 4,
}

export enum ButtonType {
  BUTTON_A = 0x41,
  BUTTON_B = 0x42,
}

export enum Cmd {
  GET_APP_VERSION = 1000,
  CHANGE_DEVICE_MODE = 1001,
  GET_DEVICE_MODE = 1002,
  SET_ACTIVE_SLOT = 1003,
  SET_SLOT_TAG_TYPE = 1004,
  SET_SLOT_DATA_DEFAULT = 1005,
  SET_SLOT_ENABLE = 1006,
  SET_SLOT_TAG_NICK = 1007,
  GET_SLOT_TAG_NICK = 1008,
  SLOT_DATA_CONFIG_SAVE = 1009,
  ENTER_BOOTLOADER = 1010,
  GET_DEVICE_CHIP_ID = 1011,
  GET_DEVICE_ADDRESS = 1012,
  SAVE_SETTINGS = 1013,
  RESET_SETTINGS = 1014,
  SET_ANIMATION_MODE = 1015,
  GET_ANIMATION_MODE = 1016,
  GET_GIT_VERSION = 1017,
  GET_ACTIVE_SLOT = 1018,
  GET_SLOT_INFO = 1019,
  WIPE_FDS = 1020,
  DELETE_SLOT_TAG_NICK = 1021,
  GET_ENABLED_SLOTS = 1023,
  DELETE_SLOT_SENSE_TYPE = 1024,
  GET_BATTERY_INFO = 1025,
  GET_BUTTON_PRESS_CONFIG = 1026,
  SET_BUTTON_PRESS_CONFIG = 1027,
  GET_LONG_BUTTON_PRESS_CONFIG = 1028,
  SET_LONG_BUTTON_PRESS_CONFIG = 1029,
  SET_BLE_PAIRING_KEY = 1030,
  GET_BLE_PAIRING_KEY = 1031,
  DELETE_ALL_BLE_BONDS = 1032,
  GET_DEVICE_MODEL = 1033,
  GET_DEVICE_SETTINGS = 1034,
  GET_DEVICE_CAPABILITIES = 1035,
  GET_BLE_PAIRING_ENABLE = 1036,
  SET_BLE_PAIRING_ENABLE = 1037,
  GET_ALL_SLOT_NICKS = 1038,

  HF14A_SCAN = 2000,
  MF1_DETECT_SUPPORT = 2001,
  MF1_DETECT_NT_LEVEL = 2002,
  MF1_STATIC_NESTED_ACQUIRE = 2003,
  MF1_DARKSIDE_ACQUIRE = 2004,
  MF1_DETECT_NT_DIST = 2005,
  MF1_NESTED_ACQUIRE = 2006,
  MF1_AUTH_ONE_KEY_BLOCK = 2007,
  MF1_READ_ONE_BLOCK = 2008,
  MF1_WRITE_ONE_BLOCK = 2009,
  HF14A_RAW = 2010,
  MF1_MANIPULATE_VALUE_BLOCK = 2011,
  MF1_CHECK_KEYS_OF_SECTORS = 2012,
  MF1_HARDNESTED_ACQUIRE = 2013,
  MF1_ENC_NESTED_ACQUIRE = 2014,
  MF1_CHECK_KEYS_ON_BLOCK = 2015,

  EM410X_SCAN = 3000,
  EM410X_WRITE_TO_T55XX = 3001,
  HIDPROX_SCAN = 3002,
  HIDPROX_WRITE_TO_T55XX = 3003,

  MF1_WRITE_EMU_BLOCK_DATA = 4000,
  HF14A_SET_ANTI_COLL_DATA = 4001,
  MF1_SET_ANTI_COLLISION_INFO = 4002,
  MF1_SET_ATS_RESOURCE = 4003,
  MF1_SET_DETECTION_ENABLE = 4004,
  MF1_GET_DETECTION_COUNT = 4005,
  MF1_GET_DETECTION_LOG = 4006,
  MF1_GET_DETECTION_ENABLE = 4007,
  MF1_READ_EMU_BLOCK_DATA = 4008,
  MF1_GET_EMULATOR_CONFIG = 4009,
  MF1_GET_GEN1A_MODE = 4010,
  MF1_SET_GEN1A_MODE = 4011,
  MF1_GET_GEN2_MODE = 4012,
  MF1_SET_GEN2_MODE = 4013,
  HF14A_GET_BLOCK_ANTI_COLL_MODE = 4014,
  HF14A_SET_BLOCK_ANTI_COLL_MODE = 4015,
  MF1_GET_WRITE_MODE = 4016,
  MF1_SET_WRITE_MODE = 4017,
  HF14A_GET_ANTI_COLL_DATA = 4018,
  MF0_NTAG_GET_UID_MAGIC_MODE = 4019,
  MF0_NTAG_SET_UID_MAGIC_MODE = 4020,
  MF0_NTAG_READ_EMU_PAGE_DATA = 4021,
  MF0_NTAG_WRITE_EMU_PAGE_DATA = 4022,
  MF0_NTAG_GET_VERSION_DATA = 4023,
  MF0_NTAG_SET_VERSION_DATA = 4024,
  MF0_NTAG_GET_SIGNATURE_DATA = 4025,
  MF0_NTAG_SET_SIGNATURE_DATA = 4026,
  MF0_NTAG_GET_COUNTER_DATA = 4027,
  MF0_NTAG_SET_COUNTER_DATA = 4028,
  MF0_NTAG_RESET_AUTH_CNT = 4029,
  MF0_NTAG_GET_PAGE_COUNT = 4030,
  MF0_NTAG_GET_WRITE_MODE = 4031,
  MF0_NTAG_SET_WRITE_MODE = 4032,

  EM410X_SET_EMU_ID = 5000,
  EM410X_GET_EMU_ID = 5001,
  HIDPROX_SET_EMU_ID = 5002,
  HIDPROX_GET_EMU_ID = 5003,
}

export enum DarksideStatus {
  /** normal process */
  OK = 0,
  /** the random number cannot be fixed, this situation may appear on some UID card */
  CANT_FIX_NT = 1,
  /** the direct authentification is successful, maybe the key is just the default one */
  LUCKY_AUTH_OK = 2,
  /** the card does not respond to NACK, it may be a card that fixes Nack logic vulnerabilities */
  NO_NAK_SENT = 3,
  /** card change while running DARKSIDE */
  TAG_CHANGED = 4,
}

export enum DeviceMode {
  TAG = 0,
  READER = 1,
}

export enum DeviceModel {
  ULTRA = 0,
  LITE = 1,
}

export enum DfuFwId {
  BOOTLOADER = 0x00,
  APPLICATION = 0x01,
  SOFTDEVICE = 0x02,
}

export enum DfuFwType {
  SOFTDEVICE = 0x00,
  APPLICATION = 0x01,
  BOOTLOADER = 0x02,
  UNKNOWN = 0xFF,
}

export enum DfuObjType {
  /** Invalid object type. */
  INVALID = 0,
  /** Command object. */
  COMMAND = 1,
  /** Data object. */
  DATA = 2,
}

export enum DfuOp {
  /** Retrieve protocol version. */
  PROTOCOL_VERSION = 0x00,
  /** Create selected object. */
  OBJECT_CREATE = 0x01,
  /** Set receipt notification. */
  RECEIPT_NOTIF_SET = 0x02,
  /** Request CRC of selected object. */
  CRC_GET = 0x03,
  /** Execute selected object. */
  OBJECT_EXECUTE = 0x04,
  /** Select object. */
  OBJECT_SELECT = 0x06,
  /** Retrieve MTU size. */
  MTU_GET = 0x07,
  /** Write selected object. */
  OBJECT_WRITE = 0x08,
  /** Ping. */
  PING = 0x09,
  /** Retrieve hardware version. */
  HARDWARE_VERSION = 0x0A,
  /** Retrieve firmware version. */
  FIRMWARE_VERSION = 0x0B,
  /** Abort the DFU procedure. */
  ABORT = 0x0C,
  /** Response. */
  RESPONSE = 0x60,
  /** Invalid opcode. */
  INVALID = 0xFF,
}

export enum DfuResCode {
  /** Invalid opcode. */
  INVALID = 0x00,
  /** Operation successful. */
  SUCCESS = 0x01,
  /** Opcode not supported. */
  OP_CODE_NOT_SUPPORTED = 0x02,
  /** Missing or invalid parameter value. */
  INVALID_PARAMETER = 0x03,
  /** Not enough memory for the data object. */
  INSUFFICIENT_RESOURCES = 0x04,
  /** Data object does not match the firmware and hardware requirements, the signature is wrong, or parsing the command failed. */
  INVALID_OBJECT = 0x05,
  /** Not a valid object type for a Create request. */
  UNSUPPORTED_TYPE = 0x07,
  /** The state of the DFU process does not allow this operation. */
  OPERATION_NOT_PERMITTED = 0x08,
  /** Operation failed. */
  OPERATION_FAILED = 0x0A,
  /** Extended error. The next byte of the response contains the error code of the extended error. */
  EXT_ERROR = 0x0B,
  /** No extended error code has been set. This error indicates an implementation problem. */
  NO_ERROR = 0x0B00,
  /** Invalid error code. This error code should never be used outside of development. */
  INVALID_ERROR_CODE = 0x0B01,
  /** The format of the command was incorrect. This error code is not used in the current implementation, because NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED and NRF_DFU_RES_CODE_INVALID_PARAMETER cover all possible format errors. */
  WRONG_COMMAND_FORMAT = 0x0B02,
  /** The command was successfully parsed, but it is not supported or unknown. */
  UNKNOWN_COMMAND = 0x0B03,
  /** The init command is invalid. The init packet either has an invalid update type or it is missing required fields for the update type (for example, the init packet for a SoftDevice update is missing the SoftDevice size field). */
  INIT_COMMAND_INVALID = 0x0B04,
  /** The firmware version is too low. For an application or SoftDevice, the version must be greater than or equal to the current version. For a bootloader, it must be greater than the current version. to the current version. This requirement prevents downgrade attacks. */
  FW_VERSION_FAILURE = 0x0B05,
  /** The hardware version of the device does not match the required hardware version for the update. */
  HW_VERSION_FAILURE = 0x0B06,
  /** The array of supported SoftDevices for the update does not contain the FWID of the current SoftDevice or the first FWID is '0' on a bootloader which requires the SoftDevice to be present. */
  SD_VERSION_FAILURE = 0x0B07,
  /** The init packet does not contain a signature. This error code is not used in the current implementation, because init packets without a signature are regarded as invalid. */
  SIGNATURE_MISSING = 0x0B08,
  /** The hash type that is specified by the init packet is not supported by the DFU bootloader. */
  WRONG_HASH_TYPE = 0x0B09,
  /** The hash of the firmware image cannot be calculated. */
  HASH_FAILED = 0x0B0A,
  /** The type of the signature is unknown or not supported by the DFU bootloader. */
  WRONG_SIGNATURE_TYPE = 0x0B0B,
  /** The hash of the received firmware image does not match the hash in the init packet. */
  VERIFICATION_FAILED = 0x0B0C,
  /** The available space on the device is insufficient to hold the firmware. */
  INSUFFICIENT_SPACE = 0x0B0D,
}

export enum FreqType {
  /** No Freq */
  NONE = 0,
  /** Low Freq: 125 kHz */
  LF = 1,
  /** High Freq: 13.56 MHz */
  HF = 2,
}

export enum HidProxFormat {
  /** HID H10301 26-bit */
  H10301 = 1,
  /** Indala 26-bit */
  IND26 = 2,
  /** Indala 27-bit */
  IND27 = 3,
  /** Indala ASC 27-bit */
  INDASC27 = 4,
  /** Tecom 27-bit */
  TECOM27 = 5,
  /** 2804 Wiegand 28-bit */
  W2804 = 6,
  /** Indala 29-bit */
  IND29 = 7,
  /** ATS Wiegand 30-bit */
  ATSW30 = 8,
  /** HID ADT 31-bit */
  ADT31 = 9,
  /** HID Check Point 32-bit */
  HCP32 = 10,
  /** HID Hewlett-Packard 32-bit */
  HPP32 = 11,
  /** Kastle 32-bit */
  KASTLE = 12,
  /** Indala/Kantech KFS 32-bit */
  KANTECH = 13,
  /** Wiegand 32-bit */
  WIE32 = 14,
  /** HID D10202 33-bit */
  D10202 = 15,
  /** HID H10306 34-bit */
  H10306 = 16,
  /** Honeywell/Northern N10002 34-bit */
  N10002 = 17,
  /** Indala Optus 34-bit */
  OPTUS34 = 18,
  /** Cardkey Smartpass 34-bit */
  SMP34 = 19,
  /** BQT 34-bit */
  BQT34 = 20,
  /** HID Corporate 1000 35-bit Std */
  C1K35S = 21,
  /** HID KeyScan 36-bit */
  C15001 = 22,
  /** HID Simplex 36-bit */
  S12906 = 23,
  /** HID 36-bit Siemens */
  SIE36 = 24,
  /** HID H10320 37-bit BCD */
  H10320 = 25,
  /** HID H10302 37-bit huge ID */
  H10302 = 26,
  /** HID H10304 37-bit */
  H10304 = 27,
  /** HID P10004 37-bit PCSC */
  P10004 = 28,
  /** HID Generic 37-bit */
  HGEN37 = 29,
  /** PointGuard MDI 37-bit */
  MDI37 = 30,
}

export enum Mf1EmuWriteMode {
  /** Normal write as standard mifare */
  NORMAL = 0,
  /** Send NACK to write attempts */
  DENIED = 1,
  /** Acknowledge writes, but don't remember contents */
  DECEIVE = 2,
  /** Store data to RAM, but not save to persistent storage */
  SHADOW = 3,
  /** Shadow requested, will be changed to SHADOW and stored to ROM */
  SHADOW_REQ = 4,
}

export enum Mf1KeyType {
  KEY_A = 0x60,
  KEY_B = 0x61,
}

export enum Mf1PrngType {
  /** StaticNested: the random number of the card response is fixed */
  STATIC = 0,
  /** Nested: the random number of the card response is weak */
  WEAK = 1,
  /** HardNested: the random number of the card response is unpredictable */
  HARD = 2,
}

/**
 * Operators of mifare classic value block manipulation.
 */
export enum Mf1VblockOperator {
  /** decrement value by X (0 ~ 2147483647) from src to dst */
  DECREMENT = 0xC0,
  /** increment value by X (0 ~ 2147483647) from src to dst */
  INCREMENT = 0xC1,
  /** copy value from src to dst (Restore and Transfer) */
  RESTORE = 0xC2,
}

export enum MfuCmd {
  CHECK_TEARING_EVENT = 0x3E,
  COMP_WRITE = 0xA0,
  FAST_READ = 0x3A,
  GET_VERSION = 0x60,
  INCR_CNT = 0xA5,
  /** 3DES Authentication for MF0ICU2 */
  TDES_AUTH = 0x1A,
  PWD_AUTH = 0x1B,
  READ = 0x30,
  READ_CNT = 0x39,
  READ_SIG = 0x3C,
  VCSL = 0x4B,
  WRITE = 0xA2,
}

export enum MfuEmuWriteMode {
  /** Normal write as standard mifare */
  NORMAL = 0,
  /** Send NACK to write attempts */
  DENIED = 1,
  /** Acknowledge writes, but don't remember contents */
  DECEIVE = 2,
  /** Store data to RAM, but not save to persistent storage */
  SHADOW = 3,
  /** Shadow requested, will be changed to SHADOW and stored to ROM */
  SHADOW_REQ = 4,
}

export enum NxpMfuType {
  UNKNOWN = 0x0,
  UL = 1,
  UL_C = 2,
  UL_EV1_48 = 3,
  UL_EV1_128 = 4,
  NTAG = 5,
  NTAG_203 = 6,
  NTAG_210 = 7,
  NTAG_212 = 8,
  NTAG_213 = 9,
  NTAG_215 = 10,
  NTAG_216 = 11,
  MY_D = 12,
  MY_D_NFC = 13,
  /** my-d move / my-d move NFC */
  MY_D_MOVE = 14,
  MY_D_MOVE_LEAN = 15,
  NTAG_I2C_1K = 16,
  NTAG_I2C_2K = 17,
  NTAG_I2C_1K_PLUS = 18,
  NTAG_I2C_2K_PLUS = 19,
  FUDAN_UL = 20,
  NTAG_213_F = 21,
  NTAG_216_F = 22,
  UL_EV1 = 23,
  UL_NANO_40 = 24,
  NTAG_213_TT = 25,
  NTAG_213_C = 26,
  NTAG_210u = 27,
  UL_AES = 28,
}

export enum TagType {
  // 特定的且必須存在的標誌不存在的類型
  UNDEFINED = 0,
  // 1xx: ASK Tag-Talk-First
  EM410X = 100,
  EM410X_16 = 101,
  EM410X_32 = 102,
  EM410X_64 = 103,
  // 2xx: FSK Tag-Talk-First
  HIDProx = 200,
  // 3xx: PSK Tag-Talk-First
  // 4xx: Reader-Talk-First
  LF_END = 999,
  // 10xx: MIFARE Classic series
  MIFARE_Mini = 1000,
  MIFARE_1024 = 1001,
  MIFARE_2048 = 1002,
  MIFARE_4096 = 1003,
  // 11xx: MFUL / NTAG series
  /** NTAG213 (NT2H1511) */
  NTAG_213 = 1100,
  /** NTAG215 (NT2H1511) */
  NTAG_215 = 1101,
  /** NTAG216 (NT2H1611) */
  NTAG_216 = 1102,
  /** Mifare Ultralight (MF0ICU1) */
  MF0_ICU1 = 1103,
  /** Mifare Ultralight C (MF0ICU2) */
  MF0_ICU2 = 1104,
  /** Mifare Ultralight EV1 (MF0UL11/MF0ULH11) */
  MF0_UL11 = 1105,
  /** Mifare Ultralight EV2 (MF0UL21/MF0ULH21) */
  MF0_UL21 = 1106,
  /** NTAG210 (NT2L1011) */
  NTAG_210 = 1107,
  /** NTAG212 (NT2L1211) */
  NTAG_212 = 1108,
  // 12xx: MIFARE Plus series
  // 13xx: DESFire series
  // 14xx: ST25TA series
  // 15xx: HF14A-4 series
}

export enum Slot {
  SLOT_1 = 0,
  SLOT_2 = 1,
  SLOT_3 = 2,
  SLOT_4 = 3,
  SLOT_5 = 4,
  SLOT_6 = 5,
  SLOT_7 = 6,
  SLOT_8 = 7,
}

export enum UltraResCode {
  /** IC card operation is successful */
  HF_TAG_OK = 0x00,
  /** IC card not found */
  HF_TAG_NOT_FOUND = 0x01,
  /** Abnormal IC card status */
  HF_ERR_STAT = 0x02,
  /** IC card communication verification abnormal */
  HF_ERR_CRC = 0x03,
  /** IC card conflict */
  HF_COLLISION = 0x04,
  /** IC card BCC error */
  HF_ERR_BCC = 0x05,
  /** MF card verification failed */
  MF_ERR_AUTH = 0x06,
  /** IC card parity error */
  HF_ERR_PARITY = 0x07,
  /** ATS should be present but card NAKed, or ATS too large */
  HF_ERR_ATS = 0x08,

  /** LF tag operation is successful */
  LF_TAG_OK = 0x40,
  /** EM410X tag not found error */
  EM410X_TAG_NOT_FOUND = 0x41,
  /** Unable to search for a valid LF tag */
  LF_TAG_NO_FOUND = 0x42,
  /** Unable to search for a valid HIDProx tag */
  HIDPROX_TAG_NO_FOUND = 0x43,

  /** Invalid param error */
  PAR_ERR = 0x60,
  /** Wrong device mode error */
  DEVICE_MODE_ERROR = 0x66,
  /** invalid cmd error */
  INVALID_CMD = 0x67,
  /** Device operation succeeded */
  DEVICE_SUCCESS = 0x68,
  /** Not implemented error */
  NOT_IMPLEMENTED = 0x69,
  /** Flash write failed */
  FLASH_WRITE_FAIL = 0x70,
  /** Flash read failed */
  FLASH_READ_FAIL = 0x71,
  /** Invalid slot type */
  INVALID_SLOT_TYPE = 0x72,
}

export function createIsEnum <T extends EnumLike> (e: T): (val: any) => val is T[keyof T] {
  const ev = new Set(_.values(_.pickBy(e, (v, k) => !_.isNumber(e[v]))))
  return (val: any): val is T[keyof T] => ev.has(val)
}

export function createIsValueOfArr <T extends readonly any[]> (arr: T): (val: any) => val is ValueOf<T> {
  const set = new Set(arr)
  return (val: any): val is ValueOf<T> => set.has(val)
}

export const isAnimationMode = createIsEnum(AnimationMode)
export const isButtonAction = createIsEnum(ButtonAction)
export const isButtonType = createIsEnum(ButtonType)
export const isCmd = createIsEnum(Cmd)
export const isDarksideStatus = createIsEnum(DarksideStatus)
export const isDeviceMode = createIsEnum(DeviceMode)
export const isDeviceModel = createIsEnum(DeviceModel)
export const isDfuFwId = createIsEnum(DfuFwId)
export const isFreqType = createIsEnum(FreqType)
export const isMf1EmuWriteMode = createIsEnum(Mf1EmuWriteMode)
export const isMf1KeyType = createIsEnum(Mf1KeyType)
export const isMf1PrngType = createIsEnum(Mf1PrngType)
export const isMf1VblockOperator = createIsEnum(Mf1VblockOperator)
export const isMfuEmuWriteMode = createIsEnum(MfuEmuWriteMode)
export const isSlot = createIsEnum(Slot)
export const isTagType = createIsEnum(TagType)
export const isUltraResCode = createIsEnum(UltraResCode)

export const isFailedUltraResCode = createIsValueOfArr([
  UltraResCode.HF_TAG_NOT_FOUND,
  UltraResCode.HF_ERR_STAT,
  UltraResCode.HF_ERR_CRC,
  UltraResCode.HF_COLLISION,
  UltraResCode.HF_ERR_BCC,
  UltraResCode.MF_ERR_AUTH,
  UltraResCode.HF_ERR_PARITY,
  UltraResCode.HF_ERR_ATS,
  UltraResCode.EM410X_TAG_NOT_FOUND,
  UltraResCode.LF_TAG_NO_FOUND,
  UltraResCode.HIDPROX_TAG_NO_FOUND,
  UltraResCode.PAR_ERR,
  UltraResCode.DEVICE_MODE_ERROR,
  UltraResCode.INVALID_CMD,
  UltraResCode.NOT_IMPLEMENTED,
  UltraResCode.FLASH_WRITE_FAIL,
  UltraResCode.FLASH_READ_FAIL,
  UltraResCode.INVALID_SLOT_TYPE,
] as const)
export const isMfuEmuTagType = createIsValueOfArr([
  TagType.MF0_ICU1,
  TagType.MF0_ICU2,
  TagType.MF0_UL11,
  TagType.MF0_UL21,
  TagType.NTAG_210,
  TagType.NTAG_212,
  TagType.NTAG_213,
  TagType.NTAG_215,
  TagType.NTAG_216,
] as const)
export const isValidDfuObjType = createIsValueOfArr([
  DfuObjType.COMMAND,
  DfuObjType.DATA,
] as const)
export const isValidFreqType = createIsValueOfArr([
  FreqType.HF,
  FreqType.LF,
] as const)

export const TagTypeLfIdLen = new Map<TagType, number>([
  [TagType.EM410X, 5],
  [TagType.EM410X_16, 5],
  [TagType.EM410X_32, 5],
  [TagType.EM410X_64, 5],
])

// facility, id, issueLevel, oem
export const HidProxFormatLimit = new Map<HidProxFormat, [number, number, number, number]>([
  [HidProxFormat.H10301, [0xFF, 0xFFFF, 0, 0]],
  [HidProxFormat.IND26, [0xFFF, 0xFFF, 0, 0]],
  [HidProxFormat.IND27, [0x1FFF, 0x3FFF, 0, 0]],
  [HidProxFormat.INDASC27, [0x1FFF, 0x3FFF, 0, 0]],
  [HidProxFormat.TECOM27, [0x7FF, 0xFFFF, 0, 0]],
  [HidProxFormat.W2804, [0xFF, 0x7FFF, 0, 0]],
  [HidProxFormat.IND29, [0x1FFF, 0xFFFF, 0, 0]],
  [HidProxFormat.ATSW30, [0xFFF, 0xFFFF, 0, 0]],
  [HidProxFormat.ADT31, [0xF, 0x7FFFFF, 0, 0]],
  [HidProxFormat.HCP32, [0, 0x3FFF, 0, 0]],
  [HidProxFormat.HPP32, [0xFFF, 0x7FFFF, 0, 0]],
  [HidProxFormat.KASTLE, [0xFF, 0xFFFF, 0x1F, 0]],
  [HidProxFormat.KANTECH, [0xFF, 0xFFFF, 0, 0]],
  [HidProxFormat.WIE32, [0xFFF, 0xFFFF, 0, 0]],
  [HidProxFormat.D10202, [0x7F, 0xFFFFFF, 0, 0]],
  [HidProxFormat.H10306, [0xFFFF, 0xFFFF, 0, 0]],
  [HidProxFormat.N10002, [0xFFFF, 0xFFFF, 0, 0]],
  [HidProxFormat.OPTUS34, [0x3FF, 0xFFFF, 0, 0]],
  [HidProxFormat.SMP34, [0x3FF, 0xFFFF, 0x7, 0]],
  [HidProxFormat.BQT34, [0xFF, 0xFFFFFF, 0, 0]],
  [HidProxFormat.C1K35S, [0xFFF, 0xFFFFF, 0, 0]],
  [HidProxFormat.C15001, [0xFF, 0xFFFF, 0, 0x3FF]],
  [HidProxFormat.S12906, [0xFF, 0xFFFFFF, 0x3, 0]],
  [HidProxFormat.SIE36, [0x3FFFF, 0xFFFF, 0, 0]],
  [HidProxFormat.H10320, [0, 99999999, 0, 0]],
  [HidProxFormat.H10302, [0, 0x7FFFFFFFF, 0, 0]],
  [HidProxFormat.H10304, [0xFFFF, 0x7FFFF, 0, 0]],
  [HidProxFormat.P10004, [0x1FFF, 0x3FFFF, 0, 0]],
  [HidProxFormat.HGEN37, [0, 0xFFFFFFFF, 0, 0]],
  [HidProxFormat.MDI37, [0xF, 0x1FFFFFFF, 0, 0]],
])

export const HidProxFormatName = new Map<HidProxFormat, string>([
  [HidProxFormat.H10301, 'HID H10301 26-bit'],
  [HidProxFormat.IND26, 'Indala 26-bit'],
  [HidProxFormat.IND27, 'Indala 27-bit'],
  [HidProxFormat.INDASC27, 'Indala ASC 27-bit'],
  [HidProxFormat.TECOM27, 'Tecom 27-bit'],
  [HidProxFormat.W2804, '2804 Wiegand 28-bit'],
  [HidProxFormat.IND29, 'Indala 29-bit'],
  [HidProxFormat.ATSW30, 'ATS Wiegand 30-bit'],
  [HidProxFormat.ADT31, 'HID ADT 31-bit'],
  [HidProxFormat.HCP32, 'HID Check Point 32-bit'],
  [HidProxFormat.HPP32, 'HID Hewlett-Packard 32-bit'],
  [HidProxFormat.KASTLE, 'Kastle 32-bit'],
  [HidProxFormat.KANTECH, 'Indala/Kantech KFS 32-bit'],
  [HidProxFormat.WIE32, 'Wiegand 32-bit'],
  [HidProxFormat.D10202, 'HID D10202 33-bit'],
  [HidProxFormat.H10306, 'HID H10306 34-bit'],
  [HidProxFormat.N10002, 'Honeywell/Northern N10002 34-bit'],
  [HidProxFormat.OPTUS34, 'Indala Optus 34-bit'],
  [HidProxFormat.SMP34, 'Cardkey Smartpass 34-bit'],
  [HidProxFormat.BQT34, 'BQT 34-bit'],
  [HidProxFormat.C1K35S, 'HID Corporate 1000 35-bit Std'],
  [HidProxFormat.C15001, 'HID KeyScan 36-bit'],
  [HidProxFormat.S12906, 'HID Simplex 36-bit'],
  [HidProxFormat.SIE36, 'HID 36-bit Siemens'],
  [HidProxFormat.H10320, 'HID H10320 37-bit BCD'],
  [HidProxFormat.H10302, 'HID H10302 37-bit huge ID'],
  [HidProxFormat.H10304, 'HID H10304 37-bit'],
  [HidProxFormat.P10004, 'HID P10004 37-bit PCSC'],
  [HidProxFormat.HGEN37, 'HID Generic 37-bit'],
  [HidProxFormat.MDI37, 'PointGuard MDI 37-bit'],
])

export const MfuVerToNxpMfuType = new Map([
  ['0004030101000B', NxpMfuType.UL_EV1_48],
  ['0004030101000E', NxpMfuType.UL_EV1_128],
  ['0004030102000B', NxpMfuType.UL_NANO_40],
  ['0004030104000F03', NxpMfuType.UL_AES],
  ['0004030201000B', NxpMfuType.UL_EV1_48],
  ['0004030201000E', NxpMfuType.UL_EV1_128],
  ['0004040101000B', NxpMfuType.NTAG_210],
  ['0004040101000E', NxpMfuType.NTAG_212],
  ['0004040102000B', NxpMfuType.NTAG_210u],
  ['0004040201000F', NxpMfuType.NTAG_213],
  ['00040402010011', NxpMfuType.NTAG_215],
  ['00040402010013', NxpMfuType.NTAG_216],
  ['0004040201010F', NxpMfuType.NTAG_213_C],
  ['0004040202000B', NxpMfuType.NTAG_210u],
  ['0004040203000F', NxpMfuType.NTAG_213_TT],
  ['0004040401000F', NxpMfuType.NTAG_213_F],
  ['00040404010013', NxpMfuType.NTAG_216_F],
  ['00040405020113', NxpMfuType.NTAG_I2C_1K],
  ['00040405020115', NxpMfuType.NTAG_I2C_2K],
  ['00040405020213', NxpMfuType.NTAG_I2C_1K_PLUS],
  ['00040405020215', NxpMfuType.NTAG_I2C_2K_PLUS],
  ['0034210101000E', NxpMfuType.UL_EV1_128], // Mikron JSC Russia EV1 41 pages tag
  ['0053040201000F', NxpMfuType.NTAG_213], // Shanghai Feiju Microelectronics Co. Ltd. China (Xiaomi Air Purifier filter)
])

/**
 * Get the maximum page number of a specific mifare ultralight tag type.
 */
export const MfuMaxPage = new Map<NxpMfuType | TagType, number>([
  [NxpMfuType.FUDAN_UL, 0x10],
  [NxpMfuType.MY_D_MOVE_LEAN, 0x10],
  [NxpMfuType.MY_D_MOVE, 0x26],
  [NxpMfuType.MY_D_NFC, 0x100],
  [NxpMfuType.MY_D, 0x10],
  [NxpMfuType.NTAG_203, 0x2A],
  [NxpMfuType.NTAG_210, 0x14],
  [NxpMfuType.NTAG_210u, 0x14],
  [NxpMfuType.NTAG_212, 0x29],
  [NxpMfuType.NTAG_213_C, 0x2D],
  [NxpMfuType.NTAG_213_F, 0x2D],
  [NxpMfuType.NTAG_213_TT, 0x2D],
  [NxpMfuType.NTAG_213, 0x2D],
  [NxpMfuType.NTAG_215, 0x87],
  [NxpMfuType.NTAG_216_F, 0xE7],
  [NxpMfuType.NTAG_216, 0xE7],
  [NxpMfuType.NTAG_I2C_1K_PLUS, 0xEA],
  [NxpMfuType.NTAG_I2C_1K, 0xEA],
  [NxpMfuType.NTAG_I2C_2K_PLUS, 0xEA],
  [NxpMfuType.NTAG_I2C_2K, 0xEA],
  [NxpMfuType.UL_AES, 0x38],
  [NxpMfuType.UL_C, 0x30],
  [NxpMfuType.UL_EV1_128, 0x29],
  [NxpMfuType.UL_EV1_48, 0x14],
  [NxpMfuType.UL_EV1, 0x14],
  [NxpMfuType.UL_NANO_40, 0x0B],
  [NxpMfuType.UL, 0x10],
  [TagType.MF0_ICU1, 0x10],
  [TagType.MF0_ICU2, 0x30],
  [TagType.MF0_UL11, 0x14],
  [TagType.MF0_UL21, 0x29],
  [TagType.NTAG_210, 0x14],
  [TagType.NTAG_212, 0x29],
  [TagType.NTAG_213, 0x2D],
  [TagType.NTAG_215, 0x87],
  [TagType.NTAG_216, 0xE7],
])

export const NxpMfuTypeName = new Map<NxpMfuType | TagType, string>([
  [NxpMfuType.FUDAN_UL, 'FUDAN Ultralight Compatible (or other compatible)'],
  [NxpMfuType.MY_D_MOVE_LEAN, 'INFINEON my-d™ move lean (SLE 66R01L)'],
  [NxpMfuType.MY_D_MOVE, 'INFINEON my-d™ move (SLE 66R01P) / INFINEON my-d™ move NFC (SLE 66R01P)'],
  [NxpMfuType.MY_D_NFC, 'INFINEON my-d™ NFC (SLE 66RxxP)'],
  [NxpMfuType.MY_D, 'INFINEON my-d™ (SLE 66RxxS)'],
  [NxpMfuType.NTAG_203, 'NTAG 203 144bytes (NT2H0301F0DT)'],
  [NxpMfuType.NTAG_210, 'NTAG 210 48bytes (NT2L1011G0DU)'],
  [NxpMfuType.NTAG_210u, 'NTAG 210u (micro) 48bytes (NT2L1001G0DU)'],
  [NxpMfuType.NTAG_212, 'NTAG 212 128bytes (NT2L1211G0DU)'],
  [NxpMfuType.NTAG_213_C, 'NTAG 213C 144bytes (NT2H1311C1DTL)'],
  [NxpMfuType.NTAG_213_F, 'NTAG 213F 144bytes (NT2H1311F0DTL)'],
  [NxpMfuType.NTAG_213_TT, 'NTAG 213TT 144bytes (NT2H1311TTDU)'],
  [NxpMfuType.NTAG_213, 'NTAG 213 144bytes (NT2H1311G0DU)'],
  [NxpMfuType.NTAG_215, 'NTAG 215 504bytes (NT2H1511G0DU)'],
  [NxpMfuType.NTAG_216_F, 'NTAG 216F 888bytes (NT2H1611F0DTL)'],
  [NxpMfuType.NTAG_216, 'NTAG 216 888bytes (NT2H1611G0DU)'],
  [NxpMfuType.NTAG_I2C_1K_PLUS, 'NTAG I2C plus 888bytes (NT3H2111FHK)'],
  [NxpMfuType.NTAG_I2C_1K, 'NTAG I2C 888bytes (NT3H1101FHK)'],
  [NxpMfuType.NTAG_I2C_2K_PLUS, 'NTAG I2C plus 1912bytes (NT3H2211FHK)'],
  [NxpMfuType.NTAG_I2C_2K, 'NTAG I2C 1904bytes (NT3H1201FHK)'],
  [NxpMfuType.NTAG, 'NTAG UNKNOWN'],
  [NxpMfuType.UL_AES, 'MIFARE Ultralight AES'],
  [NxpMfuType.UL_C, 'MIFARE Ultralight C (MF0ULC)'],
  [NxpMfuType.UL_EV1_128, 'MIFARE Ultralight EV1 128bytes (MF0UL2101)'],
  [NxpMfuType.UL_EV1_48, 'MIFARE Ultralight EV1 48bytes (MF0UL1101)'],
  [NxpMfuType.UL_EV1, 'MIFARE Ultralight EV1 UNKNOWN'],
  [NxpMfuType.UL_NANO_40, 'MIFARE Ultralight Nano 40bytes (MF0UNH00)'],
  [NxpMfuType.UL, 'MIFARE Ultralight (MF0ICU1)'],
  [TagType.MF0_ICU1, 'MIFARE Ultralight (MF0ICU1)'],
  [TagType.MF0_ICU2, 'MIFARE Ultralight C (MF0ULC)'],
  [TagType.MF0_UL11, 'MIFARE Ultralight EV1 48bytes (MF0UL1101)'],
  [TagType.MF0_UL21, 'MIFARE Ultralight EV1 128bytes (MF0UL2101)'],
  [TagType.NTAG_210, 'NTAG 210 48bytes (NT2L1011G0DU)'],
  [TagType.NTAG_212, 'NTAG 212 128bytes (NT2L1211G0DU)'],
  [TagType.NTAG_213, 'NTAG 213 144bytes (NT2H1311G0DU)'],
  [TagType.NTAG_215, 'NTAG 215 504bytes (NT2H1511G0DU)'],
  [TagType.NTAG_216, 'NTAG 216 888bytes (NT2H1611G0DU)'],
])

/**
 * @see [MIFARE type identification procedure](https://www.nxp.com/docs/en/application-note/AN10833.pdf)
 */
export const NxpTypeBySak = new Map([
  [0x00, 'MIFARE Ultralight Classic/C/EV1/Nano | NTAG 2xx'],
  [0x08, 'MIFARE Classic 1K | Plus SE 1K | Plug S 2K | Plus X 2K'],
  [0x09, 'MIFARE Mini 0.3k'],
  [0x10, 'MIFARE Plus 2K'],
  [0x11, 'MIFARE Plus 4K'],
  [0x18, 'MIFARE Classic 4K | Plus S 4K | Plus X 4K'],
  [0x19, 'MIFARE Classic 2K'],
  [0x20, 'MIFARE Plus EV1/EV2 | DESFire EV1/EV2/EV3 | DESFire Light | NTAG 4xx | MIFARE Plus S 2/4K | MIFARE Plus X 2/4K | MIFARE Plus SE 1K'],
  [0x28, 'SmartMX with MIFARE Classic 1K'],
  [0x38, 'SmartMX with MIFARE Classic 4K'],
])

export const UltraErrMsg = new Map([
  [UltraResCode.HF_TAG_OK, 'HF tag operation succeeded'],
  [UltraResCode.HF_TAG_NOT_FOUND, 'HF tag not found'],
  [UltraResCode.HF_ERR_STAT, 'HF tag status error'],
  [UltraResCode.HF_ERR_CRC, 'HF tag data crc error'],
  [UltraResCode.HF_COLLISION, 'HF tag collision'],
  [UltraResCode.HF_ERR_BCC, 'HF tag uid bcc error'],
  [UltraResCode.MF_ERR_AUTH, 'HF tag auth failed'],
  [UltraResCode.HF_ERR_PARITY, 'HF tag data parity error'],
  [UltraResCode.HF_ERR_ATS, 'HF tag was supposed to send ATS but didn\'t'],

  [UltraResCode.LF_TAG_OK, 'LF tag operation succeeded'],
  [UltraResCode.EM410X_TAG_NOT_FOUND, 'EM410x tag not found'],
  [UltraResCode.LF_TAG_NO_FOUND, 'LF tag not found'],
  [UltraResCode.HIDPROX_TAG_NO_FOUND, 'HIDProx tag not found'],

  [UltraResCode.PAR_ERR, 'invalid param'],
  [UltraResCode.DEVICE_MODE_ERROR, 'wrong device mode'],
  [UltraResCode.INVALID_CMD, 'invalid cmd'],
  [UltraResCode.DEVICE_SUCCESS, 'Device operation succeeded'],
  [UltraResCode.NOT_IMPLEMENTED, 'Not implemented'],
  [UltraResCode.FLASH_WRITE_FAIL, 'Flash write failed'],
  [UltraResCode.FLASH_READ_FAIL, 'Flash read failed'],
  [UltraResCode.INVALID_SLOT_TYPE, 'Invalid slot tagType'],
])

export const DfuErrMsg = new Map<number, string>([
  // DFU operation result code.
  [DfuResCode.INVALID, 'Invalid opcode'],
  [DfuResCode.SUCCESS, 'Operation successful'],
  [DfuResCode.OP_CODE_NOT_SUPPORTED, 'Opcode not supported'],
  [DfuResCode.INVALID_PARAMETER, 'Missing or invalid parameter value'],
  [DfuResCode.INSUFFICIENT_RESOURCES, 'Not enough memory for the data object'],
  [DfuResCode.INVALID_OBJECT, 'Data object does not match the firmware and hardware requirements, the signature is wrong, or parsing the command failed'],
  [DfuResCode.UNSUPPORTED_TYPE, 'Not a valid object type for a Create request'],
  [DfuResCode.OPERATION_NOT_PERMITTED, 'The state of the DFU process does not allow this operation'],
  [DfuResCode.OPERATION_FAILED, 'Operation failed'],
  [DfuResCode.EXT_ERROR, 'Extended error'],

  // DFU extended error code.
  [DfuResCode.NO_ERROR, 'No extended error code has been set. This error indicates an implementation problem'],
  [DfuResCode.INVALID_ERROR_CODE, 'Invalid error code. This error code should never be used outside of development'],
  [DfuResCode.WRONG_COMMAND_FORMAT, 'The format of the command was incorrect. This error code is not used in the current implementation, because NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED and NRF_DFU_RES_CODE_INVALID_PARAMETER cover all possible format errors'],
  [DfuResCode.UNKNOWN_COMMAND, 'The command was successfully parsed, but it is not supported or unknown'],
  [DfuResCode.INIT_COMMAND_INVALID, 'The init command is invalid. The init packet either has an invalid update type or it is missing required fields for the update type (for example, the init packet for a SoftDevice update is missing the SoftDevice size field)'],
  [DfuResCode.FW_VERSION_FAILURE, 'The firmware version is too low. For an application or SoftDevice, the version must be greater than or equal to the current version. For a bootloader, it must be greater than the current version. to the current version. This requirement prevents downgrade attacks'],
  [DfuResCode.HW_VERSION_FAILURE, 'The hardware version of the device does not match the required hardware version for the update'],
  [DfuResCode.SD_VERSION_FAILURE, 'The array of supported SoftDevices for the update does not contain the FWID of the current SoftDevice or the first FWID is "0" on a bootloader which requires the SoftDevice to be present'],
  [DfuResCode.SIGNATURE_MISSING, 'The init packet does not contain a signature. This error code is not used in the current implementation, because init packets without a signature are regarded as invalid'],
  [DfuResCode.WRONG_HASH_TYPE, 'The hash type that is specified by the init packet is not supported by the DFU bootloader'],
  [DfuResCode.HASH_FAILED, 'The hash of the firmware image cannot be calculated'],
  [DfuResCode.WRONG_SIGNATURE_TYPE, 'The type of the signature is unknown or not supported by the DFU bootloader'],
  [DfuResCode.VERIFICATION_FAILED, 'The hash of the received firmware image does not match the hash in the init packet'],
  [DfuResCode.INSUFFICIENT_SPACE, 'The available space on the device is insufficient to hold the firmware'],
])
