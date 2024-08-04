/** SDK version of chameleon-ultra.js */
export const version = process.env.VERSION ?? 'unknown'

export { Buffer } from '@taichunmin/buffer'
export { ChameleonUltra } from './ChameleonUltra'
export {
  AnimationMode,
  ButtonAction,
  ButtonType,
  Cmd,
  DarksideStatus,
  DeviceMode,
  DeviceModel,
  DfuFwId,
  DfuFwType,
  DfuObjType,
  FreqType,
  Mf1EmuWriteMode,
  Mf1KeyType,
  Mf1PrngType,
  Mf1VblockOperator,
  MfuMaxPage,
  MfuTagType,
  MfuTagTypeName,
  Slot,
  TagType,
} from './enums'
