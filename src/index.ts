/** version of chameleon-ultra.js SDK */
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
  HidProxFormat,
  HidProxFormatName,
  Mf1EmuWriteMode,
  Mf1KeyType,
  Mf1PrngType,
  Mf1VblockOperator,
  MfuMaxPage,
  NxpMfuType,
  NxpMfuTypeName,
  Slot,
  TagType,
} from './enums'
