import _ from 'lodash'

export interface EnumLike {
  [k: string]: string | number
  [nu: number]: string
}

export function createIsEnum <T extends EnumLike> (e: T): (val: any) => val is T[keyof T] {
  const ev = new Set(_.values(_.pickBy(e, (v, k) => !_.isNumber(e[v]))))
  return (val: any): val is T[keyof T] => ev.has(val)
}

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

  EM410X_SCAN = 3000,
  EM410X_WRITE_TO_T55XX = 3001,

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

  EM410X_SET_EMU_ID = 5000,
  EM410X_GET_EMU_ID = 5001,
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

export enum FreqType {
  /** No Freq */
  NONE = 0,
  /** Low Freq: 125 kHz */
  LF = 1,
  /** High Freq: 13.56 MHz */
  HF = 2,
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

export enum RespStatus {
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

export enum TagType {
  // 特定的且必須存在的標誌不存在的類型
  UNDEFINED = 0,
  // 1xx: ASK Tag-Talk-First
  EM410X = 100,
  // 2xx: FSK Tag-Talk-First
  // 3xx: PSK Tag-Talk-First
  // 4xx: Reader-Talk-First
  LF_END = 999,
  // 10xx: MIFARE Classic series
  MIFARE_Mini = 1000,
  MIFARE_1024 = 1001,
  MIFARE_2048 = 1002,
  MIFARE_4096 = 1003,
  // 11xx: MFUL / NTAG series
  NTAG_213 = 1100,
  NTAG_215 = 1101,
  NTAG_216 = 1102,
  // 12xx: MIFARE Plus series
  // 13xx: DESFire series
  // 14xx: ST25TA series
  // 15xx: HF14A-4 series
}

export const isAnimationMode = createIsEnum(AnimationMode)
export const isButtonAction = createIsEnum(ButtonAction)
export const isButtonType = createIsEnum(ButtonType)
export const isCmd = createIsEnum(Cmd)
export const isDarksideStatus = createIsEnum(DarksideStatus)
export const isDeviceMode = createIsEnum(DeviceMode)
export const isDeviceModel = createIsEnum(DeviceModel)
export const isFreqType = createIsEnum(FreqType)
export const isMf1EmuWriteMode = createIsEnum(Mf1EmuWriteMode)
export const isMf1KeyType = createIsEnum(Mf1KeyType)
export const isMf1PrngType = createIsEnum(Mf1PrngType)
export const isMf1VblockOperator = createIsEnum(Mf1VblockOperator)
export const isRespStatus = createIsEnum(RespStatus)
export const isSlot = createIsEnum(Slot)
export const isTagType = createIsEnum(TagType)
export const isValidFreqType = createIsEnum(_.pick(FreqType, ['HF', 'LF']))
